import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, type IpcMainInvokeEvent } from 'electron'
import { createHash } from 'node:crypto'
import {
  IPC,
  appearanceSaveInputSchema,
  clipboardWriteTextInputSchema,
  gamePackClearDataInputSchema,
  gamePackInstallInputSchema,
  gamePackLaunchInputSchema,
  gamePackSetEnabledInputSchema,
  gamePackUninstallInputSchema,
  mcpServerRemoveInputSchema,
  mcpServerSettingsInputSchema,
  modelListInputSchema,
  notificationPreferencesSaveInputSchema,
  profileSaveInputSchema,
  providerRemoveInputSchema,
  providerSettingsInputSchema,
  settingsReadInputSchema,
  workspaceSelectInputSchema,
  type AppInfo,
  type GuiError,
  type ModelListOutput,
  type ProviderView,
  type Result,
  type SettingsSnapshot,
  type WorkspaceSelectionResult
} from '../../shared/contracts/ipc'
import { isBuiltinAvatarId } from '../../shared/avatars'
import { GamePackRepository } from '../game-packs/gamePackRepository'
import { GameWindowManager } from '../game-packs/gameWindowManager'
import { NotificationCoordinator } from '../notifications/notificationCoordinator'
import { AppServerInspector } from '../runtime/appServerInspector'
import { ExternalTerminalError, openExternalTerminal } from '../runtime/externalTerminal'
import { RuntimeLocator } from '../runtime/runtimeLocator'
import { AppearanceRepository } from '../storage/appearanceRepository'
import { NotificationPreferencesRepository } from '../storage/notificationPreferencesRepository'
import { SettingsRepository } from '../storage/settingsRepository'
import { UserProfileRepository } from '../storage/userProfileRepository'
import { WorkspaceRepository } from '../storage/workspaceRepository'

const OPENCODE_GO_FALLBACK_MODELS = [
  'grok-4.5', 'glm-5.2', 'glm-5.1', 'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6',
  'mimo-v2.5', 'mimo-v2.5-pro', 'minimax-m3', 'minimax-m2.7', 'minimax-m2.5',
  'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus', 'deepseek-v4-pro', 'deepseek-v4-flash', 'hy3'
] as const

export type HostIpcDependencies = {
  locator: RuntimeLocator
  binaryPath: string
  settings: SettingsRepository
  appearance: AppearanceRepository
  workspace: WorkspaceRepository
  notificationPreferences: NotificationPreferencesRepository
  notifications: NotificationCoordinator
  profile: UserProfileRepository
  gamePacks?: GamePackRepository
  gameWindows?: GameWindowManager
}

export type HostIpcController = { dispose(): void }

export function registerHostIpc(window: BrowserWindow, dependencies: HostIpcDependencies): HostIpcController {
  const registeredChannels: string[] = []
  const trusted = (event: IpcMainInvokeEvent): void => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted IPC sender')
  }
  const guiError = (error: unknown): GuiError => {
    if (error instanceof ExternalTerminalError) return { code: error.code, msg: error.message, level: 'page', recoverable: true, action: 'retry' }
    const message = error instanceof Error ? error.message : 'The operation failed. Retry.'
    const prefixedCode = /^([A-Z][A-Z0-9_]+):/.exec(message)?.[1]
    const knownCode = prefixedCode && (
      ['SETTINGS_CONFLICT', 'CONFIG_SHADOWED', 'CONFIG_INVALID', 'STORAGE_ERROR'].includes(prefixedCode)
      || prefixedCode.startsWith('GAME_PACK_')
    ) ? prefixedCode : message.startsWith('Cannot read ') ? 'CONFIG_INVALID' : null
    return {
      code: knownCode ?? 'OPERATION_FAILED',
      msg: message.replace(/^[A-Z_]+:\s*/, ''),
      level: knownCode === 'CONFIG_INVALID' ? 'flow' : 'page',
      recoverable: true,
      action: 'retry'
    }
  }
  const operationalError = <T>(error: unknown): Result<T> => ({ ok: false, error: guiError(error) })
  const register = <TInput, TOutput>(
    channel: string,
    schema: { parse(value: unknown): TInput },
    operation: (input: TInput) => Promise<TOutput>
  ): void => {
    ipcMain.handle(channel, async (event, raw): Promise<Result<TOutput>> => {
      try {
        trusted(event)
        return { ok: true, value: await operation(schema.parse(raw)) }
      } catch (error) {
        return operationalError(error)
      }
    })
    registeredChannels.push(channel)
  }
  const registerWithoutInput = <TOutput>(channel: string, operation: () => Promise<TOutput> | TOutput): void => {
    ipcMain.handle(channel, async (event): Promise<Result<TOutput>> => {
      try {
        trusted(event)
        return { ok: true, value: await operation() }
      } catch (error) {
        return operationalError(error)
      }
    })
    registeredChannels.push(channel)
  }
  const withInspector = async <T>(workspacePath: string, operation: (inspector: AppServerInspector) => Promise<T>): Promise<T> => {
    const inspector = new AppServerInspector(dependencies.binaryPath, workspacePath)
    try {
      await inspector.open()
      return await operation(inspector)
    } finally {
      await inspector.close().catch(() => undefined)
    }
  }
  const readModels = async (workspacePath: string, provider: string): Promise<ModelListOutput> => {
    const fallback = provider === 'opencode-go' ? OPENCODE_GO_FALLBACK_MODELS : []
    try {
      const models = await withInspector(workspacePath, (inspector) => inspector.listModels(provider))
      return { provider, models: mergeModels(models.map((model) => model.id), fallback), source: 'remote' }
    } catch (error) {
      if (fallback.length === 0) throw error
      return { provider, models: [...fallback], source: 'fallback', warning: guiError(error) }
    }
  }
  const readSettingsSnapshot = async (workspacePath: string): Promise<SettingsSnapshot> => {
    const [snapshot, inventory] = await Promise.all([
      dependencies.settings.read(workspacePath),
      withInspector(workspacePath, (inspector) => inspector.listProviders())
    ])
    const { providerSources, ...view } = snapshot
    const providers: ProviderView[] = inventory.map((provider) => {
      const configuredSource = providerSources[provider.name]
      const source = configuredSource ?? (provider.builtin ? 'builtin' : 'environment')
      return {
        name: provider.name,
        protocol: provider.protocol === 'openai' ? 'openai' : 'anthropic',
        apiBaseUrl: provider.apiBaseUrl,
        supportsImages: provider.supportsImages,
        credentialConfigured: provider.credential.configured,
        builtin: provider.builtin,
        oauthConfigured: provider.credential.source === 'oauthStore',
        source,
        editable: configuredSource === undefined || configuredSource === 'user'
      }
    })
    return { ...view, providers }
  }
  const validateProviderModel = async (workspacePath: string, provider: string, model: string): Promise<void> => {
    const providers = await withInspector(workspacePath, (inspector) => inspector.listProviders())
    if (!providers.some((item) => item.name === provider)) throw new Error(`CONFIG_INVALID: Provider "${provider}" is not available.`)
    const models = await readModels(workspacePath, provider)
    if (models.models.length > 0 && !models.models.includes(model)) throw new Error(`CONFIG_INVALID: Model "${model}" is not available for ${provider}.`)
  }
  const gamePackOperation = async <T>(fallback: string, operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation()
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/^GAME_PACK_[A-Z0-9_]+:/.test(message)) throw new Error(message.slice(0, 2_000))
      throw new Error(`GAME_PACK_OPERATION_FAILED: ${fallback}`)
    }
  }

  registerWithoutInput<AppInfo>(IPC.appGetInfo, () => ({
    appVersion: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged
  }))
  registerWithoutInput(IPC.workspaceGet, () => dependencies.workspace.snapshot())
  registerWithoutInput(IPC.terminalOpenExternal, () => openExternalTerminal(dependencies.workspace.current()))
  register(IPC.clipboardWriteText, clipboardWriteTextInputSchema, async ({ text }) => {
    clipboard.writeText(text)
    return { written: true as const }
  })
  ipcMain.handle(IPC.workspaceSelect, async (event, raw): Promise<Result<WorkspaceSelectionResult>> => {
    try {
      trusted(event)
      const input = workspaceSelectInputSchema.parse(raw ?? {})
      let selectedPath = input.path
      if (!selectedPath) {
        const selected = await dialog.showOpenDialog(window, {
          title: '选择 Bingo 工作区', buttonLabel: '选择此文件夹', properties: ['openDirectory']
        })
        if (selected.canceled || !selected.filePaths[0]) {
          return { ok: true, value: { canceled: true, preferences: dependencies.workspace.snapshot() } }
        }
        selectedPath = selected.filePaths[0]
      }
      const probed = await dependencies.locator.probe(selectedPath)
      if (!probed.ok) return probed
      const changed = !sameWorkspace(probed.value.workspacePath, dependencies.workspace.current())
      await dependencies.workspace.save(probed.value.workspacePath)
      return {
        ok: true,
        value: { canceled: false, changed, runtime: probed.value, preferences: dependencies.workspace.snapshot() }
      }
    } catch (error) {
      return operationalError(error)
    }
  })
  registeredChannels.push(IPC.workspaceSelect)

  register(IPC.settingsRead, settingsReadInputSchema, ({ workspacePath }) => readSettingsSnapshot(workspacePath))
  register(IPC.settingsListModels, modelListInputSchema, ({ workspacePath, provider }) => readModels(workspacePath, provider))
  register(IPC.settingsProviderUpsert, providerSettingsInputSchema, async ({ workspacePath, baseRevision, provider }) => {
    await dependencies.settings.upsertProvider(workspacePath, baseRevision, provider)
    return readSettingsSnapshot(workspacePath)
  })
  register(IPC.settingsProviderRemove, providerRemoveInputSchema, async ({ workspacePath, baseRevision, name, fallback }) => {
    if (fallback) await validateProviderModel(workspacePath, fallback.provider, fallback.model)
    await dependencies.settings.removeProvider(workspacePath, baseRevision, name, fallback)
    return readSettingsSnapshot(workspacePath)
  })
  register(IPC.settingsMcpUpsert, mcpServerSettingsInputSchema, async ({ workspacePath, baseRevision, server }) => {
    await dependencies.settings.upsertMcpServer(workspacePath, baseRevision, server)
    return readSettingsSnapshot(workspacePath)
  })
  register(IPC.settingsMcpRemove, mcpServerRemoveInputSchema, async ({ workspacePath, baseRevision, name }) => {
    await dependencies.settings.removeMcpServer(workspacePath, baseRevision, name)
    return readSettingsSnapshot(workspacePath)
  })

  registerWithoutInput(IPC.appearanceRead, () => dependencies.appearance.read())
  register(IPC.appearanceSave, appearanceSaveInputSchema, ({ baseRevision, values }) => dependencies.appearance.save(baseRevision, values))
  registerWithoutInput(IPC.profileRead, () => dependencies.profile.read())
  register(IPC.profileSave, profileSaveInputSchema, async ({ baseRevision, avatar }) => {
    if (avatar.kind === 'builtin') {
      if (!isBuiltinAvatarId(avatar.id)) throw new Error(`CONFIG_INVALID: Unknown built-in avatar "${avatar.id}".`)
      return dependencies.profile.save(baseRevision, avatar.id)
    }
    if (avatar.kind === 'existing') return dependencies.profile.save(baseRevision, avatar.id)
    const png = normalizeProfileAvatar(avatar.data)
    const hash = createHash('sha256').update(png).digest('hex')
    return dependencies.profile.save(baseRevision, `user:${hash}`, png)
  })
  registerWithoutInput(IPC.notificationPreferencesRead, async () => {
    try {
      const snapshot = await dependencies.notificationPreferences.read()
      dependencies.notifications.updatePreferences(snapshot.values)
      return { ...snapshot, supported: dependencies.notifications.isSupported() }
    } catch (error) {
      dependencies.notifications.disable()
      throw error
    }
  })
  ipcMain.handle(IPC.notificationPreferencesSave, async (event, raw) => {
    try {
      trusted(event)
      const { baseRevision, values } = notificationPreferencesSaveInputSchema.parse(raw)
      const snapshot = await dependencies.notificationPreferences.save(baseRevision, values)
      dependencies.notifications.updatePreferences(snapshot.values)
      return { ok: true, value: { ...snapshot, supported: dependencies.notifications.isSupported() } }
    } catch (error) {
      try {
        dependencies.notifications.updatePreferences((await dependencies.notificationPreferences.read()).values)
      } catch {
        dependencies.notifications.disable()
      }
      return operationalError(error)
    }
  })
  registeredChannels.push(IPC.notificationPreferencesSave)

  registerWithoutInput(IPC.gamePackList, () => {
    if (!dependencies.gamePacks) throw new Error('Game packages are unavailable.')
    return gamePackOperation('无法读取小游戏目录。', () => dependencies.gamePacks!.list())
  })
  registerWithoutInput(IPC.gamePackChoose, async () => {
    if (!dependencies.gamePacks) throw new Error('Game packages are unavailable.')
    const selected = await dialog.showOpenDialog(window, {
      title: '导入小游戏包', buttonLabel: '检查此包', properties: ['openFile'],
      filters: [{ name: 'Bingo Go 小游戏包', extensions: ['bingo-pack'] }]
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true as const }
    const preview = await gamePackOperation('无法检查所选小游戏包。', () => dependencies.gamePacks!.previewImport(selected.filePaths[0]))
    return { canceled: false as const, preview }
  })
  if (dependencies.gamePacks && dependencies.gameWindows) {
    const gamePacks = dependencies.gamePacks
    const gameWindows = dependencies.gameWindows
    register(IPC.gamePackInstall, gamePackInstallInputSchema, ({ token, baseRevision }) => gamePackOperation('小游戏包安装失败。', async () => {
      await gamePacks.validateRevision(baseRevision)
      gameWindows.closePack(gamePacks.pendingPackageId(token))
      const snapshot = await gamePacks.install(token, baseRevision)
      window.webContents.send(IPC.gamePackEvent, { type: 'catalog-changed' })
      return snapshot
    }))
    register(IPC.gamePackSetEnabled, gamePackSetEnabledInputSchema, ({ id, enabled, baseRevision }) => gamePackOperation('无法更新小游戏启用状态。', async () => {
      await gamePacks.validateRevision(baseRevision)
      if (!enabled) gameWindows.closePack(id)
      const snapshot = await gamePacks.setEnabled(id, enabled, baseRevision)
      window.webContents.send(IPC.gamePackEvent, { type: 'catalog-changed', id })
      return snapshot
    }))
    register(IPC.gamePackLaunch, gamePackLaunchInputSchema, ({ id }) => gamePackOperation('小游戏启动失败。', async () => {
      await gameWindows.launch(id)
      return { launched: true as const }
    }))
    register(IPC.gamePackClearData, gamePackClearDataInputSchema, ({ id }) => gamePackOperation('无法清除小游戏数据。', async () => {
      await gameWindows.clearData(id)
      return { cleared: true as const }
    }))
    register(IPC.gamePackUninstall, gamePackUninstallInputSchema, ({ id, clearData, baseRevision }) => gamePackOperation('小游戏包卸载失败。', async () => {
      await gamePacks.validateRevision(baseRevision)
      gameWindows.closePack(id)
      if (clearData) await gameWindows.clearData(id)
      const snapshot = await gamePacks.uninstall(id, baseRevision)
      window.webContents.send(IPC.gamePackEvent, { type: 'catalog-changed', id })
      return snapshot
    }))
  }

  return { dispose: () => { for (const channel of registeredChannels) ipcMain.removeHandler(channel) } }
}

function mergeModels(models: readonly string[], fallback: readonly string[] = []): string[] {
  return [...new Set([...models, ...fallback].map((model) => model.trim()).filter(Boolean))]
}

function sameWorkspace(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLocaleLowerCase() === right.toLocaleLowerCase() : left === right
}

function normalizeProfileAvatar(data: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
    throw new Error('CONFIG_INVALID: Avatar image data is not valid base64.')
  }
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) throw new Error('CONFIG_INVALID: Avatar image must be between 1 byte and 20 MiB.')
  if (!isPng(bytes) && !isJpeg(bytes) && !isWebp(bytes)) throw new Error('CONFIG_INVALID: Avatar must be PNG, JPEG, or WebP.')
  const source = nativeImage.createFromBuffer(bytes)
  const size = source.getSize()
  if (source.isEmpty() || size.width < 1 || size.height < 1) throw new Error('CONFIG_INVALID: Avatar image cannot be decoded.')
  const side = Math.min(size.width, size.height)
  const square = source.crop({
    x: Math.floor((size.width - side) / 2),
    y: Math.floor((size.height - side) / 2),
    width: side,
    height: side
  })
  const png = square.resize({ width: 512, height: 512, quality: 'best' }).toPNG()
  if (png.length === 0) throw new Error('CONFIG_INVALID: Avatar image normalization failed.')
  return png
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
}
function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}
function isWebp(bytes: Buffer): boolean {
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
}
