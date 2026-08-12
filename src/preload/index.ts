import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC, appearanceSaveInputSchema, connectionInputSchema, mcpServerRemoveInputSchema, mcpServerSettingsInputSchema, modelListInputSchema, providerRemoveInputSchema, providerSettingsInputSchema, runtimeSettingsInputSchema, runtimeSettingsSaveInputSchema, settingsSaveInputSchema, sessionAttachmentInputSchema, sessionDeleteInputSchema, sessionOpenInputSchema, sessionPromptInputSchema, sessionRenameInputSchema, sessionSendInputSchema,
  sessionTurnInputSchema, teamChannelInputSchema, teamChannelPostInputSchema, teamMemberInputSchema, teamMessageInputSchema, teamSaveInputSchema, visualCaptureInputSchema, workspaceSelectInputSchema, type BingoGuiApi, type RendererSessionEvent
} from '../shared/contracts/ipc'

const api: BingoGuiApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appGetInfo),
  probeRuntime: () => ipcRenderer.invoke(IPC.runtimeProbe),
  getWorkspaces: () => ipcRenderer.invoke(IPC.workspaceGet),
  selectWorkspace: (input = {}) => ipcRenderer.invoke(IPC.workspaceSelect, workspaceSelectInputSchema.parse(input)),
  listSessions: () => ipcRenderer.invoke(IPC.sessionList),
  openSession: (input) => ipcRenderer.invoke(IPC.sessionOpen, sessionOpenInputSchema.parse(input)),
  renameSession: (input) => ipcRenderer.invoke(IPC.sessionRename, sessionRenameInputSchema.parse(input)),
  deleteSession: (input) => ipcRenderer.invoke(IPC.sessionDelete, sessionDeleteInputSchema.parse(input)),
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
  messageTeamMember: (input) => ipcRenderer.invoke(IPC.teamMessage, teamMessageInputSchema.parse(input)),
  stopTeamMember: (input) => ipcRenderer.invoke(IPC.teamAgentStop, teamMemberInputSchema.parse(input)),
  removeTeamMember: (input) => ipcRenderer.invoke(IPC.teamAgentRemove, teamMemberInputSchema.parse(input)),
  readTeamActivity: (input) => ipcRenderer.invoke(IPC.teamActivity, teamMemberInputSchema.parse(input)),
  postTeamChannel: (input) => ipcRenderer.invoke(IPC.teamChannelPost, teamChannelPostInputSchema.parse(input)),
  readTeamChannel: (input) => ipcRenderer.invoke(IPC.teamChannelHistory, teamChannelInputSchema.parse(input)),
  readAppearance: () => ipcRenderer.invoke(IPC.appearanceRead),
  saveAppearance: (input) => ipcRenderer.invoke(IPC.appearanceSave, appearanceSaveInputSchema.parse(input)),
  closeSession: (input) => ipcRenderer.invoke(IPC.sessionClose, connectionInputSchema.parse(input)),
  addAttachment: (input) => ipcRenderer.invoke(IPC.sessionAddAttachment, sessionAttachmentInputSchema.parse(input)),
  sendTurn: (input) => ipcRenderer.invoke(IPC.sessionSend, sessionSendInputSchema.parse(input)),
  cancelTurn: (input) => ipcRenderer.invoke(IPC.sessionCancel, sessionTurnInputSchema.parse(input)),
  respondToPrompt: (input) => ipcRenderer.invoke(IPC.sessionRespondPrompt, sessionPromptInputSchema.parse(input)),
  captureVisual: (input) => ipcRenderer.invoke(IPC.visualCapture, visualCaptureInputSchema.parse(input)),
  onSessionEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: RendererSessionEvent): void => listener(value)
    ipcRenderer.on(IPC.sessionEvent, handler)
    return () => ipcRenderer.removeListener(IPC.sessionEvent, handler)
  }
}

contextBridge.exposeInMainWorld('bingoGui', api)
