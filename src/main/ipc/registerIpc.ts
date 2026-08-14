import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, type IpcMainInvokeEvent } from 'electron'
import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import {
  IPC, appearanceSaveInputSchema, clipboardWriteTextInputSchema, connectionInputSchema, gamePackClearDataInputSchema, gamePackInstallInputSchema, gamePackLaunchInputSchema, gamePackSetEnabledInputSchema, gamePackUninstallInputSchema, mcpServerRemoveInputSchema, mcpServerSettingsInputSchema, modelListInputSchema, notificationPreferencesSaveInputSchema, profileSaveInputSchema, providerRemoveInputSchema, providerSettingsInputSchema, runtimeSettingsInputSchema, runtimeSettingsSaveInputSchema, settingsSaveInputSchema, sessionAttachmentInputSchema, sessionDeleteInputSchema, sessionOpenInputSchema, sessionPromptInputSchema, sessionRenameInputSchema, sessionSendInputSchema,
  sessionForkInputSchema, sessionTurnInputSchema, agentDefinitionArchiveInputSchema, agentDefinitionInputBaseSchema, agentDefinitionSaveInputSchema, teamAvatarGetInputSchema, teamAvatarImportInputSchema, teamChannelInputSchema, teamChannelPostInputSchema, teamLobbyGetInputSchema, teamLobbyPostInputSchema, teamMemberInputSchema, teamMemberPromoteInputSchema, teamMessageInputSchema, teamPresetImportInputSchema, teamSaveInputSchema, teamTaskCreateInputSchema, teamTaskGetInputSchema, teamTaskInputSchema, teamTaskPostInputSchema, teamTaskResumeInputSchema, workspaceSelectInputSchema, type AppInfo, type RendererSessionEvent, type Result,
  type GuiError, type ModelListOutput, type PermissionMode, type RuntimeInfo, type RuntimeSettings, type SessionOpened, type SettingsSnapshot, type WorkspacePreferencesV2, type WorkspaceSelectionResult
} from '../../shared/contracts/ipc'
import { RuntimeLocator } from '../runtime/runtimeLocator'
import { BingoInspector } from '../runtime/bingoInspector'
import { BingoCommandError } from '../runtime/bingoSession'
import { SessionManager, type ManagedSessionEvent } from '../runtime/sessionManager'
import { SettingsRepository } from '../storage/settingsRepository'
import { AppearanceRepository } from '../storage/appearanceRepository'
import { sessionPresentation, TranscriptRepository } from '../storage/transcriptRepository'
import { WorkspaceRepository } from '../storage/workspaceRepository'
import { ExternalTerminalError, openExternalTerminal } from '../runtime/externalTerminal'
import { NotificationPreferencesRepository } from '../storage/notificationPreferencesRepository'
import { NotificationCoordinator } from '../notifications/notificationCoordinator'
import type { ContextUsage } from '../../shared/contracts/cli'
import { GamePackRepository } from '../game-packs/gamePackRepository'
import { GameWindowManager } from '../game-packs/gameWindowManager'
import { UserProfileRepository } from '../storage/userProfileRepository'
import { isBuiltinAvatarId } from '../../shared/avatars'

const OPENCODE_GO_FALLBACK_MODELS = [
  'grok-4.5',
  'glm-5.2',
  'glm-5.1',
  'kimi-k3',
  'kimi-k2.7-code',
  'kimi-k2.6',
  'mimo-v2.5',
  'mimo-v2.5-pro',
  'minimax-m3',
  'minimax-m2.7',
  'minimax-m2.5',
  'qwen3.7-max',
  'qwen3.7-plus',
  'qwen3.6-plus',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'hy3'
] as const
const FORK_HANDOFF_RETRY_DELAYS_MS = [20, 40, 80, 160, 320] as const

function mergeModels(models: readonly string[], fallback: readonly string[] = []): string[] {
  return [...new Set([...models, ...fallback].map((model) => model.trim()).filter(Boolean))]
}

function permissionModeValue(value: string | undefined, fallback: PermissionMode): PermissionMode {
  return value === 'default' || value === 'acceptEdits' || value === 'plan' || value === 'dontAsk' || value === 'bypassPermissions' ? value : fallback
}

function sameWorkspace(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLocaleLowerCase() === right.toLocaleLowerCase() : left === right
}

function transientForkLock(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'EBUSY' || code === 'EPERM') return true
  return error instanceof BingoCommandError
    && error.code === 'STORAGE_ERROR'
    && /resource busy or locked|active in another process|being used by another process/i.test(error.message)
}

async function retryForkHandoff<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      const delay = FORK_HANDOFF_RETRY_DELAYS_MS[attempt]
      if (delay === undefined || !transientForkLock(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export function registerIpc(
  window: BrowserWindow,
  locator: RuntimeLocator,
  sessions: SessionManager,
  transcripts: TranscriptRepository,
  settings: SettingsRepository,
  binaryPath: string,
  appearance?: AppearanceRepository,
  workspace?: WorkspaceRepository,
  notificationPreferences?: NotificationPreferencesRepository,
  notifications?: NotificationCoordinator,
  gamePacks?: GamePackRepository,
  gameWindows?: GameWindowManager,
  profile?: UserProfileRepository
): void {
  const trusted = (event: IpcMainInvokeEvent): void => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted IPC sender')
  }
  const guiError = (error: unknown): GuiError => {
    if (error instanceof BingoCommandError) return { code: error.code, msg: error.message, level: error.level, recoverable: error.recoverable }
    if (error instanceof ExternalTerminalError) return { code: error.code, msg: error.message, level: 'page', recoverable: true, action: 'retry' }
    const message = error instanceof Error ? error.message : 'The operation failed. Retry.'
    const prefixedCode = /^([A-Z][A-Z0-9_]+):/.exec(message)?.[1]
    const knownCode = prefixedCode && (['SETTINGS_CONFLICT', 'CONFIG_SHADOWED', 'CONFIG_INVALID', 'STORAGE_ERROR'].includes(prefixedCode) || prefixedCode.startsWith('GAME_PACK_'))
      ? prefixedCode
      : message.startsWith('Cannot read ')
        ? 'CONFIG_INVALID'
        : message === 'Connection is stale'
          ? 'CONNECTION_STALE'
          : null
    return { code: knownCode ?? 'OPERATION_FAILED', msg: message.replace(/^[A-Z_]+:\s*/, ''), level: knownCode === 'CONFIG_INVALID' ? 'flow' : 'page', recoverable: true, action: 'retry' }
  }
  const operationalError = <T>(error: unknown): Result<T> => ({ ok: false, error: guiError(error) })
  const gamePackOperation = async <T>(fallback: string, operation: () => Promise<T>): Promise<T> => {
    try { return await operation() } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/^GAME_PACK_[A-Z0-9_]+:/.test(message)) throw new Error(message.slice(0, 2_000))
      throw new Error(`GAME_PACK_OPERATION_FAILED: ${fallback}`)
    }
  }
  const handle = <TInput, TOutput>(channel: string, schema: { parse(value: unknown): TInput }, operation: (input: TInput) => Promise<TOutput>): void => {
    ipcMain.handle(channel, async (event, raw): Promise<Result<TOutput>> => {
      trusted(event)
      try { return { ok: true, value: await operation(schema.parse(raw)) } } catch (error) { return operationalError(error) }
    })
  }

  const withInspector = async <T>(workspacePath: string, operation: (inspector: BingoInspector) => Promise<T>): Promise<T> => {
    const inspector = new BingoInspector(binaryPath, workspacePath)
    try {
      await inspector.open()
      return await operation(inspector)
    } finally {
      await inspector.close()
    }
  }
  const readInventory = async (workspacePath: string): Promise<Awaited<ReturnType<BingoInspector['listProviders']>>> => {
    const active = sessions.snapshot()
    return active?.idle && sameWorkspace(active.workspacePath, workspacePath) ? sessions.listProviders() : withInspector(workspacePath, (inspector) => inspector.listProviders())
  }
  const readRemoteModels = async (workspacePath: string, provider: string): Promise<string[]> => {
    const active = sessions.snapshot()
    return active?.idle && sameWorkspace(active.workspacePath, workspacePath) ? sessions.listModels(provider) : withInspector(workspacePath, (inspector) => inspector.listModels(provider))
  }
  const readModels = async (workspacePath: string, provider: string): Promise<ModelListOutput> => {
    const fallback = provider === 'opencode-go' ? OPENCODE_GO_FALLBACK_MODELS : []
    try {
      return { provider, models: mergeModels(await readRemoteModels(workspacePath, provider), fallback), source: 'remote' }
    } catch (error) {
      if (fallback.length > 0) return { provider, models: [...fallback], source: 'fallback', warning: guiError(error) }
      throw error
    }
  }
  const readRuntimeSettings = async (workspacePath: string): Promise<RuntimeSettings> => {
    const [providers, configured] = await Promise.all([readInventory(workspacePath), settings.read(workspacePath)])
    const metadata = sessions.currentMetadata()
    const defaults = configured.effective ?? configured.values
    return {
      providers,
      provider: metadata?.provider ?? defaults.provider,
      model: metadata?.model ?? defaults.model,
      thinkingLevel: metadata?.thinkingLevel ?? defaults.thinkingLevel,
      permissionMode: permissionModeValue(metadata?.permissionMode, defaults.permissionMode),
      theme: metadata?.theme ?? defaults.theme
    }
  }

  const readSettingsSnapshot = async (workspacePath: string): Promise<SettingsSnapshot> => {
    const [snapshot, inventory] = await Promise.all([settings.read(workspacePath), readInventory(workspacePath)])
    const { providerSources, ...view } = snapshot
    const providers = inventory.map((provider) => {
      const configuredSource = providerSources[provider.name]
      const source = configuredSource ?? (provider.builtin ? 'builtin' : 'environment')
      return { ...provider, source, editable: configuredSource === undefined || configuredSource === 'user' }
    })
    return { ...view, providers }
  }
  const reconnect = async (): Promise<{ connectionId: string; contextUsage: ContextUsage | null } | undefined> => {
    const active = sessions.snapshot()
    if (!active) return undefined
    const opened = await sessions.open(
      active.sessionId,
      { displayName: active.displayName, autoTitleEligible: active.autoTitleEligible },
      { workspacePath: active.workspacePath }
    )
    return { connectionId: opened.connectionId, contextUsage: opened.contextUsage }
  }
  const validateProviderModel = async (workspacePath: string, provider: string, model: string): Promise<Awaited<ReturnType<BingoInspector['listProviders']>>> => {
    const providers = await readInventory(workspacePath)
    const selected = providers.find((item) => item.name === provider)
    if (!selected) throw new BingoCommandError('CONFIG_INVALID', `Provider "${provider}" is not available. Choose a listed provider.`, 'field', true)
    let models: string[]
    try { models = (await readModels(workspacePath, provider)).models } catch (error) {
      if (!selected.builtin) return providers
      throw error
    }
    if (models.length > 0 && !models.includes(model)) throw new BingoCommandError('CONFIG_INVALID', `Model "${model}" is not available for ${provider}. Choose a listed model.`, 'field', true)
    return providers
  }
  const sessionLaunch = async (sessionId: string): Promise<{ workspacePath: string }> => {
    const loaded = await transcripts.load(sessionId)
    return { workspacePath: loaded.workspacePath ?? workspace?.current() ?? process.env.BINGO_GUI_CWD ?? process.cwd() }
  }

  ipcMain.handle(IPC.appGetInfo, (event): Result<AppInfo> => {
    trusted(event)
    return { ok: true, value: { appVersion: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged } }
  })
  ipcMain.handle(IPC.runtimeProbe, async (event): Promise<Result<RuntimeInfo>> => {
    trusted(event)
    const result = await locator.probe(workspace?.current() ?? process.env.BINGO_GUI_CWD ?? process.cwd())
    if (result.ok) workspace?.use(result.value.workspacePath)
    return result
  })
  ipcMain.handle(IPC.workspaceGet, (event): Result<WorkspacePreferencesV2> => {
    trusted(event)
    if (!workspace) return { ok: false, error: { code: 'OPERATION_FAILED', msg: 'Workspace storage is unavailable.', level: 'page', recoverable: true } }
    return { ok: true, value: workspace.snapshot() }
  })
  ipcMain.handle(IPC.terminalOpenExternal, async (event): Promise<Result<Awaited<ReturnType<typeof openExternalTerminal>>>> => {
    trusted(event)
    if (!workspace) return { ok: false, error: { code: 'OPERATION_FAILED', msg: 'Workspace storage is unavailable.', level: 'page', recoverable: true } }
    try { return { ok: true, value: await openExternalTerminal(workspace.current()) } } catch (error) { return operationalError(error) }
  })
  handle(IPC.clipboardWriteText, clipboardWriteTextInputSchema, async ({ text }) => {
    clipboard.writeText(text)
    return { written: true as const }
  })
  ipcMain.handle(IPC.workspaceSelect, async (event, raw): Promise<Result<WorkspaceSelectionResult>> => {
    trusted(event)
    if (!workspace) return { ok: false, error: { code: 'OPERATION_FAILED', msg: 'Workspace storage is unavailable.', level: 'page', recoverable: true } }
    const activeBefore = sessions.snapshot()
    if (activeBefore && !activeBefore.idle) return { ok: false, error: { code: 'WORKSPACE_BUSY', msg: 'Finish or cancel the active turn before changing workspace.', level: 'flow', recoverable: true } }
    try {
      const input = workspaceSelectInputSchema.parse(raw ?? {})
      let selectedPath = input.path
      if (!selectedPath) {
        const selected = await dialog.showOpenDialog(window, { title: '选择 Bingo 工作区', buttonLabel: '选择此文件夹', properties: ['openDirectory'] })
        if (selected.canceled || !selected.filePaths[0]) return { ok: true, value: { canceled: true, preferences: workspace.snapshot() } }
        selectedPath = selected.filePaths[0]
      }
      const activeAfter = sessions.snapshot()
      if (activeAfter && !activeAfter.idle) return { ok: false, error: { code: 'WORKSPACE_BUSY', msg: 'A turn started while the workspace picker was open. Finish or cancel it, then retry.', level: 'flow', recoverable: true } }
      const probed = await locator.probe(selectedPath)
      if (!probed.ok) return probed
      const activeBeforeCommit = sessions.snapshot()
      if (activeBeforeCommit && !activeBeforeCommit.idle) return { ok: false, error: { code: 'WORKSPACE_BUSY', msg: 'A turn started while the workspace was being checked. Finish or cancel it, then retry.', level: 'flow', recoverable: true } }
      const changed = probed.value.workspacePath !== workspace.current()
      if (changed) await sessions.close()
      await workspace.save(probed.value.workspacePath)
      return { ok: true, value: { canceled: false, changed, runtime: probed.value, preferences: workspace.snapshot() } }
    } catch (error) {
      return operationalError(error)
    }
  })
  ipcMain.handle(IPC.appearanceRead, async (event): Promise<Result<Awaited<ReturnType<AppearanceRepository['read']>>>> => {
    trusted(event)
    if (!appearance) return { ok: false, error: { code: 'OPERATION_FAILED', msg: 'Appearance storage is unavailable.', level: 'page', recoverable: true } }
    try { return { ok: true, value: await appearance.read() } } catch (error) { return operationalError(error) }
  })
  if (appearance) handle(IPC.appearanceSave, appearanceSaveInputSchema, ({ baseRevision, values }) => appearance.save(baseRevision, values))
  ipcMain.handle(IPC.profileRead, async (event) => {
    trusted(event)
    if (!profile) return { ok: false, error: { code: 'OPERATION_FAILED', msg: 'User profile storage is unavailable.', level: 'page', recoverable: true } }
    try { return { ok: true, value: await profile.read() } } catch (error) { return operationalError(error) }
  })
  if (profile) handle(IPC.profileSave, profileSaveInputSchema, async ({ baseRevision, avatar }) => {
    if (avatar.kind === 'builtin') {
      if (!isBuiltinAvatarId(avatar.id)) throw new Error(`CONFIG_INVALID: Unknown built-in avatar "${avatar.id}".`)
      return profile.save(baseRevision, avatar.id)
    }
    if (avatar.kind === 'existing') return profile.save(baseRevision, avatar.id)
    const png = normalizeProfileAvatar(avatar.data)
    const hash = createHash('sha256').update(png).digest('hex')
    return profile.save(baseRevision, `user:${hash}`, png)
  })
  ipcMain.handle(IPC.notificationPreferencesRead, async (event) => {
    trusted(event)
    if (!notificationPreferences || !notifications) return { ok: false, error: { code: 'OPERATION_FAILED', msg: 'Notification preferences are unavailable.', level: 'page', recoverable: true } }
    try {
      const snapshot = await notificationPreferences.read()
      notifications.updatePreferences(snapshot.values)
      return { ok: true, value: { ...snapshot, supported: notifications.isSupported() } }
    } catch (error) {
      notifications.disable()
      return operationalError(error)
    }
  })
  if (notificationPreferences && notifications) {
    ipcMain.handle(IPC.notificationPreferencesSave, async (event, raw) => {
      trusted(event)
      try {
        const { baseRevision, values } = notificationPreferencesSaveInputSchema.parse(raw)
        const snapshot = await notificationPreferences.save(baseRevision, values)
        notifications.updatePreferences(snapshot.values)
        return { ok: true, value: { ...snapshot, supported: notifications.isSupported() } }
      } catch (error) {
        try {
          notifications.updatePreferences((await notificationPreferences.read()).values)
        } catch {
          notifications.disable()
        }
        return operationalError(error)
      }
    })
  }
  ipcMain.handle(IPC.gamePackList, async (event) => {
    trusted(event)
    if (!gamePacks) return { ok: false, error: { code: 'OPERATION_FAILED', msg: 'Game packages are unavailable.', level: 'page', recoverable: true } }
    try { return { ok: true, value: await gamePackOperation('无法读取小游戏目录。', () => gamePacks.list()) } } catch (error) { return operationalError(error) }
  })
  ipcMain.handle(IPC.gamePackChoose, async (event) => {
    trusted(event)
    if (!gamePacks) return { ok: false, error: { code: 'OPERATION_FAILED', msg: 'Game packages are unavailable.', level: 'page', recoverable: true } }
    try {
      const selected = await dialog.showOpenDialog(window, {
        title: '导入小游戏包', buttonLabel: '检查此包', properties: ['openFile'],
        filters: [{ name: 'Bingo Go 小游戏包', extensions: ['bingo-pack'] }]
      })
      if (selected.canceled || !selected.filePaths[0]) return { ok: true, value: { canceled: true as const } }
      return { ok: true, value: { canceled: false as const, preview: await gamePackOperation('无法检查所选小游戏包。', () => gamePacks.previewImport(selected.filePaths[0])) } }
    } catch (error) { return operationalError(error) }
  })
  if (gamePacks && gameWindows) {
    handle(IPC.gamePackInstall, gamePackInstallInputSchema, async ({ token, baseRevision }) => {
      return gamePackOperation('小游戏包安装失败。', async () => {
        await gamePacks.validateRevision(baseRevision)
        gameWindows.closePack(gamePacks.pendingPackageId(token))
        const snapshot = await gamePacks.install(token, baseRevision)
        window.webContents.send(IPC.gamePackEvent, { type: 'catalog-changed' })
        return snapshot
      })
    })
    handle(IPC.gamePackSetEnabled, gamePackSetEnabledInputSchema, async ({ id, enabled, baseRevision }) => {
      return gamePackOperation('无法更新小游戏启用状态。', async () => {
        await gamePacks.validateRevision(baseRevision)
        if (!enabled) gameWindows.closePack(id)
        const snapshot = await gamePacks.setEnabled(id, enabled, baseRevision)
        window.webContents.send(IPC.gamePackEvent, { type: 'catalog-changed', id })
        return snapshot
      })
    })
    handle(IPC.gamePackLaunch, gamePackLaunchInputSchema, ({ id }) => gamePackOperation('小游戏启动失败。', async () => { await gameWindows.launch(id); return { launched: true as const } }))
    handle(IPC.gamePackClearData, gamePackClearDataInputSchema, ({ id }) => gamePackOperation('无法清除小游戏数据。', async () => { await gameWindows.clearData(id); return { cleared: true as const } }))
    handle(IPC.gamePackUninstall, gamePackUninstallInputSchema, async ({ id, clearData, baseRevision }) => {
      return gamePackOperation('小游戏包卸载失败。', async () => {
        await gamePacks.validateRevision(baseRevision)
        gameWindows.closePack(id)
        if (clearData) await gameWindows.clearData(id)
        const snapshot = await gamePacks.uninstall(id, baseRevision)
        window.webContents.send(IPC.gamePackEvent, { type: 'catalog-changed', id })
        return snapshot
      })
    })
  }
  ipcMain.handle(IPC.sessionList, async (event): Promise<Result<Awaited<ReturnType<TranscriptRepository['list']>>>> => {
    trusted(event)
    try { return { ok: true, value: await transcripts.list() } } catch (error) { return operationalError(error) }
  })
  handle(IPC.sessionOpen, sessionOpenInputSchema, async ({ sessionId, workspacePath, chooseWorkspace, bindWorkspace }): Promise<SessionOpened> => {
    if (!workspace) throw new Error('Workspace storage is unavailable.')
    const loaded = sessionId ? await transcripts.load(sessionId) : { history: [], workspacePath: null, warnings: [] }
    let requestedWorkspace = sessionId ? loaded.workspacePath : workspace.current()
    if (bindWorkspace) {
      requestedWorkspace = workspacePath ?? null
      if (chooseWorkspace) {
        const selected = await dialog.showOpenDialog(window, { title: '选择会话项目目录', buttonLabel: '使用此项目', properties: ['openDirectory'] })
        if (selected.canceled || !selected.filePaths[0]) throw new BingoCommandError('OPERATION_CANCELED', 'Workspace selection was canceled.', 'page', true)
        requestedWorkspace = selected.filePaths[0]
      }
    }
    if (!requestedWorkspace) throw new BingoCommandError('SESSION_WORKSPACE_REQUIRED', 'Choose a project before opening this unclassified conversation.', 'page', true)
    const probed = await locator.probe(requestedWorkspace)
    if (!probed.ok) {
      const code = sessionId && loaded.workspacePath ? 'SESSION_WORKSPACE_UNAVAILABLE' : probed.error.code
      throw new BingoCommandError(code, probed.error.msg, probed.error.level, probed.error.recoverable)
    }
    if (bindWorkspace && !probed.value.capabilities?.includes('session.workspace.v1')) {
      throw new BingoCommandError('CAPABILITY_UNAVAILABLE', 'This Bingo version cannot bind conversations to projects.', 'page', true)
    }
    const presentation = sessionId ? sessionPresentation(sessionId, loaded.history) : undefined
    const opened = await sessions.open(sessionId ?? undefined, presentation, {
      workspacePath: probed.value.workspacePath,
      bindSessionWorkspace: bindWorkspace
    })
    try {
      await workspace.save(probed.value.workspacePath)
    } catch (error) {
      await sessions.close(opened.connectionId)
      throw error
    }
    const { transcriptPath: _, ...metadata } = opened.metadata
    return {
      connectionId: opened.connectionId,
      metadata: { ...metadata, displayName: opened.displayName },
      history: loaded.history,
      autoTitleEligible: opened.autoTitleEligible,
      runtime: probed.value,
      workspacePreferences: workspace.snapshot(),
      contextUsage: opened.contextUsage,
      ...(loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {})
    }
  })
  handle(IPC.sessionRename, sessionRenameInputSchema, async ({ sessionId, name }) => {
    const metadata = await sessions.rename(sessionId, name, await sessionLaunch(sessionId))
    const listed = await transcripts.list()
    const session = listed.sessions.find((item) => item.id === metadata.sessionId)
    if (!session) throw new Error('Renamed session is missing from the transcript list')
    sessions.updatePresentation(metadata.sessionId, session.name, false)
    return { previousId: sessionId, session }
  })
  handle(IPC.sessionDelete, sessionDeleteInputSchema, async ({ sessionId }) => ({ deletedId: await sessions.delete(sessionId, await sessionLaunch(sessionId)) }))
  handle(IPC.sessionFork, sessionForkInputSchema, async ({ sourceSessionId, reason, sourceTurnId, sourceRevision }): Promise<SessionOpened> => {
    if (!workspace) throw new Error('Workspace storage is unavailable.')
    const sourceLaunch = await sessionLaunch(sourceSessionId)
    const forked = await sessions.fork(sourceSessionId, reason, sourceTurnId, sourceRevision, sourceLaunch)
    const loaded = await retryForkHandoff(() => transcripts.load(forked.metadata.sessionId))
    const presentation = sessionPresentation(forked.metadata.sessionId, loaded.history)
    const probed = await locator.probe(loaded.workspacePath ?? forked.metadata.cwd)
    if (!probed.ok) throw new BingoCommandError('SESSION_WORKSPACE_UNAVAILABLE', probed.error.msg, probed.error.level, probed.error.recoverable)
    // Persisting the (normally unchanged) workspace can fail. Do it before replacing the
    // active source connection so every failed fork still leaves that source usable.
    await workspace.save(probed.value.workspacePath)
    const opened = await retryForkHandoff(() => sessions.openPreservingActive(
      forked.metadata.sessionId,
      presentation,
      { workspacePath: probed.value.workspacePath }
    ))
    const { transcriptPath: _, ...metadata } = opened.metadata
    return {
      connectionId: opened.connectionId,
      metadata: { ...metadata, displayName: opened.displayName },
      history: loaded.history,
      autoTitleEligible: opened.autoTitleEligible,
      runtime: probed.value,
      workspacePreferences: workspace.snapshot(),
      contextUsage: opened.contextUsage,
      warnings: forked.warnings
    }
  })
  handle(IPC.settingsReadRuntime, runtimeSettingsInputSchema, async ({ workspacePath }) => readRuntimeSettings(workspacePath))
  handle(IPC.settingsListModels, modelListInputSchema, async ({ workspacePath, provider }) => {
    return readModels(workspacePath, provider)
  })
  handle(IPC.settingsSaveRuntime, runtimeSettingsSaveInputSchema, async ({ workspacePath, provider, model, thinkingLevel, permissionMode }) => {
    const active = sessions.snapshot()
    if (active && !active.idle) throw new Error('Finish or cancel the active turn before changing provider settings')
    await validateProviderModel(workspacePath, provider, model)
    await settings.saveRuntime({ provider, model, thinkingLevel, permissionMode })
    const reconnected = await reconnect()
    const runtimeSettings = await readRuntimeSettings(workspacePath)
    return reconnected ? { ...reconnected, settings: runtimeSettings } : { settings: runtimeSettings }
  })
  handle(IPC.settingsRead, runtimeSettingsInputSchema, async ({ workspacePath }) => readSettingsSnapshot(workspacePath))
  handle(IPC.settingsSave, settingsSaveInputSchema, async ({ workspacePath, baseRevision, values }) => {
    const active = sessions.snapshot()
    if (active && !active.idle) throw new Error('Finish or cancel the active turn before saving settings')
    await validateProviderModel(workspacePath, values.provider, values.model)
    await settings.save(workspacePath, baseRevision, values)
    const reconnected = await reconnect()
    const snapshot = await readSettingsSnapshot(workspacePath)
    return reconnected ? { ...reconnected, snapshot } : { snapshot }
  })
  handle(IPC.settingsProviderUpsert, providerSettingsInputSchema, async ({ workspacePath, baseRevision, provider }) => {
    const active = sessions.snapshot()
    if (active && !active.idle) throw new Error('Finish or cancel the active turn before saving provider settings')
    await settings.upsertProvider(workspacePath, baseRevision, provider)
    const reconnected = await reconnect()
    const snapshot = await readSettingsSnapshot(workspacePath)
    return reconnected ? { ...reconnected, snapshot } : { snapshot }
  })
  handle(IPC.settingsProviderRemove, providerRemoveInputSchema, async ({ workspacePath, baseRevision, name, fallback }) => {
    const active = sessions.snapshot()
    if (active && !active.idle) throw new Error('Finish or cancel the active turn before removing a provider')
    if (fallback) await validateProviderModel(workspacePath, fallback.provider, fallback.model)
    await settings.removeProvider(workspacePath, baseRevision, name, fallback)
    const reconnected = await reconnect()
    const snapshot = await readSettingsSnapshot(workspacePath)
    return reconnected ? { ...reconnected, snapshot } : { snapshot }
  })
  handle(IPC.settingsMcpUpsert, mcpServerSettingsInputSchema, async ({ workspacePath, baseRevision, server }) => {
    const active = sessions.snapshot()
    if (active && !active.idle) throw new Error('Finish or cancel the active turn before saving MCP settings')
    await settings.upsertMcpServer(workspacePath, baseRevision, server)
    const reconnected = await reconnect()
    const snapshot = await readSettingsSnapshot(workspacePath)
    return reconnected ? { ...reconnected, snapshot } : { snapshot }
  })
  handle(IPC.settingsMcpRemove, mcpServerRemoveInputSchema, async ({ workspacePath, baseRevision, name }) => {
    const active = sessions.snapshot()
    if (active && !active.idle) throw new Error('Finish or cancel the active turn before removing an MCP server')
    await settings.removeMcpServer(workspacePath, baseRevision, name)
    const reconnected = await reconnect()
    const snapshot = await readSettingsSnapshot(workspacePath)
    return reconnected ? { ...reconnected, snapshot } : { snapshot }
  })
  handle(IPC.teamRead, connectionInputSchema, ({ connectionId }) => sessions.readTeam(connectionId))
  handle(IPC.teamValidate, connectionInputSchema, ({ connectionId }) => sessions.validateTeam(connectionId))
  handle(IPC.teamSave, teamSaveInputSchema, ({ connectionId, baseRevision, definition }) => sessions.saveTeam(connectionId, baseRevision, definition))
  handle(IPC.teamStart, connectionInputSchema, ({ connectionId }) => sessions.startTeam(connectionId))
  handle(IPC.teamStop, connectionInputSchema, ({ connectionId }) => sessions.stopTeam(connectionId))
  handle(IPC.teamLobbyGet, teamLobbyGetInputSchema, ({ connectionId, beforeSeq, limit }) => sessions.getTeamLobby(connectionId, beforeSeq, limit))
  handle(IPC.teamLobbyPost, teamLobbyPostInputSchema, ({ connectionId, text, targets }) => sessions.postTeamLobby(connectionId, text, targets))
  handle(IPC.teamAvatarImport, teamAvatarImportInputSchema, ({ connectionId, fileName, data }) => sessions.importTeamAvatar(connectionId, fileName, data))
  handle(IPC.teamAvatarGet, teamAvatarGetInputSchema, ({ connectionId, avatar }) => sessions.getTeamAvatar(connectionId, avatar))
  handle(IPC.teamPresetChoose, connectionInputSchema, async ({ connectionId }) => {
    const selected = await dialog.showOpenDialog(window, { title: '导入 Team 预设', buttonLabel: '预览此预设', properties: ['openFile'], filters: [{ name: 'Bingo Team 预设', extensions: ['bingo-team'] }] })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true as const }
    const path = selected.filePaths[0]
    if ((await stat(path)).size > 32 * 1024 * 1024) throw new BingoCommandError('CONFIG_INVALID', 'Team preset exceeds the 32 MiB limit.', 'page', true)
    const data = (await readFile(path)).toString('base64')
    return { canceled: false as const, data, preview: await sessions.inspectTeamPreset(connectionId, data) }
  })
  handle(IPC.teamPresetImport, teamPresetImportInputSchema, ({ connectionId, data, baseRevision, resolutions, modelMappings }) => sessions.importTeamPreset(connectionId, data, baseRevision, resolutions, modelMappings))
  handle(IPC.teamPresetExport, connectionInputSchema, async ({ connectionId }) => {
    const exported = await sessions.exportTeamPreset(connectionId)
    const selected = await dialog.showSaveDialog(window, { title: '导出 Team 预设', buttonLabel: '导出', defaultPath: exported.fileName, filters: [{ name: 'Bingo Team 预设', extensions: ['bingo-team'] }] })
    if (selected.canceled || !selected.filePath) return { canceled: true }
    await writeFile(selected.filePath, Buffer.from(exported.data, 'base64'))
    return { canceled: false, path: selected.filePath }
  })
  handle(IPC.teamMemberRestart, teamMemberInputSchema, ({ connectionId, member }) => sessions.restartTeamMember(connectionId, member))
  handle(IPC.teamMemberUseful, teamMemberInputSchema, ({ connectionId, member }) => sessions.markTeamMemberUseful(connectionId, member))
  handle(IPC.teamMemberPromote, teamMemberPromoteInputSchema, ({ connectionId, member, baseRevision }) => sessions.promoteTeamMember(connectionId, member, baseRevision))
  handle(IPC.teamMessage, teamMessageInputSchema, ({ connectionId, member, message }) => sessions.messageTeamMember(connectionId, member, message))
  handle(IPC.teamAgentStop, teamMemberInputSchema, ({ connectionId, member }) => sessions.stopTeamMember(connectionId, member))
  handle(IPC.teamAgentRemove, teamMemberInputSchema, ({ connectionId, member }) => sessions.removeTeamMember(connectionId, member))
  handle(IPC.teamActivity, teamMemberInputSchema, ({ connectionId, member }) => sessions.readTeamActivity(connectionId, member))
  handle(IPC.teamChannelPost, teamChannelPostInputSchema, ({ connectionId, channel, text }) => sessions.postTeamChannel(connectionId, channel, text))
  handle(IPC.teamChannelHistory, teamChannelInputSchema, ({ connectionId, channel }) => sessions.readTeamChannel(connectionId, channel))
  handle(IPC.teamTaskList, connectionInputSchema, ({ connectionId }) => sessions.listTeamTasks(connectionId))
  handle(IPC.teamTaskGet, teamTaskGetInputSchema, ({ connectionId, taskId, beforeSeq, limit }) => sessions.getTeamTask(connectionId, taskId, beforeSeq, limit))
  handle(IPC.teamTaskCreate, teamTaskCreateInputSchema, ({ connectionId, ...input }) => sessions.createTeamTask(connectionId, input))
  handle(IPC.teamTaskPost, teamTaskPostInputSchema, ({ connectionId, taskId, text }) => sessions.postTeamTask(connectionId, taskId, text))
  handle(IPC.teamTaskPause, teamTaskInputSchema, ({ connectionId, taskId }) => sessions.pauseTeamTask(connectionId, taskId))
  handle(IPC.teamTaskResume, teamTaskResumeInputSchema, ({ connectionId, taskId, message }) => sessions.resumeTeamTask(connectionId, taskId, message))
  handle(IPC.teamTaskComplete, teamTaskInputSchema, ({ connectionId, taskId }) => sessions.completeTeamTask(connectionId, taskId))
  handle(IPC.teamTaskCancel, teamTaskInputSchema, ({ connectionId, taskId }) => sessions.cancelTeamTask(connectionId, taskId))
  handle(IPC.agentDefinitionList, connectionInputSchema, ({ connectionId }) => sessions.listAgentDefinitions(connectionId))
  handle(IPC.agentDefinitionGet, agentDefinitionInputBaseSchema, ({ connectionId, scope, id }) => sessions.getAgentDefinition(connectionId, scope, id))
  handle(IPC.agentDefinitionSave, agentDefinitionSaveInputSchema, ({ connectionId, scope, id, baseRevision, definition }) => sessions.saveAgentDefinition(connectionId, scope, id, baseRevision, definition))
  handle(IPC.agentDefinitionArchive, agentDefinitionArchiveInputSchema, ({ connectionId, scope, id, baseRevision }) => sessions.archiveAgentDefinition(connectionId, scope, id, baseRevision))
  handle(IPC.sessionClose, connectionInputSchema, async ({ connectionId }) => { await sessions.close(connectionId); return { closed: true as const } })
  handle(IPC.sessionAddAttachment, sessionAttachmentInputSchema, ({ connectionId, attachmentId, data }) => sessions.addAttachment(connectionId, attachmentId, data))
  handle(IPC.sessionSend, sessionSendInputSchema, async ({ connectionId, turnId, prompt, autoTitle }) => { await sessions.send(connectionId, turnId, prompt, autoTitle); return { accepted: true as const } })
  handle(IPC.sessionCancel, sessionTurnInputSchema, async ({ connectionId, turnId }) => { await sessions.cancel(connectionId, turnId); return { requested: true as const } })
  handle(IPC.sessionRespondPrompt, sessionPromptInputSchema, async ({ connectionId, turnId, promptId, response }) => { await sessions.respond(connectionId, turnId, promptId, response); return { accepted: true as const } })

}

export function sendSessionEvent(window: BrowserWindow, event: ManagedSessionEvent): void {
  const rendererEvent: RendererSessionEvent = { connectionId: event.connectionId, sequence: event.sequence, payload: event.payload }
  if (!window.isDestroyed()) window.webContents.send(IPC.sessionEvent, rendererEvent)
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
  const square = source.crop({ x: Math.floor((size.width - side) / 2), y: Math.floor((size.height - side) / 2), width: side, height: side })
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
