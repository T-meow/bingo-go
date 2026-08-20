import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC, appearanceSaveInputSchema, clipboardWriteTextInputSchema, connectionInputSchema, mcpServerRemoveInputSchema, mcpServerSettingsInputSchema, modelListInputSchema, notificationActivationSchema, notificationPreferencesSaveInputSchema, profileSaveInputSchema, providerRemoveInputSchema, providerSettingsInputSchema, runtimeSettingsInputSchema, runtimeSettingsSaveInputSchema, settingsSaveInputSchema, sessionAttachmentInputSchema, sessionDeleteInputSchema, sessionOpenInputSchema, sessionPromptInputSchema, sessionRenameInputSchema, sessionSendInputSchema,
  sessionForkInputSchema, sessionTurnInputSchema, agentDefinitionArchiveInputSchema, agentDefinitionInputBaseSchema, agentDefinitionSaveInputSchema, gamePackClearDataInputSchema, gamePackEventSchema, gamePackInstallInputSchema, gamePackLaunchInputSchema, gamePackSetEnabledInputSchema, gamePackUninstallInputSchema, teamAvatarGetInputSchema, teamAvatarImportInputSchema, teamChannelInputSchema, teamChannelPostInputSchema, teamLobbyGetInputSchema, teamLobbyPostInputSchema, teamMemberInputSchema, teamMemberPromoteInputSchema, teamMessageInputSchema, teamPresetImportInputSchema, teamSaveInputSchema, teamTaskCreateInputSchema, teamTaskGetInputSchema, teamTaskInputSchema, teamTaskPostInputSchema, teamTaskResumeInputSchema, workspaceSelectInputSchema, type BingoGuiApi, type GamePackEvent, type RendererSessionEvent
} from '../shared/contracts/ipc'
import type { AppServerRendererEvent, BingoAppApi, Result } from '../shared/contracts/appServerIpc'

const api: BingoGuiApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appGetInfo),
  probeRuntime: () => ipcRenderer.invoke(IPC.runtimeProbe),
  getWorkspaces: () => ipcRenderer.invoke(IPC.workspaceGet),
  selectWorkspace: (input = {}) => ipcRenderer.invoke(IPC.workspaceSelect, workspaceSelectInputSchema.parse(input)),
  openExternalTerminal: () => ipcRenderer.invoke(IPC.terminalOpenExternal),
  writeClipboardText: (input) => ipcRenderer.invoke(IPC.clipboardWriteText, clipboardWriteTextInputSchema.parse(input)),
  listSessions: () => ipcRenderer.invoke(IPC.sessionList),
  openSession: (input) => ipcRenderer.invoke(IPC.sessionOpen, sessionOpenInputSchema.parse(input)),
  renameSession: (input) => ipcRenderer.invoke(IPC.sessionRename, sessionRenameInputSchema.parse(input)),
  deleteSession: (input) => ipcRenderer.invoke(IPC.sessionDelete, sessionDeleteInputSchema.parse(input)),
  forkSession: (input) => ipcRenderer.invoke(IPC.sessionFork, sessionForkInputSchema.parse(input)),
  readRuntimeSettings: (input) => ipcRenderer.invoke(IPC.settingsReadRuntime, runtimeSettingsInputSchema.parse(input)),
  listModels: (input) => ipcRenderer.invoke(IPC.settingsListModels, modelListInputSchema.parse(input)),
  saveRuntimeSettings: (input) => ipcRenderer.invoke(IPC.settingsSaveRuntime, runtimeSettingsSaveInputSchema.parse(input)),
  readSettings: (input) => ipcRenderer.invoke(IPC.settingsRead, runtimeSettingsInputSchema.parse(input)),
  saveSettings: (input) => ipcRenderer.invoke(IPC.settingsSave, settingsSaveInputSchema.parse(input)),
  upsertProvider: (input) => ipcRenderer.invoke(IPC.settingsProviderUpsert, providerSettingsInputSchema.parse(input)),
  removeProvider: (input) => ipcRenderer.invoke(IPC.settingsProviderRemove, providerRemoveInputSchema.parse(input)),
  upsertMcpServer: (input) => ipcRenderer.invoke(IPC.settingsMcpUpsert, mcpServerSettingsInputSchema.parse(input)),
  removeMcpServer: (input) => ipcRenderer.invoke(IPC.settingsMcpRemove, mcpServerRemoveInputSchema.parse(input)),
  readTeam: (input) => ipcRenderer.invoke(IPC.teamRead, connectionInputSchema.parse(input)),
  validateTeam: (input) => ipcRenderer.invoke(IPC.teamValidate, connectionInputSchema.parse(input)),
  saveTeam: (input) => ipcRenderer.invoke(IPC.teamSave, teamSaveInputSchema.parse(input)),
  startTeam: (input) => ipcRenderer.invoke(IPC.teamStart, connectionInputSchema.parse(input)),
  stopTeam: (input) => ipcRenderer.invoke(IPC.teamStop, connectionInputSchema.parse(input)),
  getTeamLobby: (input) => ipcRenderer.invoke(IPC.teamLobbyGet, teamLobbyGetInputSchema.parse(input)),
  postTeamLobby: (input) => ipcRenderer.invoke(IPC.teamLobbyPost, teamLobbyPostInputSchema.parse(input)),
  importTeamAvatar: (input) => ipcRenderer.invoke(IPC.teamAvatarImport, teamAvatarImportInputSchema.parse(input)),
  getTeamAvatar: (input) => ipcRenderer.invoke(IPC.teamAvatarGet, teamAvatarGetInputSchema.parse(input)),
  chooseTeamPreset: (input) => ipcRenderer.invoke(IPC.teamPresetChoose, connectionInputSchema.parse(input)),
  importTeamPreset: (input) => ipcRenderer.invoke(IPC.teamPresetImport, teamPresetImportInputSchema.parse(input)),
  exportTeamPreset: (input) => ipcRenderer.invoke(IPC.teamPresetExport, connectionInputSchema.parse(input)),
  restartTeamMember: (input) => ipcRenderer.invoke(IPC.teamMemberRestart, teamMemberInputSchema.parse(input)),
  markTeamMemberUseful: (input) => ipcRenderer.invoke(IPC.teamMemberUseful, teamMemberInputSchema.parse(input)),
  promoteTeamMember: (input) => ipcRenderer.invoke(IPC.teamMemberPromote, teamMemberPromoteInputSchema.parse(input)),
  messageTeamMember: (input) => ipcRenderer.invoke(IPC.teamMessage, teamMessageInputSchema.parse(input)),
  stopTeamMember: (input) => ipcRenderer.invoke(IPC.teamAgentStop, teamMemberInputSchema.parse(input)),
  removeTeamMember: (input) => ipcRenderer.invoke(IPC.teamAgentRemove, teamMemberInputSchema.parse(input)),
  readTeamActivity: (input) => ipcRenderer.invoke(IPC.teamActivity, teamMemberInputSchema.parse(input)),
  postTeamChannel: (input) => ipcRenderer.invoke(IPC.teamChannelPost, teamChannelPostInputSchema.parse(input)),
  readTeamChannel: (input) => ipcRenderer.invoke(IPC.teamChannelHistory, teamChannelInputSchema.parse(input)),
  listTeamTasks: (input) => ipcRenderer.invoke(IPC.teamTaskList, connectionInputSchema.parse(input)),
  getTeamTask: (input) => ipcRenderer.invoke(IPC.teamTaskGet, teamTaskGetInputSchema.parse(input)),
  createTeamTask: (input) => ipcRenderer.invoke(IPC.teamTaskCreate, teamTaskCreateInputSchema.parse(input)),
  postTeamTask: (input) => ipcRenderer.invoke(IPC.teamTaskPost, teamTaskPostInputSchema.parse(input)),
  pauseTeamTask: (input) => ipcRenderer.invoke(IPC.teamTaskPause, teamTaskInputSchema.parse(input)),
  resumeTeamTask: (input) => ipcRenderer.invoke(IPC.teamTaskResume, teamTaskResumeInputSchema.parse(input)),
  completeTeamTask: (input) => ipcRenderer.invoke(IPC.teamTaskComplete, teamTaskInputSchema.parse(input)),
  cancelTeamTask: (input) => ipcRenderer.invoke(IPC.teamTaskCancel, teamTaskInputSchema.parse(input)),
  listAgentDefinitions: (input) => ipcRenderer.invoke(IPC.agentDefinitionList, connectionInputSchema.parse(input)),
  getAgentDefinition: (input) => ipcRenderer.invoke(IPC.agentDefinitionGet, agentDefinitionInputBaseSchema.parse(input)),
  saveAgentDefinition: (input) => ipcRenderer.invoke(IPC.agentDefinitionSave, agentDefinitionSaveInputSchema.parse(input)),
  archiveAgentDefinition: (input) => ipcRenderer.invoke(IPC.agentDefinitionArchive, agentDefinitionArchiveInputSchema.parse(input)),
  readAppearance: () => ipcRenderer.invoke(IPC.appearanceRead),
  saveAppearance: (input) => ipcRenderer.invoke(IPC.appearanceSave, appearanceSaveInputSchema.parse(input)),
  readProfile: () => ipcRenderer.invoke(IPC.profileRead),
  saveProfile: (input) => ipcRenderer.invoke(IPC.profileSave, profileSaveInputSchema.parse(input)),
  readNotificationPreferences: () => ipcRenderer.invoke(IPC.notificationPreferencesRead),
  saveNotificationPreferences: (input) => ipcRenderer.invoke(IPC.notificationPreferencesSave, notificationPreferencesSaveInputSchema.parse(input)),
  closeSession: (input) => ipcRenderer.invoke(IPC.sessionClose, connectionInputSchema.parse(input)),
  addAttachment: (input) => ipcRenderer.invoke(IPC.sessionAddAttachment, sessionAttachmentInputSchema.parse(input)),
  sendTurn: (input) => ipcRenderer.invoke(IPC.sessionSend, sessionSendInputSchema.parse(input)),
  cancelTurn: (input) => ipcRenderer.invoke(IPC.sessionCancel, sessionTurnInputSchema.parse(input)),
  respondToPrompt: (input) => ipcRenderer.invoke(IPC.sessionRespondPrompt, sessionPromptInputSchema.parse(input)),
  listGamePacks: () => ipcRenderer.invoke(IPC.gamePackList),
  chooseGamePack: () => ipcRenderer.invoke(IPC.gamePackChoose),
  installGamePack: (input) => ipcRenderer.invoke(IPC.gamePackInstall, gamePackInstallInputSchema.parse(input)),
  setGamePackEnabled: (input) => ipcRenderer.invoke(IPC.gamePackSetEnabled, gamePackSetEnabledInputSchema.parse(input)),
  launchGamePack: (input) => ipcRenderer.invoke(IPC.gamePackLaunch, gamePackLaunchInputSchema.parse(input)),
  clearGamePackData: (input) => ipcRenderer.invoke(IPC.gamePackClearData, gamePackClearDataInputSchema.parse(input)),
  uninstallGamePack: (input) => ipcRenderer.invoke(IPC.gamePackUninstall, gamePackUninstallInputSchema.parse(input)),
  onSessionEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: RendererSessionEvent): void => listener(value)
    ipcRenderer.on(IPC.sessionEvent, handler)
    return () => ipcRenderer.removeListener(IPC.sessionEvent, handler)
  },
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

contextBridge.exposeInMainWorld('bingoGui', api)

const appApi: BingoAppApi = {
  probe: (workspacePath) => ipcRenderer.invoke('app-server:probe', { workspacePath }),
  connect: (workspacePath) => ipcRenderer.invoke('app-server:connect', { workspacePath }),
  resume: (locator) => ipcRenderer.invoke('app-server:resume', { locator }),
  disconnect: () => ipcRenderer.invoke('app-server:disconnect'),
  listSessions: () => ipcRenderer.invoke('app-server:list-sessions'),
  readConversation: (params) => ipcRenderer.invoke('app-server:read-conversation', params),
  markRead: (params) => ipcRenderer.invoke('app-server:mark-read', params),
  composerSubmit: (conversationId, text, mode, attachments) => ipcRenderer.invoke('app-server:submit', { conversationId, text, mode, attachments }),
  sendProse: (conversationId, text, attachments) => ipcRenderer.invoke('app-server:submit', { conversationId, text, mode: 'normal', attachments, prose: true }),
  interrupt: (params) => ipcRenderer.invoke('app-server:interrupt', params),
  respond: (interactionId, decision, activation) => ipcRenderer.invoke('app-server:respond', { interactionId, decision, activation }),
  readConfig: () => ipcRenderer.invoke('app-server:read-config'),
  readCatalog: (kind, provider) => ipcRenderer.invoke('app-server:read-catalog', { kind, provider }),
  listActions: () => ipcRenderer.invoke('app-server:list-actions'),
  executeAction: (params) => ipcRenderer.invoke('app-server:execute-action', params),
  readResource: (kind, cursor) => ipcRenderer.invoke('app-server:read-resource', { kind, cursor }),
  registerAsset: (path, expectedMime) => ipcRenderer.invoke('app-server:register-asset', { path, expectedMime }),
  readAssetDataUrl: (assetId, mime) => ipcRenderer.invoke('app-server:read-asset-data-url', { assetId, mime }),
  queueRead: (params) => ipcRenderer.invoke('app-server:queue-read', params),
  queueReclaimTail: (params) => ipcRenderer.invoke('app-server:queue-reclaim', params),
  sessionDelete: (params) => ipcRenderer.invoke('app-server:session-delete', params),
  restartAfterDefinitionWrite: () => ipcRenderer.invoke('app-server:restart-after-definition-write'),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: AppServerRendererEvent): void => listener(value)
    ipcRenderer.on('app-server:event', handler)
    return () => ipcRenderer.removeListener('app-server:event', handler)
  }
}

contextBridge.exposeInMainWorld('bingoApp', appApi)

