import { randomUUID } from 'node:crypto'
import type { CliEvent, CliSessionMetadata, PromptResponse, TeamDefinition, TeamSnapshot } from '../../shared/contracts/cli'
import type { BingoSession, BingoSessionHandlers } from './bingoSession'
import { BingoCommandError } from './bingoSession'

export type ManagedSessionEvent = { connectionId: string; sequence: number; payload: CliEvent }
export type SessionFactory = (handlers: BingoSessionHandlers) => BingoSession

type Active = { connectionId: string; sessionId: string; metadata: CliSessionMetadata; session: BingoSession; sequence: number; turnId: string | null; prompts: Set<string> }

export class SessionManager {
  private active: Active | null = null
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private readonly factory: SessionFactory, private readonly emit: (event: ManagedSessionEvent) => void) {}

  /** Serialize session lifecycle mutations: concurrent opens (e.g. StrictMode
   *  double-effect) would otherwise race close/spawn and wedge the manager. */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.chain.then(operation)
    this.chain = run.then(() => undefined, () => undefined)
    return run
  }

  open(sessionId?: string): Promise<{ connectionId: string; metadata: CliSessionMetadata }> {
    return this.serialize(async () => {
      await this.close()
      const connectionId = randomUUID()
      const session = this.factory({
        onEvent: (event) => this.handleEvent(connectionId, event),
        onExit: () => {
          if (this.active?.connectionId === connectionId) this.active = null
        }
      })
      const metadata = await session.open(sessionId)
      if (!metadata.sessionId) throw new Error('Conversation session.ready did not contain a session ID')
      this.active = { connectionId, sessionId: metadata.sessionId, metadata, session, sequence: 0, turnId: null, prompts: new Set() }
      return { connectionId, metadata }
    })
  }

  async send(connectionId: string, turnId: string, prompt: string): Promise<void> {
    const active = this.requireActive(connectionId)
    if (active.turnId) throw new Error('A turn is already active')
    active.turnId = turnId
    try {
      await active.session.sendTurn(turnId, prompt)
    } catch (error) {
      active.turnId = null
      throw error
    }
  }

  cancel(connectionId: string, turnId: string): Promise<void> {
    const active = this.requireTurn(connectionId, turnId)
    return active.session.cancelTurn(turnId)
  }

  respond(connectionId: string, turnId: string, promptId: string, response: PromptResponse): Promise<void> {
    const active = this.requireTurn(connectionId, turnId)
    if (!active.prompts.delete(promptId)) throw new Error('Prompt is stale or already resolved')
    return active.session.respondToPrompt(turnId, promptId, response)
  }

  rename(sessionId: string, name: string): Promise<CliSessionMetadata> {
    return this.serialize(async () => {
      const active = this.active
      if (active?.sessionId === sessionId) {
        if (active.turnId) throw new Error('Session mutation is only available while idle')
        const metadata = await active.session.rename(name)
        active.sessionId = metadata.sessionId
        active.metadata = metadata
        return metadata
      }
      const session = this.factory({ onEvent: () => undefined, onExit: () => undefined })
      try {
        await session.open(sessionId)
        return await session.rename(name)
      } finally {
        await session.close()
      }
    })
  }

  delete(sessionId: string): Promise<string> {
    return this.serialize(async () => {
      const active = this.active
      if (active?.sessionId === sessionId) {
        if (active.turnId) throw new Error('Session mutation is only available while idle')
        const deletedId = await active.session.delete()
        if (this.active === active) this.active = null
        return deletedId
      }
      const session = this.factory({ onEvent: () => undefined, onExit: () => undefined })
      try {
        await session.open(sessionId)
        return await session.delete()
      } finally {
        await session.close()
      }
    })
  }

  snapshot(): { connectionId: string; sessionId: string; idle: boolean } | null {
    const active = this.active
    return active ? { connectionId: active.connectionId, sessionId: active.sessionId, idle: active.turnId === null } : null
  }

  currentMetadata(): CliSessionMetadata | null {
    return this.active?.metadata ?? null
  }

  listProviders(): Promise<Extract<CliEvent, { type: 'providers.result' }>['providers']> {
    const active = this.active
    if (!active || active.turnId) throw new Error('An idle active session is required')
    return active.session.listProviders()
  }

  listModels(provider: string): Promise<string[]> {
    const active = this.active
    if (!active || active.turnId) throw new Error('An idle active session is required')
    return active.session.listModels(provider)
  }

  addAttachment(connectionId: string, attachmentId: string, data: string): Promise<{ attachmentId: string; marker: string; mediaType: 'image/png' | 'image/jpeg' }> {
    const active = this.requireActive(connectionId)
    if (active.turnId) throw new BingoCommandError('BAD_ARGUMENT', 'Finish or cancel the active turn before adding an attachment.', 'flow', true)
    if (!active.metadata.capabilities?.includes('attachments.input.v1')) {
      throw new BingoCommandError('CAPABILITY_UNAVAILABLE', 'This Bingo version does not support image attachments.', 'flow', true)
    }
    return active.session.addAttachment(attachmentId, data)
  }

  readTeam(connectionId: string): Promise<TeamSnapshot> {
    return this.requireTeam(connectionId).session.readTeam()
  }

  validateTeam(connectionId: string): Promise<{ valid: boolean; msg: string }> {
    return this.requireTeam(connectionId).session.validateTeam()
  }

  saveTeam(connectionId: string, baseRevision: string, definition: TeamDefinition): Promise<TeamSnapshot> {
    const active = this.requireTeam(connectionId)
    if (active.turnId) throw new BingoCommandError('BAD_ARGUMENT', 'Finish or cancel the active turn before saving the team.', 'page', true)
    return active.session.saveTeam(baseRevision, definition)
  }

  startTeam(connectionId: string): Promise<TeamSnapshot> {
    const active = this.requireTeam(connectionId)
    if (active.turnId) throw new BingoCommandError('BAD_ARGUMENT', 'Finish or cancel the active turn before starting the team.', 'page', true)
    return active.session.startTeam()
  }

  stopTeam(connectionId: string): Promise<TeamSnapshot> {
    const active = this.requireTeam(connectionId)
    if (active.turnId) throw new BingoCommandError('BAD_ARGUMENT', 'Finish or cancel the active turn before stopping the team.', 'page', true)
    return active.session.stopTeam()
  }

  messageTeamMember(connectionId: string, member: string, message: string): Promise<TeamSnapshot> {
    return this.requireTeam(connectionId).session.messageTeamMember(member, message)
  }

  stopTeamMember(connectionId: string, member: string): Promise<TeamSnapshot> {
    return this.requireTeam(connectionId).session.stopTeamMember(member)
  }

  removeTeamMember(connectionId: string, member: string): Promise<TeamSnapshot> {
    return this.requireTeam(connectionId).session.removeTeamMember(member)
  }

  readTeamActivity(connectionId: string, member: string): Promise<{ member: string; activity: Array<{ id: string; kind: string; summary: string; status: string }> }> {
    return this.requireTeam(connectionId).session.readTeamActivity(member)
  }

  postTeamChannel(connectionId: string, channel: string, text: string): Promise<TeamSnapshot> {
    return this.requireTeam(connectionId).session.postTeamChannel(channel, text)
  }

  readTeamChannel(connectionId: string, channel: string): Promise<TeamSnapshot> {
    return this.requireTeam(connectionId).session.readTeamChannel(channel)
  }

  async close(connectionId?: string): Promise<void> {
    const active = this.active
    if (connectionId && active?.connectionId !== connectionId) throw new Error('Connection is stale')
    this.active = null
    if (active) await active.session.close()
  }

  private handleEvent(connectionId: string, payload: CliEvent): void {
    const active = this.active
    if (!active || active.connectionId !== connectionId) return
    if ('turnId' in payload && payload.turnId && active.turnId && payload.turnId !== active.turnId) return
    if (payload.type === 'prompt.request') active.prompts.add(payload.promptId)
    if (payload.type === 'prompt.resolved') active.prompts.delete(payload.promptId)
    if (payload.type === 'turn.completed' || payload.type === 'turn.cancelled' || (payload.type === 'error' && payload.scope === 'turn')) {
      active.turnId = null
      active.prompts.clear()
    }
    active.sequence += 1
    this.emit({ connectionId, sequence: active.sequence, payload })
  }

  private requireActive(connectionId: string): Active {
    if (!this.active || this.active.connectionId !== connectionId) throw new Error('Connection is stale')
    return this.active
  }

  private requireTeam(connectionId: string): Active {
    const active = this.requireActive(connectionId)
    if (!active.metadata.capabilities?.includes('team.workspace.v1')) {
      throw new BingoCommandError('CAPABILITY_UNAVAILABLE', 'This Bingo version does not provide the Team workspace protocol.', 'page', true)
    }
    return active
  }

  private requireTurn(connectionId: string, turnId: string): Active {
    const active = this.requireActive(connectionId)
    if (active.turnId !== turnId) throw new Error('Turn is stale')
    return active
  }
}
