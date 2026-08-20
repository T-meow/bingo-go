import { app, BrowserWindow, Menu, Notification } from 'electron'
import { join } from 'node:path'
import { registerAppServerIpc, type AppServerIpcController } from './ipc/registerAppServerIpc'
import { registerHostIpc, type HostIpcController } from './ipc/registerHostIpc'
import { bundledBingoPath } from './runtime/bundledBinary'
import { RuntimeLocator } from './runtime/runtimeLocator'
import { AppearanceRepository } from './storage/appearanceRepository'
import { NotificationPreferencesRepository } from './storage/notificationPreferencesRepository'
import { SettingsRepository } from './storage/settingsRepository'
import { UserProfileRepository } from './storage/userProfileRepository'
import { WorkspaceRepository } from './storage/workspaceRepository'
import { NotificationCoordinator } from './notifications/notificationCoordinator'
import { IPC } from '../shared/contracts/ipc'
import { GamePackRepository } from './game-packs/gamePackRepository'
import { GameProtocol, registerGameProtocolScheme } from './game-packs/gameProtocol'
import { GameWindowManager } from './game-packs/gameWindowManager'

let appServerIpc: AppServerIpcController | null = null
let hostIpc: HostIpcController | null = null
let gameWindows: GameWindowManager | null = null
let shuttingDown = false

async function createWindow(): Promise<void> {
  Menu.setApplicationMenu(null)
  const initialWorkspace = process.env.BINGO_GUI_CWD
    ?? (app.isPackaged ? app.getPath('documents') : process.cwd())
  const workspace = new WorkspaceRepository(join(app.getPath('userData'), 'workspace.json'), initialWorkspace)
  await workspace.initialize(!process.env.BINGO_GUI_CWD)

  const windowIcon = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build', 'icon.png')
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: windowIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  window.setMenuBarVisibility(false)
  window.removeMenu()

  const bundledBinary = app.isPackaged ? bundledBingoPath(process.resourcesPath) : undefined
  const binaryPath = process.env.BINGO_GUI_BINARY ?? bundledBinary ?? 'bingo'
  const locator = new RuntimeLocator({ bundledBinary })
  const notificationPreferences = new NotificationPreferencesRepository(join(app.getPath('userData'), 'notifications.json'))
  const notifications = new NotificationCoordinator({
    window,
    isSupported: () => Notification.isSupported(),
    createNotification: (options) => new Notification(options),
    activate: (activation) => {
      if (!window.isDestroyed()) window.webContents.send(IPC.notificationActivated, activation)
    }
  })
  try {
    notifications.updatePreferences((await notificationPreferences.read()).values)
  } catch {
    notifications.disable()
  }

  const home = process.env.HOME ?? process.env.USERPROFILE ?? app.getPath('home')
  const userConfigDirectory = process.env.XDG_CONFIG_HOME ?? join(home, '.config')
  const settings = new SettingsRepository(join(userConfigDirectory, 'bingo', 'settings.json'))
  const appearance = new AppearanceRepository(join(app.getPath('userData'), 'preferences.json'))
  const profile = new UserProfileRepository(join(app.getPath('userData'), 'profile.json'), join(app.getPath('userData'), 'avatars'))
  await profile.initialize().catch(() => undefined)

  const builtinGameRoot = app.isPackaged ? join(process.resourcesPath, 'game-packs') : join(app.getAppPath(), 'games', 'build')
  let gamePacks: GamePackRepository | undefined
  try {
    gamePacks = new GamePackRepository(join(app.getPath('userData'), 'game-packs'), builtinGameRoot)
    await gamePacks.initialize()
    gameWindows = new GameWindowManager(gamePacks, new GameProtocol(), window, (event) => {
      if (!window.isDestroyed()) window.webContents.send(IPC.gamePackEvent, event)
    })
  } catch (error) {
    gamePacks = undefined
    gameWindows = null
    console.error('Game package subsystem initialization failed.', error)
  }

  hostIpc = registerHostIpc(window, {
    locator,
    binaryPath,
    settings,
    appearance,
    workspace,
    notificationPreferences,
    notifications,
    profile,
    gamePacks,
    gameWindows: gameWindows ?? undefined
  })
  appServerIpc = registerAppServerIpc(window, locator, binaryPath, {
    workspacePath: () => workspace.current(),
    onNotification: (snapshot, notification) => notifications.handle(snapshot, notification),
    onExit: (snapshot, error) => notifications.handleExit(snapshot, error)
  })

  window.once('ready-to-show', () => window.show())
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await window.loadFile(join(__dirname, '../renderer/index.html'))
}

if (process.platform === 'win32') app.setAppUserModelId('io.github.tmeow.bingogo')
registerGameProtocolScheme()

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.whenReady().then(() => { void createWindow() })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
  app.on('before-quit', (event) => {
    if (shuttingDown) return
    event.preventDefault()
    shuttingDown = true
    gameWindows?.closeActive()
    gameWindows = null
    hostIpc?.dispose()
    hostIpc = null
    const controller = appServerIpc
    appServerIpc = null
    const force = setTimeout(() => app.exit(0), 3_000)
    void Promise.race([
      controller?.dispose() ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]).finally(() => {
      clearTimeout(force)
      app.exit(0)
    })
  })
  app.on('window-all-closed', () => app.quit())
}
