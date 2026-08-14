import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => {
  class FakeEmitter {
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    on(event: string, listener: (...args: unknown[]) => void): this { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); return this }
    once(event: string, listener: (...args: unknown[]) => void): this {
      const wrapped = (...args: unknown[]): void => { this.listeners.set(event, (this.listeners.get(event) ?? []).filter((item) => item !== wrapped)); listener(...args) }
      return this.on(event, wrapped)
    }
    emit(event: string, ...args: unknown[]): void { for (const listener of this.listeners.get(event) ?? []) listener(...args) }
  }
  const windows: InstanceType<typeof FakeWindow>[] = []
  const sessions = new Map<string, ReturnType<typeof fakeSession>>()
  class FakeWebContents extends FakeEmitter {
    setWindowOpenHandler = vi.fn()
  }
  class FakeWindow extends FakeEmitter {
    webContents = new FakeWebContents()
    loadURL = vi.fn().mockResolvedValue(undefined)
    destroy = vi.fn(() => this.emit('closed'))
    show = vi.fn()
    focus = vi.fn()
    restore = vi.fn()
    removeMenu = vi.fn()
    isDestroyed = vi.fn().mockReturnValue(false)
    isMinimized = vi.fn().mockReturnValue(false)
    constructor(public options: unknown) { super(); windows.push(this) }
  }
  function fakeSession() {
    return {
      setPermissionCheckHandler: vi.fn(), setPermissionRequestHandler: vi.fn(), on: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn() }, clearStorageData: vi.fn().mockResolvedValue(undefined), clearCache: vi.fn().mockResolvedValue(undefined),
      protocol: { isProtocolHandled: vi.fn().mockReturnValue(false), unhandle: vi.fn(), handle: vi.fn() }
    }
  }
  return { windows, sessions, FakeWindow, fakeSession }
})

vi.mock('electron', () => ({
  BrowserWindow: electron.FakeWindow,
  session: { fromPartition: (partition: string) => {
    if (!electron.sessions.has(partition)) electron.sessions.set(partition, electron.fakeSession())
    return electron.sessions.get(partition)
  } }
}))

import { GameWindowManager, gamePartition } from './gameWindowManager'

describe('GameWindowManager', () => {
  beforeEach(() => { electron.windows.length = 0; electron.sessions.clear(); vi.clearAllMocks() })

  it('launches without preload, Node, IPC, permissions or external network access', async () => {
    const manifest = { schemaVersion: 1 as const, kind: 'game' as const, id: 'com.example.game', name: 'Game', version: '1.0.0', entry: 'index.html', window: { width: 480, height: 600, minWidth: 360, minHeight: 480, resizable: true } }
    const repository = { resolveLaunch: vi.fn().mockResolvedValue({ manifest, root: '/game' }), has: vi.fn().mockResolvedValue(true) }
    const protocol = { register: vi.fn().mockResolvedValue(undefined) }
    const manager = new GameWindowManager(repository as never, protocol as never, {} as never, vi.fn())
    await manager.launch(manifest.id)

    const gameWindow = electron.windows[0]
    const options = gameWindow.options as { webPreferences: Record<string, unknown> }
    expect(options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, devTools: false, webSecurity: true, disableBlinkFeatures: 'ServiceWorker' })
    expect(options.webPreferences).not.toHaveProperty('preload')
    expect(gameWindow.loadURL).toHaveBeenCalledWith('bingo-game://com.example.game/index.html')

    const gameSession = electron.sessions.get(gamePartition(manifest.id))!
    expect(gameSession.setPermissionCheckHandler.mock.calls[0][0]()).toBe(false)
    const permissionCallback = vi.fn(); gameSession.setPermissionRequestHandler.mock.calls[0][0]({}, 'camera', permissionCallback); expect(permissionCallback).toHaveBeenCalledWith(false)
    const requestHandler = gameSession.webRequest.onBeforeRequest.mock.calls.at(-1)![0]
    const external = vi.fn(); requestHandler({ url: 'https://example.com' }, external); expect(external).toHaveBeenCalledWith({ cancel: true })
    const internal = vi.fn(); requestHandler({ url: 'bingo-game://com.example.game/app.js' }, internal); expect(internal).toHaveBeenCalledWith({ cancel: false })
    expect(gameWindow.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: 'deny' })
    const navigation = { preventDefault: vi.fn() }
    gameWindow.webContents.emit('will-navigate', navigation, 'https://example.com')
    expect(navigation.preventDefault).toHaveBeenCalledOnce()
    const internalNavigation = { preventDefault: vi.fn() }
    gameWindow.webContents.emit('will-navigate', internalNavigation, 'bingo-game://com.example.game/other.html')
    expect(internalNavigation.preventDefault).not.toHaveBeenCalled()
    const download = { preventDefault: vi.fn() }
    const downloadHandler = gameSession.on.mock.calls.find(([event]) => event === 'will-download')![1]
    downloadHandler(download)
    expect(download.preventDefault).toHaveBeenCalledOnce()
    const webview = { preventDefault: vi.fn() }
    gameWindow.webContents.emit('will-attach-webview', webview)
    expect(webview.preventDefault).toHaveBeenCalledOnce()
  })

  it('focuses a duplicate launch and gives each package a distinct persistent partition', async () => {
    expect(gamePartition('com.example.one')).not.toBe(gamePartition('com.example.two'))
    expect(gamePartition('com.example.one')).toMatch(/^persist:bingo-game-[a-f0-9]{32}$/)
    const manifest = { schemaVersion: 1 as const, kind: 'game' as const, id: 'com.example.one', name: 'One', version: '1.0.0', entry: 'index.html', window: { width: 480, height: 600, minWidth: 360, minHeight: 480, resizable: true } }
    const manager = new GameWindowManager({ resolveLaunch: vi.fn().mockResolvedValue({ manifest, root: '/one' }) } as never, { register: vi.fn() } as never, {} as never, vi.fn())
    await manager.launch(manifest.id); await manager.launch(manifest.id)
    expect(electron.windows).toHaveLength(1)
    expect(electron.windows[0].focus).toHaveBeenCalledOnce()
  })

  it('clears only the requested package partition and reports renderer crashes', async () => {
    const manifests = new Map(['one', 'two'].map((name) => [`com.example.${name}`, { schemaVersion: 1 as const, kind: 'game' as const, id: `com.example.${name}`, name, version: '1.0.0', entry: 'index.html', window: { width: 480, height: 600, minWidth: 360, minHeight: 480, resizable: true } }]))
    const repository = {
      resolveLaunch: vi.fn(async (id: string) => ({ manifest: manifests.get(id), root: `/${id}` })),
      has: vi.fn().mockResolvedValue(true)
    }
    const events = vi.fn()
    const manager = new GameWindowManager(repository as never, { register: vi.fn() } as never, {} as never, events)
    await manager.launch('com.example.one')
    await manager.launch('com.example.two')
    await manager.clearData('com.example.one')

    expect(electron.sessions.get(gamePartition('com.example.one'))!.clearStorageData).toHaveBeenCalledOnce()
    expect(electron.sessions.get(gamePartition('com.example.one'))!.clearCache).toHaveBeenCalledOnce()
    expect(electron.sessions.get(gamePartition('com.example.two'))!.clearStorageData).not.toHaveBeenCalled()

    const activeWindow = electron.windows.at(-1)!
    activeWindow.webContents.emit('render-process-gone', {}, { reason: 'crashed' })
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'window-crashed', id: 'com.example.two' }))
    expect(activeWindow.destroy).toHaveBeenCalledOnce()
  })
})
