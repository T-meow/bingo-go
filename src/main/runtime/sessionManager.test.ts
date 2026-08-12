import { describe, expect, it, vi } from 'vitest'
import type { BingoSession, BingoSessionHandlers } from './bingoSession'
import { SessionManager } from './sessionManager'

const metadata = { bingoVersion: '1', protocolVersion: 1 as const, sessionId: 's1', displayName: 'New conversation', transcriptPath: '/tmp/s1', resumed: false, cwd: '/tmp', provider: 'default', model: 'm', thinkingLevel: 'off' as const, permissionMode: 'default', theme: 'auto' as const, supportsImages: false }
const teamMethods = (): Pick<BingoSession, 'readTeam' | 'validateTeam' | 'saveTeam' | 'startTeam' | 'stopTeam' | 'messageTeamMember' | 'stopTeamMember' | 'removeTeamMember' | 'readTeamActivity' | 'postTeamChannel' | 'readTeamChannel'> => ({
  readTeam: vi.fn(), validateTeam: vi.fn(), saveTeam: vi.fn(), startTeam: vi.fn(), stopTeam: vi.fn(),
  messageTeamMember: vi.fn(), stopTeamMember: vi.fn(), removeTeamMember: vi.fn(), readTeamActivity: vi.fn(),
  postTeamChannel: vi.fn(), readTeamChannel: vi.fn()
})

describe('SessionManager', () => {
  it('closes the old session before opening another and rejects stale connections', async () => {
    const sessions: Array<BingoSession & { close: ReturnType<typeof vi.fn> }> = []
    const factory = (): BingoSession => {
      const session = { open: vi.fn().mockResolvedValue(metadata), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(), ...teamMethods(), rename: vi.fn(), delete: vi.fn(), close: vi.fn() }
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

  it('uses an isolated maintenance child for an inactive rename', async () => {
    const instances: Array<BingoSession & { open: ReturnType<typeof vi.fn>; rename: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = []
    const factory = (): BingoSession => {
      const session = {
        open: vi.fn().mockResolvedValue(metadata), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(), ...teamMethods(),
        rename: vi.fn().mockResolvedValue({ ...metadata, sessionId: 's2--renamed', displayName: 'renamed' }), delete: vi.fn(), close: vi.fn()
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
      open: vi.fn().mockResolvedValue(metadata), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), listProviders: vi.fn(), listModels: vi.fn(), ...teamMethods(), rename: vi.fn(), delete: vi.fn(), close: vi.fn()
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
})
