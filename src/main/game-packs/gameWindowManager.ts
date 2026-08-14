import { createHash } from 'node:crypto'
import { BrowserWindow, session, type Session } from 'electron'
import type { GamePackEvent } from '../../shared/contracts/gamePacks'
import { GamePackRepository } from './gamePackRepository'
import { GAME_PROTOCOL_SCHEME, GameProtocol } from './gameProtocol'

export class GameWindowManager {
  private active: { id: string; window: BrowserWindow } | null = null

  constructor(
    private readonly repository: GamePackRepository,
    private readonly protocol: GameProtocol,
    private readonly owner: BrowserWindow,
    private readonly emit: (event: GamePackEvent) => void
  ) {}

  async launch(id: string): Promise<void> {
    if (this.active?.id === id && !this.active.window.isDestroyed()) {
      if (this.active.window.isMinimized()) this.active.window.restore()
      this.active.window.show()
      this.active.window.focus()
      return
    }
    this.closeActive()
    try {
      const pack = await this.repository.resolveLaunch(id)
      const gameSession = session.fromPartition(gamePartition(id), { cache: true })
      await this.configureSession(gameSession, id, pack.manifest, pack.root)
      const gameWindow = new BrowserWindow({
        parent: this.owner,
        title: `${pack.manifest.name} - Bingo Go`,
        width: pack.manifest.window.width,
        height: pack.manifest.window.height,
        minWidth: pack.manifest.window.minWidth,
        minHeight: pack.manifest.window.minHeight,
        resizable: pack.manifest.window.resizable,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#f6f7f8',
        webPreferences: {
          session: gameSession,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false,
          devTools: false,
          safeDialogs: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          navigateOnDragDrop: false,
          spellcheck: false,
          disableBlinkFeatures: 'ServiceWorker'
        }
      })
      this.active = { id, window: gameWindow }
      gameWindow.removeMenu()
      gameWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      gameWindow.webContents.on('will-navigate', (event, url) => {
        if (!isSamePackUrl(url, id)) event.preventDefault()
      })
      gameWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())
      gameWindow.webContents.on('render-process-gone', (_event, details) => {
        if (details.reason === 'clean-exit' || this.active?.window !== gameWindow) return
        this.failWindow(id, 'window-crashed', `游戏进程已退出（${details.reason}）。`)
      })
      gameWindow.on('unresponsive', () => { if (this.active?.window === gameWindow) this.failWindow(id, 'window-unresponsive', '游戏未响应，窗口已关闭。') })
      gameWindow.on('closed', () => { if (this.active?.window === gameWindow) this.active = null })
      gameWindow.once('ready-to-show', () => gameWindow.show())
      await gameWindow.loadURL(`${GAME_PROTOCOL_SCHEME}://${id}/${pack.manifest.entry}`)
    } catch (error) {
      const raw = error instanceof Error ? error.message : ''
      const message = /^GAME_PACK_[A-Z0-9_]+:/.test(raw) ? raw.replace(/^[A-Z0-9_]+:\s*/, '').slice(0, 1_000) : '游戏启动失败。'
      this.emit({ type: 'launch-failed', id, message })
      this.closeActive()
      throw error
    }
  }

  closePack(id: string): void {
    if (this.active?.id === id) this.closeActive()
  }

  closeActive(): void {
    const current = this.active
    this.active = null
    if (current && !current.window.isDestroyed()) current.window.destroy()
  }

  async clearData(id: string): Promise<void> {
    if (!(await this.repository.has(id))) throw new Error(`GAME_PACK_NOT_FOUND: Game package "${id}" is not installed.`)
    this.closePack(id)
    const gameSession = session.fromPartition(gamePartition(id), { cache: true })
    await gameSession.clearStorageData()
    await gameSession.clearCache()
  }

  private async configureSession(gameSession: Session, id: string, manifest: Awaited<ReturnType<GamePackRepository['resolveLaunch']>>['manifest'], root: string): Promise<void> {
    gameSession.setPermissionCheckHandler(() => false)
    gameSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    gameSession.on('will-download', (event) => event.preventDefault())
    gameSession.webRequest.onBeforeRequest(null)
    gameSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isSamePackUrl(details.url, id) }))
    await this.protocol.register(gameSession, manifest, root)
  }

  private failWindow(id: string, type: 'window-crashed' | 'window-unresponsive', message: string): void {
    this.emit({ type, id, message })
    this.closePack(id)
  }
}

export function gamePartition(id: string): string {
  return `persist:bingo-game-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`
}

function isSamePackUrl(value: string, id: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === `${GAME_PROTOCOL_SCHEME}:` && url.hostname === id && !url.username && !url.password && !url.port
  } catch {
    return false
  }
}
