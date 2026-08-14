import { randomUUID } from 'node:crypto'
import type { AgentDefinitionDocument, AgentDefinitionInput, BehaviorConstraint, CliEvent, CliSessionMetadata, ContextUsage, PromptResponse, SessionForkReason, TeamDefinition, TeamLobby, TeamPresetPreview, TeamSnapshot, TeamTask, TeamTaskSummary } from '../../shared/contracts/cli'
import { TEAM_AVATAR_READ_CAPABILITY, TEAM_BLUEPRINT_V2_CAPABILITY, TEAM_LOBBY_CAPABILITY, TEAM_MEMBER_PROFILE_CAPABILITY, TEAM_PRESETS_CAPABILITY, TEAM_TASKS_CAPABILITY, TEAM_WORKSPACE_CAPABILITY } from '../../shared/contracts/cli'
import { isRendererBingoEvent, type RendererCliPayload } from '../../shared/contracts/ipc'
import type { BingoSession, BingoSessionExit, BingoSessionHandlers } from './bingoSession'
import { BingoCommandError } from './bingoSession'
import { DEFAULT_CONVERSATION_TITLE } from '../../shared/conversationTitle'

export type ManagedSessionEvent = {
  connectionId: string
  sessionId: string
  displayName: string
  sequence: number
  payload: RendererCliPayload
}
export type SessionLaunch = { workspacePath: string; bindSessionWorkspace?: boolean }
export type SessionFactory = (handlers: BingoSessionHandlers, launch?: SessionLaunch) => BingoSession

type Active = {
  connectionId: string
  sessionId: string
  metadata: CliSessionMetadata
  displayName: string
  autoTitleEligible: boolean
  pendingAutoTitle: { turnId: string; title: string } | null
  session: BingoSession
  sequence: number
  turnId: string | null
  prompts: Set<string>
}

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

  open(
    sessionId?: string,
    presentation?: { displayName: string; autoTitleEligible: boolean },
    launch?: SessionLaunch
  ): Promise<{ connectionId: string; metadata: CliSessionMetadata; displayName: string; autoTitleEligible: boolean; contextUsage: ContextUsage | null }> {
    return this.serialize(async () => {
      const previous = this.active
      const connectionId = randomUUID()
      const session = this.factory({
        onEvent: (event) => this.handleEvent(connectionId, event),
        onExit: (error, exit) => this.handleExit(connectionId, error, exit)
      }, launch)
      try {
        const metadata = await session.open(sessionId)
        if (!metadata.sessionId) throw new Error('Conversation session.ready did not contain a session ID')
        const contextUsage = metadata.capabilities?.includes('session.context.v1') ? await session.subscribeContext() : null
        const displayName = presentation?.displayName ?? (metadata.resumed ? metadata.displayName : DEFAULT_CONVERSATION_TITLE)
        const autoTitleEligible = presentation?.autoTitleEligible ?? !metadata.resumed
        this.active = { connectionId, sessionId: metadata.sessionId, metadata, displayName, autoTitleEligible, pendingAutoTitle: null, session, sequence: 0, turnId: null, prompts: new Set() }
        if (previous) await previous.session.close()
        return { connectionId, metadata: { ...metadata, displayName }, displayName, autoTitleEligible, contextUsage }
      } catch (error) {
        await session.close()
        if (this.active?.connectionId === connectionId) this.active = previous
        throw error
      }
    })
  }

  async send(connectionId: string, turnId: string, prompt: string, autoTitle?: string): Promise<void> {
    const active = this.requireActive(connectionId)
    if (active.turnId) throw new Error('A turn is already active')
    active.turnId = turnId
    active.pendingAutoTitle = active.autoTitleEligible && autoTitle ? { turnId, title: autoTitle } : null
    try {
      await active.session.sendTurn(turnId, prompt)
    } catch (error) {
      active.turnId = null
      active.pendingAutoTitle = null
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

  rename(sessionId: string, name: string, launch?: SessionLaunch): Promise<CliSessionMetadata> {
    return this.serialize(async () => {
      const active = this.active
      if (active?.sessionId === sessionId) {
        if (active.turnId) throw new Error('Session mutation is only available while idle')
        const metadata = await active.session.rename(name)
        active.sessionId = metadata.sessionId
        active.metadata = metadata
        active.displayName = metadata.displayName
        active.autoTitleEligible = false
        active.pendingAutoTitle = null
        return metadata
      }
      const session = this.factory({ onEvent: () => undefined, onExit: () => undefined }, launch)
      try {
        await session.open(sessionId)
        return await session.rename(name)
      } finally {
        await session.close()
      }
    })
  }

  delete(sessionId: string, launch?: SessionLaunch): Promise<string> {
    return this.serialize(async () => {
      const active = this.active
      if (active?.sessionId === sessionId) {
        if (active.turnId) throw new Error('Session mutation is only available while idle')
        const deletedId = await active.session.delete()
        if (this.active === active) this.active = null
        return deletedId
      }
      const session = this.factory({ onEvent: () => undefined, onExit: () => undefined }, launch)
      try {
        await session.open(sessionId)
        return await session.delete()
      } finally {
        await session.close()
      }
    })
  }

  snapshot(): { connectionId: string; sessionId: string; displayName: string; autoTitleEligible: boolean; workspacePath: string; idle: boolean } | null {
    const active = this.active
    return active ? {
      connectionId: active.connectionId,
      sessionId: active.sessionId,
      displayName: active.displayName,
      autoTitleEligible: active.autoTitleEligible,
      workspacePath: active.metadata.cwd,
      idle: active.turnId === null
    } : null
  }

  currentMetadata(): CliSessionMetadata | null {
    const active = this.active
    return active ? { ...active.metadata, displayName: active.displayName } : null
  }

  fork(sessionId: string, reason: SessionForkReason, sourceTurnId?: string, sourceRevision?: string, launch?: SessionLaunch): Promise<{ metadata: CliSessionMetadata; warnings: string[] }> {
    return this.serialize(async () => {
      const active = this.active
      if (active?.sessionId === sessionId) {
        if (active.turnId) throw new BingoCommandError('SESSION_BUSY', 'Session fork is only available while idle.', 'page', true)
        if (!active.metadata.capabilities?.includes('session.fork.v1')) throw new BingoCommandError('CAPABILITY_UNAVAILABLE', 'This Bingo version does not support session forks.', 'page', true)
        const event = await active.session.fork(reason, sourceTurnId, sourceRevision)
        return { metadata: event.metadata, warnings: event.warnings }
      }
      const session = this.factory({ onEvent: () => undefined, onExit: () => undefined }, launch)
      try {
        const metadata = await session.open(sessionId)
        if (!metadata.capabilities?.includes('session.fork.v1')) throw new BingoCommandError('CAPABILITY_UNAVAILABLE', 'This Bingo version does not support session forks.', 'page', true)
        const event = await session.fork(reason, sourceTurnId, sourceRevision)
        return { metadata: event.metadata, warnings: event.warnings }
      } finally {
        await session.close()
      }
    })
  }

  openPreservingActive(
    sessionId: string,
    presentation: { displayName: string; autoTitleEligible: boolean },
    launch?: SessionLaunch
  ): Promise<{ connectionId: string; metadata: CliSessionMetadata; displayName: string; autoTitleEligible: boolean; contextUsage: ContextUsage | null }> {
    return this.serialize(async () => {
      const previous = this.active
      const connectionId = randomUUID()
      const session = this.factory({
        onEvent: (event) => this.handleEvent(connectionId, event),
        onExit: (error, exit) => this.handleExit(connectionId, error, exit)
      }, launch)
      try {
        const metadata = await session.open(sessionId)
        if (!metadata.sessionId) throw new Error('Conversation session.ready did not contain a session ID')
        const contextUsage = metadata.capabilities?.includes('session.context.v1') ? await session.subscribeContext() : null
        const next: Active = {
          connectionId,
          sessionId: metadata.sessionId,
          metadata,
          displayName: presentation.displayName,
          autoTitleEligible: presentation.autoTitleEligible,
          pendingAutoTitle: null,
          session,
          sequence: 0,
          turnId: null,
          prompts: new Set()
        }
        this.active = next
        if (previous && previous !== next) await previous.session.close()
        return { connectionId, metadata: { ...metadata, displayName: next.displayName }, displayName: next.displayName, autoTitleEligible: next.autoTitleEligible, contextUsage }
      } catch (error) {
        await session.close()
        if (this.active?.connectionId === connectionId) this.active = previous
        throw error
      }
    })
  }

  updatePresentation(sessionId: string, displayName: string, autoTitleEligible: boolean): void {
    const active = this.active
    if (!active || active.sessionId !== sessionId) return
    active.displayName = displayName
    active.autoTitleEligible = autoTitleEligible
    if (!autoTitleEligible) active.pendingAutoTitle = null
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
    const active = this.requireTeamCapability(connectionId, TEAM_BLUEPRINT_V2_CAPABILITY)
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

  getTeamLobby(connectionId: string, beforeSeq?: number, limit?: number): Promise<TeamLobby> {
    return this.requireTeamCapability(connectionId, TEAM_LOBBY_CAPABILITY).session.getTeamLobby(beforeSeq, limit)
  }

  postTeamLobby(connectionId: string, text: string, targets?: string[]): Promise<TeamLobby> {
    return this.requireTeamCapability(connectionId, TEAM_LOBBY_CAPABILITY).session.postTeamLobby(text, targets)
  }

  importTeamAvatar(connectionId: string, fileName: string, data: string): Promise<{ avatar: string; snapshot: TeamSnapshot }> {
    return this.requireTeamCapability(connectionId, TEAM_MEMBER_PROFILE_CAPABILITY).session.importTeamAvatar(fileName, data)
  }

  getTeamAvatar(connectionId: string, avatar: string): Promise<{ avatar: string; dataUrl: string }> {
    return this.requireTeamCapability(connectionId, TEAM_AVATAR_READ_CAPABILITY).session.getTeamAvatar(avatar)
  }

  inspectTeamPreset(connectionId: string, data: string): Promise<TeamPresetPreview> {
    return this.requireTeamCapability(connectionId, TEAM_PRESETS_CAPABILITY).session.inspectTeamPreset(data)
  }

  importTeamPreset(connectionId: string, data: string, baseRevision: string, resolutions: Record<string, 'update' | 'keep'>, modelMappings: Record<string, import('../../shared/contracts/cli').TeamPresetModelMapping>): Promise<{ preview: TeamPresetPreview; snapshot: TeamSnapshot }> {
    return this.requireTeamCapability(connectionId, TEAM_PRESETS_CAPABILITY).session.importTeamPreset(data, baseRevision, resolutions, modelMappings)
  }

  exportTeamPreset(connectionId: string): Promise<{ fileName: string; data: string }> {
    return this.requireTeamCapability(connectionId, TEAM_PRESETS_CAPABILITY).session.exportTeamPreset()
  }

  restartTeamMember(connectionId: string, member: string): Promise<TeamSnapshot> {
    return this.requireTeamCapability(connectionId, TEAM_MEMBER_PROFILE_CAPABILITY).session.restartTeamMember(member)
  }

  markTeamMemberUseful(connectionId: string, member: string): Promise<TeamSnapshot> {
    return this.requireTeamCapability(connectionId, TEAM_MEMBER_PROFILE_CAPABILITY).session.markTeamMemberUseful(member)
  }

  promoteTeamMember(connectionId: string, member: string, baseRevision: string): Promise<{ memberId?: string; snapshot: TeamSnapshot }> {
    return this.requireTeamCapability(connectionId, TEAM_MEMBER_PROFILE_CAPABILITY).session.promoteTeamMember(member, baseRevision)
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

  listTeamTasks(connectionId: string): Promise<{ branch: string; tasks: TeamTaskSummary[] }> {
    return this.requireTeamTasks(connectionId).session.listTeamTasks()
  }

  getTeamTask(connectionId: string, taskId: string, beforeSeq?: number, limit?: number): Promise<TeamTask> {
    return this.requireTeamTasks(connectionId).session.getTeamTask(taskId, beforeSeq, limit)
  }

  createTeamTask(connectionId: string, input: { title: string; description: string; participants?: string[]; leader?: string; contextMessageSeqs?: number[]; additionalConstraints?: BehaviorConstraint[] }): Promise<TeamTask> {
    return this.requireTeamTasks(connectionId).session.createTeamTask(input)
  }

  postTeamTask(connectionId: string, taskId: string, text: string): Promise<TeamTaskSummary> {
    return this.requireTeamTasks(connectionId).session.postTeamTask(taskId, text)
  }

  pauseTeamTask(connectionId: string, taskId: string): Promise<TeamTaskSummary> {
    return this.requireTeamTasks(connectionId).session.pauseTeamTask(taskId)
  }

  resumeTeamTask(connectionId: string, taskId: string, message?: string): Promise<TeamTaskSummary> {
    return this.requireTeamTasks(connectionId).session.resumeTeamTask(taskId, message)
  }

  completeTeamTask(connectionId: string, taskId: string): Promise<TeamTaskSummary> {
    return this.requireTeamTasks(connectionId).session.completeTeamTask(taskId)
  }

  cancelTeamTask(connectionId: string, taskId: string): Promise<TeamTaskSummary> {
    return this.requireTeamTasks(connectionId).session.cancelTeamTask(taskId)
  }

  listAgentDefinitions(connectionId: string): Promise<AgentDefinitionDocument[]> {
    return this.requireTeamTasks(connectionId).session.listAgentDefinitions()
  }

  getAgentDefinition(connectionId: string, scope: 'user' | 'project', id: string): Promise<AgentDefinitionDocument> {
    return this.requireTeamTasks(connectionId).session.getAgentDefinition(scope, id)
  }

  saveAgentDefinition(connectionId: string, scope: 'user' | 'project', id: string, baseRevision: string | undefined, definition: AgentDefinitionInput): Promise<AgentDefinitionDocument> {
    return this.requireTeamTasks(connectionId).session.saveAgentDefinition(scope, id, baseRevision, definition)
  }

  archiveAgentDefinition(connectionId: string, scope: 'user' | 'project', id: string, baseRevision: string): Promise<{ definition: AgentDefinitionDocument; archivePath?: string }> {
    return this.requireTeamTasks(connectionId).session.archiveAgentDefinition(scope, id, baseRevision)
  }

  async close(connectionId?: string): Promise<void> {
    const active = this.active
    if (connectionId && active?.connectionId !== connectionId) throw new Error('Connection is stale')
    this.active = null
    if (active) await active.session.close()
  }

  private handleEvent(connectionId: string, payload: CliEvent): void {
    if (!isRendererBingoEvent(payload)) return
    const active = this.active
    if (!active || active.connectionId !== connectionId) return
    if ('turnId' in payload && payload.turnId && active.turnId && payload.turnId !== active.turnId) return
    if (payload.type === 'turn.started' && payload.turnId === active.turnId && active.autoTitleEligible) {
      if (active.pendingAutoTitle?.turnId === payload.turnId) active.displayName = active.pendingAutoTitle.title
      active.autoTitleEligible = false
      active.pendingAutoTitle = null
    }
    if (payload.type === 'prompt.request') active.prompts.add(payload.promptId)
    if (payload.type === 'prompt.resolved') active.prompts.delete(payload.promptId)
    if (payload.type === 'turn.completed' || payload.type === 'turn.cancelled' || (payload.type === 'error' && payload.scope === 'turn')) {
      active.turnId = null
      active.prompts.clear()
      if (active.pendingAutoTitle && (!('turnId' in payload) || !payload.turnId || active.pendingAutoTitle.turnId === payload.turnId)) active.pendingAutoTitle = null
    }
    active.sequence += 1
    this.emit({ connectionId, sessionId: active.sessionId, displayName: active.displayName, sequence: active.sequence, payload })
  }

  private handleExit(connectionId: string, _error: Error | null, exit: BingoSessionExit): void {
    const active = this.active
    if (!active || active.connectionId !== connectionId) return
    this.active = null
    active.sequence += 1
    this.emit({
      connectionId,
      sessionId: active.sessionId,
      displayName: active.displayName,
      sequence: active.sequence,
      payload: {
        type: 'transport.error',
        error: {
          code: 'BINGO_TRANSPORT_ERROR',
          msg: 'Bingo 运行时连接意外中断，请重试或新建对话。',
          level: 'flow',
          recoverable: true,
          action: 'retry'
        },
        exitCode: exit.exitCode,
        signal: exit.signal
      }
    })
  }

  private requireActive(connectionId: string): Active {
    if (!this.active || this.active.connectionId !== connectionId) throw new Error('Connection is stale')
    return this.active
  }

  private requireTeam(connectionId: string): Active {
    const active = this.requireActive(connectionId)
    if (!active.metadata.capabilities?.includes(TEAM_WORKSPACE_CAPABILITY)) {
      throw new BingoCommandError('CAPABILITY_UNAVAILABLE', 'This Bingo version does not provide the Team workspace protocol.', 'page', true)
    }
    return active
  }

  private requireTeamTasks(connectionId: string): Active {
    return this.requireTeamCapability(connectionId, TEAM_TASKS_CAPABILITY)
  }

  private requireTeamCapability(connectionId: string, capability: string): Active {
    const active = this.requireTeam(connectionId)
    if (!active.metadata.capabilities?.includes(capability)) {
      throw new BingoCommandError('CAPABILITY_UNAVAILABLE', `This Bingo version does not provide ${capability}.`, 'page', true)
    }
    return active
  }

  private requireTurn(connectionId: string, turnId: string): Active {
    const active = this.requireActive(connectionId)
    if (active.turnId !== turnId) throw new Error('Turn is stale')
    return active
  }
}
