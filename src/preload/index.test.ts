import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, type BingoGuiApi } from '../shared/contracts/ipc'

const electron = vi.hoisted(() => ({
  api: undefined as BingoGuiApi | undefined,
  apis: {} as Record<string, unknown>,
  invoke: vi.fn(),
  listeners: new Map<string, (event: unknown, value: unknown) => void>(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (name: string, api: unknown) => { electron.api = api as BingoGuiApi; electron.apis[name] = api } },
  ipcRenderer: {
    invoke: electron.invoke,
    on: (channel: string, listener: (event: unknown, value: unknown) => void) => { electron.listeners.set(channel, listener) },
    removeListener: electron.removeListener
  }
}))

await import('./index')

const gui = (): BingoGuiApi => (electron.apis.bingoGui as BingoGuiApi) ?? (electron.api as BingoGuiApi)

describe('preload notification bridge', () => {
  beforeEach(() => {
    electron.invoke.mockReset()
    electron.listeners.clear()
    electron.removeListener.mockReset()
  })

  it('validates notification preferences before invoking main', async () => {
    const input = { baseRevision: 'a'.repeat(64), values: { schemaVersion: 1 as const, enabled: true, turnCompleted: true, actionRequired: true, failures: true, sound: false } }
    electron.invoke.mockResolvedValue({ ok: true })

    await gui().saveNotificationPreferences(input)

    expect(electron.invoke).toHaveBeenCalledWith(IPC.notificationPreferencesSave, input)
    expect(() => gui().saveNotificationPreferences({ ...input, values: { ...input.values, enabled: 'yes' } } as never)).toThrow()
  })

  it('forwards only validated activation events and unsubscribes exactly', () => {
    const listener = vi.fn()
    const unsubscribe = gui().onNotificationActivated(listener)
    const handler = electron.listeners.get(IPC.notificationActivated)!

    handler({}, { connectionId: 'not-a-uuid', kind: 'failure' })
    handler({}, { connectionId: '123e4567-e89b-42d3-a456-426614174000', kind: 'action-required' })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ connectionId: '123e4567-e89b-42d3-a456-426614174000', kind: 'action-required' })
    unsubscribe()
    expect(electron.removeListener).toHaveBeenCalledWith(IPC.notificationActivated, handler)
  })

  it('validates team-task commands before forwarding them to main', async () => {
    const connectionId = '123e4567-e89b-42d3-a456-426614174000'
    const input = {
      connectionId,
      title: 'Review release',
      description: 'Inspect the release blockers',
      participants: ['reviewer'],
      leader: 'reviewer'
    }
    electron.invoke.mockResolvedValue({ ok: true })

    await gui().createTeamTask(input)

    expect(electron.invoke).toHaveBeenCalledWith(IPC.teamTaskCreate, { ...input, contextMessageSeqs: [], additionalConstraints: [] })
    expect(() => gui().getTeamTask({ connectionId, taskId: 'task-1', limit: 201 })).toThrow()
  })

  it('validates an optional automatic title before sending a turn', async () => {
    const input = {
      connectionId: '123e4567-e89b-42d3-a456-426614174000',
      turnId: '123e4567-e89b-42d3-a456-426614174001',
      prompt: '检查项目',
      autoTitle: '检查项目'
    }
    electron.invoke.mockResolvedValue({ ok: true })

    await gui().sendTurn(input)

    expect(electron.invoke).toHaveBeenCalledWith(IPC.sessionSend, input)
    expect(() => gui().sendTurn({ ...input, autoTitle: 'a'.repeat(61) })).toThrow()

    const legacy = { connectionId: input.connectionId, turnId: input.turnId, prompt: input.prompt }
    await gui().sendTurn(legacy)
    expect(electron.invoke).toHaveBeenLastCalledWith(IPC.sessionSend, legacy)
  })

  it('validates clipboard writes and session forks before invoking main', async () => {
    const input = {
      sourceSessionId: 'source-session',
      reason: 'edit-last-prompt' as const,
      sourceTurnId: '123e4567-e89b-42d3-a456-426614174000',
      sourceRevision: 'a'.repeat(64)
    }
    electron.invoke.mockResolvedValue({ ok: true })

    await gui().writeClipboardText({ text: '可见文字' })
    await gui().forkSession(input)

    expect(electron.invoke).toHaveBeenCalledWith(IPC.clipboardWriteText, { text: '可见文字' })
    expect(electron.invoke).toHaveBeenCalledWith(IPC.sessionFork, input)
    expect(() => gui().forkSession({ ...input, sourceRevision: undefined })).toThrow()
    expect(() => gui().forkSession({ sourceSessionId: 'source-session', reason: 'recover-interrupted', sourceTurnId: input.sourceTurnId })).toThrow()
  })

  it('exposes only validated game-package commands and filters events', async () => {
    const revision = 'f'.repeat(64)
    electron.invoke.mockResolvedValue({ ok: true })
    await gui().installGamePack({ token: '123e4567-e89b-42d3-a456-426614174000', baseRevision: revision })
    await gui().setGamePackEnabled({ id: 'com.example.game', enabled: false, baseRevision: revision })
    await gui().launchGamePack({ id: 'com.example.game' })

    expect(electron.invoke).toHaveBeenCalledWith(IPC.gamePackInstall, { token: '123e4567-e89b-42d3-a456-426614174000', baseRevision: revision })
    expect(electron.invoke).toHaveBeenCalledWith(IPC.gamePackSetEnabled, { id: 'com.example.game', enabled: false, baseRevision: revision })
    expect(electron.invoke).toHaveBeenCalledWith(IPC.gamePackLaunch, { id: 'com.example.game' })
    expect(() => gui().launchGamePack({ id: '../unsafe' })).toThrow()

    const listener = vi.fn()
    const unsubscribe = gui().onGamePackEvent(listener)
    const handler = electron.listeners.get(IPC.gamePackEvent)!
    handler({}, { type: 'catalog-changed', id: '../unsafe' })
    handler({}, { type: 'window-crashed', id: 'com.example.game', message: 'crashed' })
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ type: 'window-crashed', id: 'com.example.game', message: 'crashed' })
    unsubscribe()
    expect(electron.removeListener).toHaveBeenCalledWith(IPC.gamePackEvent, handler)
  })
})
