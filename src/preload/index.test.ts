import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, type BingoGuiApi } from '../shared/contracts/ipc'
import { APP_SERVER_CHANNELS, type BingoAppApi } from '../shared/contracts/appServerIpc'

const electron = vi.hoisted(() => ({
  apis: {} as Record<string, unknown>,
  invoke: vi.fn(),
  listeners: new Map<string, (event: unknown, value: unknown) => void>(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (name: string, api: unknown) => { electron.apis[name] = api } },
  ipcRenderer: {
    invoke: electron.invoke,
    on: (channel: string, listener: (event: unknown, value: unknown) => void) => { electron.listeners.set(channel, listener) },
    removeListener: electron.removeListener
  }
}))

await import('./index')

const gui = (): BingoGuiApi => electron.apis.bingoGui as BingoGuiApi
const app = (): BingoAppApi => electron.apis.bingoApp as BingoAppApi

describe('preload bridges', () => {
  beforeEach(() => {
    electron.invoke.mockReset()
    electron.listeners.clear()
    electron.removeListener.mockReset()
    electron.invoke.mockResolvedValue({ ok: true })
  })

  it('validates notification preferences before invoking main', async () => {
    const input = { baseRevision: 'a'.repeat(64), values: { schemaVersion: 1 as const, enabled: true, turnCompleted: true, actionRequired: true, failures: true, sound: false } }

    await gui().saveNotificationPreferences(input)

    expect(electron.invoke).toHaveBeenCalledWith(IPC.notificationPreferencesSave, input)
    expect(() => gui().saveNotificationPreferences({ ...input, values: { ...input.values, enabled: 'yes' } } as never)).toThrow()
  })

  it('forwards only validated app-server notification activations', () => {
    const listener = vi.fn()
    const unsubscribe = gui().onNotificationActivated(listener)
    const handler = electron.listeners.get(IPC.notificationActivated)!

    handler({}, { sessionId: '', kind: 'failure' })
    handler({}, { sessionId: 'sess_1', conversationId: 'conv_main', kind: 'action-required' })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ sessionId: 'sess_1', conversationId: 'conv_main', kind: 'action-required' })
    unsubscribe()
    expect(electron.removeListener).toHaveBeenCalledWith(IPC.notificationActivated, handler)
  })

  it('validates provider definitions and app-server actions', async () => {
    const provider = {
      workspacePath: 'D:\\project',
      baseRevision: 'a'.repeat(64),
      provider: { name: 'private', protocol: 'openai' as const, apiBaseUrl: 'https://example.test', supportsImages: true, apiKey: { action: 'unchanged' as const } }
    }
    await gui().upsertProvider(provider)
    await app().executeAction({ originConversationId: 'conv_main', precondition: null, action: { type: 'modelSelect', model: 'gpt-5' } })

    expect(electron.invoke).toHaveBeenCalledWith(IPC.settingsProviderUpsert, provider)
    expect(electron.invoke).toHaveBeenCalledWith(APP_SERVER_CHANNELS.executeAction, {
      originConversationId: 'conv_main', precondition: null, action: { type: 'modelSelect', model: 'gpt-5' }
    })
    expect(() => app().executeAction({ originConversationId: 'conv_main', action: { type: 'modelSelect', model: '' } } as never)).toThrow()
  })

  it('validates interrupt and queue requests before forwarding them', async () => {
    await app().interrupt({ conversationId: 'conv_main', turnId: 'turn_1' })
    await app().queueReclaimTail({ conversationId: 'conv_main', expectedRevision: 3 })

    expect(electron.invoke).toHaveBeenCalledWith(APP_SERVER_CHANNELS.interrupt, { conversationId: 'conv_main', turnId: 'turn_1' })
    expect(electron.invoke).toHaveBeenCalledWith(APP_SERVER_CHANNELS.queueReclaimTail, { conversationId: 'conv_main', expectedRevision: 3 })
    expect(() => app().interrupt({ conversationId: '', turnId: 'turn_1' })).toThrow()
  })

  it('exposes only validated game-package commands and filters events', async () => {
    const revision = 'f'.repeat(64)
    await gui().installGamePack({ token: '123e4567-e89b-42d3-a456-426614174000', baseRevision: revision })
    await gui().setGamePackEnabled({ id: 'com.example.game', enabled: false, baseRevision: revision })
    await gui().launchGamePack({ id: 'com.example.game' })

    expect(electron.invoke).toHaveBeenCalledWith(IPC.gamePackInstall, { token: '123e4567-e89b-42d3-a456-426614174000', baseRevision: revision })
    expect(electron.invoke).toHaveBeenCalledWith(IPC.gamePackSetEnabled, { id: 'com.example.game', enabled: false, baseRevision: revision })
    expect(() => gui().launchGamePack({ id: '../unsafe' })).toThrow()

    const listener = vi.fn()
    const unsubscribe = gui().onGamePackEvent(listener)
    const handler = electron.listeners.get(IPC.gamePackEvent)!
    handler({}, { type: 'catalog-changed', id: '../unsafe' })
    handler({}, { type: 'window-crashed', id: 'com.example.game', message: 'crashed' })
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    expect(electron.removeListener).toHaveBeenCalledWith(IPC.gamePackEvent, handler)
  })
})
