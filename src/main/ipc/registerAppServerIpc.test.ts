import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { APP_SERVER_CHANNELS } from '../../shared/contracts/appServerIpc'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, raw?: unknown) => Promise<unknown>>(),
  removeHandler: vi.fn()
}))
const runtime = vi.hoisted(() => ({
  start: vi.fn(),
  close: vi.fn(),
  interrupt: vi.fn(),
  actionExecute: vi.fn(),
  snapshot: null as unknown
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: IpcMainInvokeEvent, raw?: unknown) => Promise<unknown>) => electron.handlers.set(channel, handler),
    removeHandler: electron.removeHandler
  },
  BrowserWindow: class {}
}))

vi.mock('../runtime/appServerSessionManager', () => ({
  AppServerSessionManager: class {
    start = runtime.start
    close = runtime.close
    turnInterrupt = runtime.interrupt
    actionExecute = runtime.actionExecute
    currentSnapshot = () => runtime.snapshot
    sessionList = vi.fn()
    conversationRead = vi.fn()
    conversationMarkRead = vi.fn()
    sendProse = vi.fn()
    composerSubmit = vi.fn()
    interactionRespond = vi.fn()
    configRead = vi.fn()
    catalogRead = vi.fn()
    actionList = vi.fn()
    resourceRead = vi.fn()
    queueRead = vi.fn()
    queueReclaimTail = vi.fn()
    sessionDelete = vi.fn()
    restartCurrent = vi.fn()
    assetRegisterPath = vi.fn()
    assetReadChunk = vi.fn()
  }
}))

const { registerAppServerIpc } = await import('./registerAppServerIpc')

describe('registerAppServerIpc', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.removeHandler.mockReset()
    runtime.start.mockReset()
    runtime.close.mockReset().mockResolvedValue(undefined)
    runtime.interrupt.mockReset()
    runtime.actionExecute.mockReset()
    runtime.snapshot = null
  })

  it('forwards validated turn interrupts to the active app-server manager', async () => {
    const snapshot = { session: { id: 'sess_1', cwd: 'D:\\project' } }
    runtime.start.mockResolvedValue(snapshot)
    runtime.interrupt.mockResolvedValue({ accepted: true, turnId: 'turn_1' })
    const webContents = { mainFrame: {}, send: vi.fn() }
    const window = { webContents, isDestroyed: () => false } as unknown as BrowserWindow
    const locator = { probe: vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: 'C:\\bingo.exe', bingoVersion: '0.4.1', workspacePath: 'D:\\project' } }) }
    registerAppServerIpc(window, locator as never, 'C:\\bingo.exe', { workspacePath: () => 'D:\\project' })
    const event = { sender: webContents, senderFrame: webContents.mainFrame } as unknown as IpcMainInvokeEvent

    await electron.handlers.get(APP_SERVER_CHANNELS.connect)!(event, { workspacePath: 'D:\\project' })
    const result = await electron.handlers.get(APP_SERVER_CHANNELS.interrupt)!(event, { conversationId: 'conv_main', turnId: 'turn_1' })

    expect(runtime.interrupt).toHaveBeenCalledWith({ conversationId: 'conv_main', turnId: 'turn_1' })
    expect(result).toEqual({ ok: true, value: { accepted: true, turnId: 'turn_1' } })
  })

  it('rejects malformed actions before invoking the manager', async () => {
    const snapshot = { session: { id: 'sess_1', cwd: 'D:\\project' } }
    runtime.start.mockResolvedValue(snapshot)
    const webContents = { mainFrame: {}, send: vi.fn() }
    const window = { webContents, isDestroyed: () => false } as unknown as BrowserWindow
    const locator = { probe: vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: 'C:\\bingo.exe', bingoVersion: '0.4.1', workspacePath: 'D:\\project' } }) }
    registerAppServerIpc(window, locator as never, 'C:\\bingo.exe', { workspacePath: () => 'D:\\project' })
    const event = { sender: webContents, senderFrame: webContents.mainFrame } as unknown as IpcMainInvokeEvent

    await electron.handlers.get(APP_SERVER_CHANNELS.connect)!(event, { workspacePath: 'D:\\project' })
    const result = await electron.handlers.get(APP_SERVER_CHANNELS.executeAction)!(event, {
      originConversationId: 'conv_main', action: { id: 'model.select', label: 'metadata is not an action' }
    })

    expect(runtime.actionExecute).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false })
  })
})
