import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  appearanceSaveInputSchema,
  clipboardWriteTextInputSchema,
  gamePackClearDataInputSchema,
  gamePackEventSchema,
  gamePackInstallInputSchema,
  gamePackLaunchInputSchema,
  gamePackSetEnabledInputSchema,
  gamePackUninstallInputSchema,
  mcpServerRemoveInputSchema,
  mcpServerSettingsInputSchema,
  modelListInputSchema,
  notificationActivationSchema,
  notificationPreferencesSaveInputSchema,
  profileSaveInputSchema,
  providerRemoveInputSchema,
  providerSettingsInputSchema,
  settingsReadInputSchema,
  workspaceSelectInputSchema,
  type BingoGuiApi,
  type GamePackEvent
} from '../shared/contracts/ipc'
import {
  APP_SERVER_CHANNELS,
  APP_SERVER_EVENT,
  appServerActionExecuteInputSchema,
  appServerCatalogInputSchema,
  appServerConnectInputSchema,
  appServerInterruptInputSchema,
  appServerMarkReadInputSchema,
  appServerProbeInputSchema,
  appServerQueueReadInputSchema,
  appServerQueueReclaimInputSchema,
  appServerReadAssetInputSchema,
  appServerReadConversationInputSchema,
  appServerRegisterAssetInputSchema,
  appServerResourceInputSchema,
  appServerRespondInputSchema,
  appServerResumeInputSchema,
  appServerSessionDeleteInputSchema,
  appServerSubmitInputSchema,
  type AppServerRendererEvent,
  type BingoAppApi
} from '../shared/contracts/appServerIpc'

const guiApi: BingoGuiApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appGetInfo),
  getWorkspaces: () => ipcRenderer.invoke(IPC.workspaceGet),
  selectWorkspace: (input = {}) => ipcRenderer.invoke(IPC.workspaceSelect, workspaceSelectInputSchema.parse(input)),
  openExternalTerminal: () => ipcRenderer.invoke(IPC.terminalOpenExternal),
  writeClipboardText: (input) => ipcRenderer.invoke(IPC.clipboardWriteText, clipboardWriteTextInputSchema.parse(input)),
  readSettings: (input) => ipcRenderer.invoke(IPC.settingsRead, settingsReadInputSchema.parse(input)),
  listModels: (input) => ipcRenderer.invoke(IPC.settingsListModels, modelListInputSchema.parse(input)),
  upsertProvider: (input) => ipcRenderer.invoke(IPC.settingsProviderUpsert, providerSettingsInputSchema.parse(input)),
  removeProvider: (input) => ipcRenderer.invoke(IPC.settingsProviderRemove, providerRemoveInputSchema.parse(input)),
  upsertMcpServer: (input) => ipcRenderer.invoke(IPC.settingsMcpUpsert, mcpServerSettingsInputSchema.parse(input)),
  removeMcpServer: (input) => ipcRenderer.invoke(IPC.settingsMcpRemove, mcpServerRemoveInputSchema.parse(input)),
  readAppearance: () => ipcRenderer.invoke(IPC.appearanceRead),
  saveAppearance: (input) => ipcRenderer.invoke(IPC.appearanceSave, appearanceSaveInputSchema.parse(input)),
  readProfile: () => ipcRenderer.invoke(IPC.profileRead),
  saveProfile: (input) => ipcRenderer.invoke(IPC.profileSave, profileSaveInputSchema.parse(input)),
  readNotificationPreferences: () => ipcRenderer.invoke(IPC.notificationPreferencesRead),
  saveNotificationPreferences: (input) => ipcRenderer.invoke(IPC.notificationPreferencesSave, notificationPreferencesSaveInputSchema.parse(input)),
  listGamePacks: () => ipcRenderer.invoke(IPC.gamePackList),
  chooseGamePack: () => ipcRenderer.invoke(IPC.gamePackChoose),
  installGamePack: (input) => ipcRenderer.invoke(IPC.gamePackInstall, gamePackInstallInputSchema.parse(input)),
  setGamePackEnabled: (input) => ipcRenderer.invoke(IPC.gamePackSetEnabled, gamePackSetEnabledInputSchema.parse(input)),
  launchGamePack: (input) => ipcRenderer.invoke(IPC.gamePackLaunch, gamePackLaunchInputSchema.parse(input)),
  clearGamePackData: (input) => ipcRenderer.invoke(IPC.gamePackClearData, gamePackClearDataInputSchema.parse(input)),
  uninstallGamePack: (input) => ipcRenderer.invoke(IPC.gamePackUninstall, gamePackUninstallInputSchema.parse(input)),
  onNotificationActivated: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      const parsed = notificationActivationSchema.safeParse(value)
      if (parsed.success) listener(parsed.data)
    }
    ipcRenderer.on(IPC.notificationActivated, handler)
    return () => ipcRenderer.removeListener(IPC.notificationActivated, handler)
  },
  onGamePackEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      const parsed = gamePackEventSchema.safeParse(value)
      if (parsed.success) listener(parsed.data as GamePackEvent)
    }
    ipcRenderer.on(IPC.gamePackEvent, handler)
    return () => ipcRenderer.removeListener(IPC.gamePackEvent, handler)
  }
}

const appApi: BingoAppApi = {
  probe: (workspacePath) => ipcRenderer.invoke(APP_SERVER_CHANNELS.probe, appServerProbeInputSchema.parse({ workspacePath })),
  connect: (workspacePath) => ipcRenderer.invoke(APP_SERVER_CHANNELS.connect, appServerConnectInputSchema.parse({ workspacePath })),
  resume: (locator) => ipcRenderer.invoke(APP_SERVER_CHANNELS.resume, appServerResumeInputSchema.parse({ locator })),
  disconnect: () => ipcRenderer.invoke(APP_SERVER_CHANNELS.disconnect),
  listSessions: () => ipcRenderer.invoke(APP_SERVER_CHANNELS.listSessions),
  readConversation: (params) => ipcRenderer.invoke(APP_SERVER_CHANNELS.readConversation, appServerReadConversationInputSchema.parse(params)),
  markRead: (params) => ipcRenderer.invoke(APP_SERVER_CHANNELS.markRead, appServerMarkReadInputSchema.parse(params)),
  composerSubmit: (conversationId, text, mode, attachments) => ipcRenderer.invoke(APP_SERVER_CHANNELS.submit, appServerSubmitInputSchema.parse({ conversationId, text, mode, attachments })),
  sendProse: (conversationId, text, attachments) => ipcRenderer.invoke(APP_SERVER_CHANNELS.submit, appServerSubmitInputSchema.parse({ conversationId, text, mode: 'normal', attachments, prose: true })),
  interrupt: (params) => ipcRenderer.invoke(APP_SERVER_CHANNELS.interrupt, appServerInterruptInputSchema.parse(params)),
  respond: (interactionId, decision, activation) => ipcRenderer.invoke(APP_SERVER_CHANNELS.respond, appServerRespondInputSchema.parse({ interactionId, decision, activation })),
  readConfig: () => ipcRenderer.invoke(APP_SERVER_CHANNELS.readConfig),
  readCatalog: (kind, provider) => ipcRenderer.invoke(APP_SERVER_CHANNELS.readCatalog, appServerCatalogInputSchema.parse({ kind, provider })),
  listActions: () => ipcRenderer.invoke(APP_SERVER_CHANNELS.listActions),
  executeAction: (params) => ipcRenderer.invoke(APP_SERVER_CHANNELS.executeAction, appServerActionExecuteInputSchema.parse(params)),
  readResource: (kind, cursor) => ipcRenderer.invoke(APP_SERVER_CHANNELS.readResource, appServerResourceInputSchema.parse({ kind, cursor })),
  registerAsset: (path, expectedMime) => ipcRenderer.invoke(APP_SERVER_CHANNELS.registerAsset, appServerRegisterAssetInputSchema.parse({ path, expectedMime })),
  readAssetDataUrl: (assetId, mime) => ipcRenderer.invoke(APP_SERVER_CHANNELS.readAssetDataUrl, appServerReadAssetInputSchema.parse({ assetId, mime })),
  queueRead: (params) => ipcRenderer.invoke(APP_SERVER_CHANNELS.queueRead, appServerQueueReadInputSchema.parse(params)),
  queueReclaimTail: (params) => ipcRenderer.invoke(APP_SERVER_CHANNELS.queueReclaimTail, appServerQueueReclaimInputSchema.parse(params)),
  sessionDelete: (params) => ipcRenderer.invoke(APP_SERVER_CHANNELS.sessionDelete, appServerSessionDeleteInputSchema.parse(params)),
  restartAfterDefinitionWrite: () => ipcRenderer.invoke(APP_SERVER_CHANNELS.restartAfterDefinitionWrite),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: AppServerRendererEvent): void => listener(value)
    ipcRenderer.on(APP_SERVER_EVENT, handler)
    return () => ipcRenderer.removeListener(APP_SERVER_EVENT, handler)
  }
}

contextBridge.exposeInMainWorld('bingoGui', guiApi)
contextBridge.exposeInMainWorld('bingoApp', appApi)
