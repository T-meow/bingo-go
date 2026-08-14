import { describe, expect, it, vi } from 'vitest'
import { TEAM_V2_CAPABILITIES, type TeamDefinition } from '../../shared/contracts/cli'
import type { BingoSession, BingoSessionHandlers } from './bingoSession'
import { SessionManager } from './sessionManager'

const metadata = { bingoVersion: '1', protocolVersion: 1 as const, sessionId: 's1', displayName: 'New conversation', transcriptPath: '/tmp/s1', resumed: false, cwd: '/tmp', provider: 'default', model: 'm', thinkingLevel: 'off' as const, permissionMode: 'default', theme: 'auto' as const, supportsImages: false, capabilities: ['session.fork.v1'] }
const teamMethods = (): Pick<BingoSession, 'readTeam' | 'validateTeam' | 'saveTeam' | 'startTeam' | 'stopTeam' | 'getTeamLobby' | 'postTeamLobby' | 'importTeamAvatar' | 'getTeamAvatar' | 'inspectTeamPreset' | 'importTeamPreset' | 'exportTeamPreset' | 'restartTeamMember' | 'markTeamMemberUseful' | 'promoteTeamMember' | 'listTeamTasks' | 'getTeamTask' | 'createTeamTask' | 'postTeamTask' | 'pauseTeamTask' | 'resumeTeamTask' | 'completeTeamTask' | 'cancelTeamTask' | 'messageTeamMember' | 'stopTeamMember' | 'removeTeamMember' | 'readTeamActivity' | 'listAgentDefinitions' | 'getAgentDefinition' | 'saveAgentDefinition' | 'archiveAgentDefinition' | 'postTeamChannel' | 'readTeamChannel' | 'fork' | 'subscribeContext'> => ({
  readTeam: vi.fn(), validateTeam: vi.fn(), saveTeam: vi.fn(), startTeam: vi.fn(), stopTeam: vi.fn(),
  getTeamLobby: vi.fn(), postTeamLobby: vi.fn(), importTeamAvatar: vi.fn(), getTeamAvatar: vi.fn(),
  inspectTeamPreset: vi.fn(), importTeamPreset: vi.fn(), exportTeamPreset: vi.fn(),
  restartTeamMember: vi.fn(), markTeamMemberUseful: vi.fn(), promoteTeamMember: vi.fn(),
  listTeamTasks: vi.fn(), getTeamTask: vi.fn(), createTeamTask: vi.fn(), postTeamTask: vi.fn(), pauseTeamTask: vi.fn(), resumeTeamTask: vi.fn(), completeTeamTask: vi.fn(), cancelTeamTask: vi.fn(),
  messageTeamMember: vi.fn(), stopTeamMember: vi.fn(), removeTeamMember: vi.fn(), readTeamActivity: vi.fn(),
  listAgentDefinitions: vi.fn(), getAgentDefinition: vi.fn(), saveAgentDefinition: vi.fn(), archiveAgentDefinition: vi.fn(),
  postTeamChannel: vi.fn(), readTeamChannel: vi.fn(), fork: vi.fn(), subscribeContext: vi.fn().mockResolvedValue(null)
})

describe('SessionManager', () => {
  it('requires the Team v2 capability bundle before saving a v2 blueprint', async () => {
    const saveTeam = vi.fn().mockResolvedValue({})
    const session = {
      open: vi.fn()
        .mockResolvedValueOnce({ ...metadata, capabilities: ['team.workspace.v1'] })
        .mockResolvedValueOnce({ ...metadata, capabilities: [...TEAM_V2_CAPABILITIES] }),
      addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(),
      ...teamMethods(), saveTeam, fork: vi.fn(), rename: vi.fn(), delete: vi.fn(), close: vi.fn()
    }
    const manager = new SessionManager(() => session, vi.fn())
    const definition: TeamDefinition = {
      schemaVersion: 2,
      teamId: 'team-dev',
      name: 'dev',
      members: [{ memberId: 'member-lead', name: 'lead', agent: 'team-lead', profile: { constraints: [], preferences: [] } }]
    }

    const legacy = await manager.open()
    expect(() => manager.saveTeam(legacy.connectionId, 'a'.repeat(64), definition)).toThrow('team.blueprint.v2')
    expect(saveTeam).not.toHaveBeenCalled()

    const upgraded = await manager.open()
    await expect(manager.saveTeam(upgraded.connectionId, 'a'.repeat(64), definition)).resolves.toEqual({})
    expect(saveTeam).toHaveBeenCalledWith('a'.repeat(64), definition)
  })

  it('commits a replacement before closing the old session and rejects stale connections', async () => {
    const sessions: Array<BingoSession & { close: ReturnType<typeof vi.fn> }> = []
    const factory = (): BingoSession => {
      const session = { open: vi.fn().mockResolvedValue(metadata), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(), ...teamMethods(), fork: vi.fn(), rename: vi.fn(), delete: vi.fn(), close: vi.fn() }
      sessions.push(session)
      return session
    }
    const manager = new SessionManager(factory, vi.fn())
    const first = await manager.open()
    const second = await manager.open('s1')
    expect(sessions[0].close).toHaveBeenCalledOnce()
    await expect(manager.send(first.connectionId, crypto.randomUUID(), 'stale')).rejects.toThrow('stale')
    await expect(manager.send(second.connectionId, crypto.randomUUID(), 'ok')).resolves.toBeUndefined()
  })

  it('preserves the active connection when a replacement fails to open', async () => {
    const sessions: Array<BingoSession & { close: ReturnType<typeof vi.fn> }> = []
    const factory = (): BingoSession => {
      const session = {
        open: sessions.length === 0 ? vi.fn().mockResolvedValue(metadata) : vi.fn().mockRejectedValue(new Error('workspace launch failed')),
        addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(),
        ...teamMethods(), fork: vi.fn(), rename: vi.fn(), delete: vi.fn(), close: vi.fn()
      }
      sessions.push(session)
      return session
    }
    const manager = new SessionManager(factory, vi.fn())
    const first = await manager.open()

    await expect(manager.open('missing')).rejects.toThrow('workspace launch failed')
    expect(sessions[0].close).not.toHaveBeenCalled()
    expect(sessions[1].close).toHaveBeenCalledOnce()
    await expect(manager.send(first.connectionId, crypto.randomUUID(), 'still active')).resolves.toBeUndefined()
  })

  it('forks an idle source without switching or closing its active connection', async () => {
    const turnId = crypto.randomUUID()
    const revision = 'a'.repeat(64)
    const childMetadata = { ...metadata, sessionId: 'child', parentSessionId: 's1', forkReason: 'edit-last-prompt' as const }
    const fork = vi.fn().mockResolvedValue({
      protocolVersion: 1 as const,
      seq: 2,
      sessionId: 's1',
      type: 'session.forked' as const,
      commandId: crypto.randomUUID(),
      sourceSessionId: 's1',
      reason: 'edit-last-prompt' as const,
      metadata: childMetadata,
      warnings: []
    })
    const session = {
      open: vi.fn().mockResolvedValue(metadata), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(),
      ...teamMethods(), fork, rename: vi.fn(), delete: vi.fn(), close: vi.fn()
    }
    const manager = new SessionManager(() => session, vi.fn())
    const opened = await manager.open('s1')

    await expect(manager.fork('s1', 'edit-last-prompt', turnId, revision)).resolves.toEqual({ metadata: childMetadata, warnings: [] })

    expect(fork).toHaveBeenCalledWith('edit-last-prompt', turnId, revision)
    expect(session.close).not.toHaveBeenCalled()
    expect(manager.snapshot()).toMatchObject({ connectionId: opened.connectionId, sessionId: 's1', idle: true })
  })

  it('switches to a child only after it opens successfully', async () => {
    const sessions: Array<BingoSession & { close: ReturnType<typeof vi.fn> }> = []
    const factory = (): BingoSession => {
      const child = sessions.length > 0
      const session = {
        open: vi.fn().mockResolvedValue(child ? { ...metadata, sessionId: 'child', parentSessionId: 's1', forkReason: 'edit-last-prompt' as const } : metadata),
        addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(),
        ...teamMethods(), fork: vi.fn(), rename: vi.fn(), delete: vi.fn(), close: vi.fn()
      }
      sessions.push(session)
      return session
    }
    const manager = new SessionManager(factory, vi.fn())
    const source = await manager.open('s1')

    const child = await manager.openPreservingActive('child', { displayName: '分支', autoTitleEligible: false })

    expect(sessions[0].close).toHaveBeenCalledOnce()
    expect(sessions[1].close).not.toHaveBeenCalled()
    await expect(manager.send(source.connectionId, crypto.randomUUID(), 'stale')).rejects.toThrow('stale')
    await expect(manager.send(child.connectionId, crypto.randomUUID(), 'continue')).resolves.toBeUndefined()
  })

  it('keeps the source active when opening a fork child fails', async () => {
    const sessions: Array<BingoSession & { close: ReturnType<typeof vi.fn> }> = []
    const factory = (): BingoSession => {
      const session = {
        open: sessions.length === 0 ? vi.fn().mockResolvedValue(metadata) : vi.fn().mockRejectedValue(new Error('child failed to open')),
        addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(),
        ...teamMethods(), fork: vi.fn(), rename: vi.fn(), delete: vi.fn(), close: vi.fn()
      }
      sessions.push(session)
      return session
    }
    const manager = new SessionManager(factory, vi.fn())
    const source = await manager.open('s1')

    await expect(manager.openPreservingActive('child', { displayName: '分支', autoTitleEligible: false })).rejects.toThrow('child failed to open')

    expect(sessions[0].close).not.toHaveBeenCalled()
    expect(sessions[1].close).toHaveBeenCalledOnce()
    await expect(manager.send(source.connectionId, crypto.randomUUID(), 'still active')).resolves.toBeUndefined()
  })

  it('uses an isolated maintenance child for an inactive rename', async () => {
    const instances: Array<BingoSession & { open: ReturnType<typeof vi.fn>; rename: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = []
    const factory = (): BingoSession => {
      const session = {
        open: vi.fn().mockResolvedValue(metadata), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(), ...teamMethods(),
        fork: vi.fn(), rename: vi.fn().mockResolvedValue({ ...metadata, sessionId: 's2--renamed', displayName: 'renamed' }), delete: vi.fn(), close: vi.fn()
      }
      instances.push(session)
      return session
    }
    const manager = new SessionManager(factory, vi.fn())
    await manager.open('s1')
    await expect(manager.rename('s2', 'renamed')).resolves.toMatchObject({ sessionId: 's2--renamed' })
    expect(instances).toHaveLength(2)
    expect(instances[1].open).toHaveBeenCalledWith('s2')
    expect(instances[1].rename).toHaveBeenCalledWith('renamed')
    expect(instances[1].close).toHaveBeenCalledOnce()
    expect(instances[0].close).not.toHaveBeenCalled()
  })

  it('emits a terminal transport error and invalidates the connection on child exit', async () => {
    let handlers: BingoSessionHandlers
    const emit = vi.fn()
    const session = {
      open: vi.fn().mockResolvedValue(metadata), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(), ...teamMethods(), fork: vi.fn(), rename: vi.fn(), delete: vi.fn(), close: vi.fn()
    }
    const manager = new SessionManager((nextHandlers) => {
      handlers = nextHandlers
      return session
    }, emit)
    const opened = await manager.open()
    const turnId = crypto.randomUUID()
    await manager.send(opened.connectionId, turnId, 'run a tool')

    handlers!.onExit(new Error('protocol failure'), { exitCode: 1, signal: null })

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: opened.connectionId,
      sequence: 1,
      payload: expect.objectContaining({ type: 'transport.error', exitCode: 1 })
    }))
    expect(manager.snapshot()).toBeNull()
    expect(() => manager.cancel(opened.connectionId, turnId)).toThrow('stale')
  })

  it('commits the first automatic title only on the matching turn.started event', async () => {
    let handlers: BingoSessionHandlers
    const emit = vi.fn()
    const session = {
      open: vi.fn().mockResolvedValue(metadata), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(), ...teamMethods(), fork: vi.fn(), rename: vi.fn(), delete: vi.fn(), close: vi.fn()
    }
    const manager = new SessionManager((nextHandlers) => { handlers = nextHandlers; return session }, emit)
    const opened = await manager.open(undefined, { displayName: '新对话', autoTitleEligible: true })
    const turnId = crypto.randomUUID()
    await manager.send(opened.connectionId, turnId, 'inspect', '检查项目')

    handlers!.onEvent({ protocolVersion: 1, seq: 2, sessionId: 's1', type: 'turn.started', commandId: crypto.randomUUID(), turnId: crypto.randomUUID() })
    expect(manager.snapshot()).toMatchObject({ displayName: '新对话', autoTitleEligible: true })

    handlers!.onEvent({ protocolVersion: 1, seq: 3, sessionId: 's1', type: 'turn.started', commandId: crypto.randomUUID(), turnId })
    expect(manager.snapshot()).toMatchObject({ sessionId: 's1', displayName: '检查项目', autoTitleEligible: false })
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ displayName: '检查项目', payload: expect.objectContaining({ type: 'turn.started', turnId }) }))

    handlers!.onEvent({ protocolVersion: 1, seq: 4, sessionId: 's1', type: 'turn.completed', turnId })
    const secondTurnId = crypto.randomUUID()
    await manager.send(opened.connectionId, secondTurnId, 'second', '第二个标题')
    handlers!.onEvent({ protocolVersion: 1, seq: 5, sessionId: 's1', type: 'turn.started', commandId: crypto.randomUUID(), turnId: secondTurnId })
    expect(manager.snapshot()).toMatchObject({ displayName: '检查项目', autoTitleEligible: false })
  })

  it('keeps automatic naming eligible after a send failure and preserves it after cancellation', async () => {
    let handlers: BingoSessionHandlers
    const sendTurn = vi.fn().mockRejectedValueOnce(new Error('write failed')).mockResolvedValue(undefined)
    const session = {
      open: vi.fn().mockResolvedValue(metadata), addAttachment: vi.fn(), sendTurn, cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(), ...teamMethods(), fork: vi.fn(), rename: vi.fn(), delete: vi.fn(), close: vi.fn()
    }
    const manager = new SessionManager((nextHandlers) => { handlers = nextHandlers; return session }, vi.fn())
    const opened = await manager.open(undefined, { displayName: '新对话', autoTitleEligible: true })
    await expect(manager.send(opened.connectionId, crypto.randomUUID(), 'first', '失败标题')).rejects.toThrow('write failed')
    expect(manager.snapshot()).toMatchObject({ displayName: '新对话', autoTitleEligible: true, idle: true })

    const retryTurnId = crypto.randomUUID()
    await manager.send(opened.connectionId, retryTurnId, 'retry', '重试标题')
    handlers!.onEvent({ protocolVersion: 1, seq: 2, sessionId: 's1', type: 'turn.started', commandId: crypto.randomUUID(), turnId: retryTurnId })
    handlers!.onEvent({ protocolVersion: 1, seq: 3, sessionId: 's1', type: 'turn.cancelled', turnId: retryTurnId, reason: 'requested' })
    expect(manager.snapshot()).toMatchObject({ displayName: '重试标题', autoTitleEligible: false, idle: true })
  })

  it('never overwrites an existing or manually synchronized display name', async () => {
    let handlers: BingoSessionHandlers
    const session = {
      open: vi.fn().mockResolvedValue({ ...metadata, resumed: true }), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(), ...teamMethods(), fork: vi.fn(), rename: vi.fn(), delete: vi.fn(), close: vi.fn()
    }
    const manager = new SessionManager((nextHandlers) => { handlers = nextHandlers; return session }, vi.fn())
    const opened = await manager.open('s1', { displayName: '已有标题', autoTitleEligible: false })
    const turnId = crypto.randomUUID()
    await manager.send(opened.connectionId, turnId, 'new prompt', '不应使用')
    handlers!.onEvent({ protocolVersion: 1, seq: 2, sessionId: 's1', type: 'turn.started', commandId: crypto.randomUUID(), turnId })
    expect(manager.snapshot()).toMatchObject({ displayName: '已有标题', autoTitleEligible: false })

    manager.updatePresentation('s1', '手工名称', false)
    expect(manager.currentMetadata()).toMatchObject({ displayName: '手工名称' })
  })
})
