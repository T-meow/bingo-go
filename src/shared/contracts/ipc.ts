import { z } from 'zod'
import { agentDefinitionInputSchema, behaviorConstraintSchema, promptIdSchema, sessionForkReasonSchema, teamDefinitionSchema, teamPresetModelMappingSchema, type AgentDefinitionDocument, type AgentDefinitionInput, type BehaviorConstraint, type CliEvent, type CliSessionMetadata, type ContextUsage, type PromptResponse, type SessionForkReason, type TeamDefinition, type TeamLobby, type TeamPresetModelMapping, type TeamPresetPreview, type TeamSnapshot, type TeamTask, type TeamTaskSummary } from './cli'
import { conversationTitleLength, MAX_CONVERSATION_TITLE_LENGTH } from '../conversationTitle'
import type { GamePackChoice, GamePackEvent, GamePackSnapshot } from './gamePacks'
import type { FrameLimits, ProtocolVersion, ServerCapabilities } from './appServer'
export * from './gamePacks'

export const IPC = {
  appGetInfo: 'app:get-info', runtimeProbe: 'runtime:probe', workspaceGet: 'workspace:get', workspaceSelect: 'workspace:select', terminalOpenExternal: 'terminal:open-external', clipboardWriteText: 'clipboard:write-text', sessionOpen: 'session:open', sessionClose: 'session:close',
  sessionAddAttachment: 'session:add-attachment', sessionSend: 'session:send', sessionCancel: 'session:cancel', sessionRespondPrompt: 'session:respond-prompt',
  sessionRename: 'session:rename', sessionDelete: 'session:delete', sessionFork: 'session:fork',
  settingsReadRuntime: 'settings:read-runtime', settingsListModels: 'settings:list-models', settingsSaveRuntime: 'settings:save-runtime',
  settingsRead: 'settings:read', settingsSave: 'settings:save',
  settingsProviderUpsert: 'settings:provider-upsert', settingsProviderRemove: 'settings:provider-remove',
  settingsMcpUpsert: 'settings:mcp-upsert', settingsMcpRemove: 'settings:mcp-remove',
  teamRead: 'team:read', teamValidate: 'team:validate', teamSave: 'team:save', teamStart: 'team:start', teamStop: 'team:stop',
  teamLobbyGet: 'team:lobby-get', teamLobbyPost: 'team:lobby-post',
  teamAvatarImport: 'team:avatar-import', teamAvatarGet: 'team:avatar-get',
  teamPresetChoose: 'team:preset-choose', teamPresetImport: 'team:preset-import', teamPresetExport: 'team:preset-export',
  teamMemberRestart: 'team:member-restart', teamMemberUseful: 'team:member-useful', teamMemberPromote: 'team:member-promote',
  teamMessage: 'team:message', teamAgentStop: 'team:agent-stop', teamAgentRemove: 'team:agent-remove', teamActivity: 'team:activity',
  teamChannelPost: 'team:channel-post', teamChannelHistory: 'team:channel-history',
  teamTaskList: 'team:task-list', teamTaskGet: 'team:task-get', teamTaskCreate: 'team:task-create', teamTaskPost: 'team:task-post',
  teamTaskPause: 'team:task-pause', teamTaskResume: 'team:task-resume', teamTaskComplete: 'team:task-complete', teamTaskCancel: 'team:task-cancel',
  agentDefinitionList: 'agent:definition-list', agentDefinitionGet: 'agent:definition-get', agentDefinitionSave: 'agent:definition-save', agentDefinitionArchive: 'agent:definition-archive',
  appearanceRead: 'appearance:read', appearanceSave: 'appearance:save',
  profileRead: 'profile:read', profileSave: 'profile:save',
  notificationPreferencesRead: 'notification-preferences:read', notificationPreferencesSave: 'notification-preferences:save', notificationActivated: 'notification:activated',
  gamePackList: 'game-pack:list', gamePackChoose: 'game-pack:choose', gamePackInstall: 'game-pack:install',
  gamePackSetEnabled: 'game-pack:set-enabled', gamePackLaunch: 'game-pack:launch', gamePackClearData: 'game-pack:clear-data',
  gamePackUninstall: 'game-pack:uninstall', gamePackEvent: 'game-pack:event',
  sessionEvent: 'session:event', sessionList: 'session:list'
} as const

export type GuiError = { code: string; msg: string; level: 'field' | 'page' | 'flow'; recoverable: boolean; action?: 'retry' }
export type Result<T> = { ok: true; value: T } | { ok: false; error: GuiError }
export type AppInfo = { appVersion: string; platform: NodeJS.Platform; arch: string; packaged: boolean }
export type RuntimeInfo = { binaryPath: string; bingoVersion: string; protocolVersion: 1; workspacePath: string; capabilities?: string[]; appServer?: { protocol: ProtocolVersion; capabilities: ServerCapabilities; limits: FrameLimits } }
export type WorkspacePreferencesV2 = { schemaVersion: 2; currentPath: string; recentPaths: string[] }
export type WorkspaceSelectionResult =
  | { canceled: true; preferences: WorkspacePreferencesV2 }
  | { canceled: false; changed: boolean; runtime: RuntimeInfo; preferences: WorkspacePreferencesV2 }
export type ExternalTerminalOpened = { terminalName: string; workspacePath: string }
export type RendererSessionMetadata = Omit<CliSessionMetadata, 'transcriptPath'>
export type RendererBingoEvent = Exclude<CliEvent, { type: 'protocol.ready' | 'inspection.ready' | 'session.ready' }>
export function isRendererBingoEvent(event: CliEvent): event is RendererBingoEvent {
  return event.type !== 'protocol.ready' && event.type !== 'inspection.ready' && event.type !== 'session.ready'
}
export type RendererCliPayload = RendererBingoEvent | {
  type: 'transport.error'; error: GuiError; exitCode: number | null; signal: string | null
}
export type RendererSessionEvent = { connectionId: string; sequence: number; payload: RendererCliPayload }
export type SessionSummary = { id: string; name: string; preview: string; updatedAt: string; messageCount: number; workspacePath: string | null; parentSessionId?: string; forkReason?: SessionForkReason }
export type MessageImageAttachment = {
  id: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif'
  dataUrl: string
  data?: string
  name?: string
}
export type SessionHistoryItem = {
  type: 'message'
  value: {
    id: string; role: 'user' | 'assistant'; markdown: string; attachments?: MessageImageAttachment[]
    turnId?: string; origin?: 'prompt' | 'assistant' | 'tool-result' | 'legacy'; editable?: boolean; revision?: string
    turnStatus?: 'started' | 'completed' | 'cancelled' | 'error'
  }
} | {
  type: 'tool'
  value: { id: string; name: string; summary: string; status: 'done' | 'error' | 'interrupted'; output?: string }
}
export type SessionListOutput = { sessions: SessionSummary[]; warnings: string[] }
export type SessionOpened = {
  connectionId: string
  metadata: RendererSessionMetadata
  history: SessionHistoryItem[]
  autoTitleEligible: boolean
  runtime: RuntimeInfo
  workspacePreferences: WorkspacePreferencesV2
  contextUsage: ContextUsage | null
  warnings?: string[]
}
export type SessionReconnected = { connectionId: string; contextUsage: ContextUsage | null }
export type SettingsLayerName = 'user' | 'project' | 'local'
export type ProviderView = {
  name: string
  protocol: 'anthropic' | 'openai'
  apiBaseUrl: string
  supportsImages: boolean
  credentialConfigured: boolean
  builtin: boolean
  oauthConfigured?: boolean
  source?: SettingsLayerName | 'builtin' | 'environment'
  editable?: boolean
}
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'bypassPermissions'
export type RuntimeSettings = { providers: ProviderView[]; provider: string; model: string; thinkingLevel: 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'; permissionMode: PermissionMode; theme: 'auto' | 'dark' | 'light' }
export type ModelListOutput = { provider: string; models: string[]; source: 'remote' | 'fallback'; warning?: GuiError }
export type EditableSettings = {
  apiBaseUrl: string
  provider: string
  model: string
  thinkingLevel: RuntimeSettings['thinkingLevel']
  permissionMode: PermissionMode
  theme: 'auto' | 'dark' | 'light'
  motion: 'auto' | 'off'
  sendImages: boolean
  cacheControl: boolean
  respondToBashCommands: boolean
  shell: string
  permissions: { allow: string[]; ask: string[]; deny: string[] }
  team: { autoStart: boolean }
  experimental: { agentChannels: boolean; channelMessageLimit: number; agentMessageLimit: number }
  share: { baseUrl: string }
}
export type SettingsLayerView = { path: string; exists: boolean; keys: string[]; values: Partial<Record<keyof EditableSettings, unknown>> }
export type McpServerView = {
  name: string
  type: 'stdio' | 'http'
  command: string
  args: string[]
  url: string
  envKeys: string[]
  headerKeys: string[]
  disabled: boolean
  source: SettingsLayerName
  editable: boolean
}
export type HookSummary = { name: string; ruleCount: number }
export type SettingsSnapshot = {
  path: string
  revision: string
  values: EditableSettings
  effective?: EditableSettings
  layers: { user: SettingsLayerView; project: SettingsLayerView; local: SettingsLayerView }
  sources: Partial<Record<keyof EditableSettings, string>>
  shadowed: Array<keyof EditableSettings>
  providers: ProviderView[]
  mcpServers?: McpServerView[]
  hooks?: HookSummary[]
}
export type SecretPatch = { action: 'unchanged' } | { action: 'clear' } | { action: 'replace'; value: string }
export type ProviderSettingsInput = {
  name: string
  protocol: 'anthropic' | 'openai'
  apiBaseUrl: string
  supportsImages: boolean
  apiKey: SecretPatch
}
export type McpServerSettingsInput = {
  name: string
  type: 'stdio' | 'http'
  command: string
  args: string[]
  url: string
  env: Record<string, SecretPatch>
  headers: Record<string, SecretPatch>
  disabled: boolean
}
export type AppearancePreferencesV1 = {
  schemaVersion: 1
  colorMode: 'system' | 'light' | 'dark'
  accentColor: string
  density: 'comfortable' | 'compact'
  motion: 'system' | 'reduced'
  inspectorCollapsed: boolean
}
export type AppearanceSnapshot = { path: string; revision: string; values: AppearancePreferencesV1 }
export type UserProfileV1 = { schemaVersion: 1; avatar: string }
export type UserProfileSnapshot = { path: string; revision: string; values: UserProfileV1; avatarDataUrl?: string }
export type UserProfileAvatarInput =
  | { kind: 'builtin'; id: string }
  | { kind: 'existing'; id: string }
  | { kind: 'upload'; fileName: string; data: string }
export type NotificationPreferencesV1 = {
  schemaVersion: 1
  enabled: boolean
  turnCompleted: boolean
  actionRequired: boolean
  failures: boolean
  sound: boolean
}
export type NotificationPreferencesSnapshot = { path: string; revision: string; values: NotificationPreferencesV1; supported: boolean }
export type NotificationActivation = { connectionId: string; kind: 'turn-completed' | 'action-required' | 'failure' }
export type WorkspacePreferencesV1 = { schemaVersion: 1; path: string }
export type AttachmentRegistration = {
  attachmentId: string
  marker: string
  mediaType: 'image/png' | 'image/jpeg'
}
const uuid = z.string().uuid()
export const clipboardWriteTextInputSchema = z.object({ text: z.string().max(1_000_000) })
export const sessionOpenInputSchema = z.object({
  sessionId: z.string().nullable(),
  workspacePath: z.string().min(1).optional(),
  chooseWorkspace: z.boolean().default(false),
  bindWorkspace: z.boolean().default(false)
}).superRefine((input, context) => {
  if (input.sessionId === null && input.bindWorkspace) context.addIssue({ code: 'custom', message: 'new sessions cannot bind an existing workspace record' })
  if (input.workspacePath && input.chooseWorkspace) context.addIssue({ code: 'custom', message: 'workspacePath and chooseWorkspace are mutually exclusive' })
  if (input.bindWorkspace && !input.workspacePath && !input.chooseWorkspace) context.addIssue({ code: 'custom', message: 'a workspace selection is required when bindWorkspace is true' })
  if (!input.bindWorkspace && (input.workspacePath || input.chooseWorkspace)) context.addIssue({ code: 'custom', message: 'workspace selection requires bindWorkspace' })
})
export const sessionRenameInputSchema = z.object({ sessionId: z.string().min(1).max(255), name: z.string().trim().min(1).max(80) })
export const sessionDeleteInputSchema = z.object({ sessionId: z.string().min(1).max(255) })
export const sessionForkInputSchema = z.object({
  sourceSessionId: z.string().min(1).max(255),
  reason: sessionForkReasonSchema,
  sourceTurnId: uuid.optional(),
  sourceRevision: z.string().length(64).regex(/^[0-9a-fA-F]+$/).optional()
}).superRefine((input, context) => {
  if (input.reason === 'edit-last-prompt' && Boolean(input.sourceTurnId) !== Boolean(input.sourceRevision)) {
    context.addIssue({ code: 'custom', message: 'sourceTurnId and sourceRevision must be provided together' })
  }
  if (input.reason === 'recover-interrupted' && (input.sourceTurnId || input.sourceRevision)) {
    context.addIssue({ code: 'custom', message: 'recover-interrupted does not accept a source turn' })
  }
})
export const runtimeSettingsInputSchema = z.object({ workspacePath: z.string().min(1) })
export const modelListInputSchema = runtimeSettingsInputSchema.extend({ provider: z.string().min(1) })
export const runtimeSettingsSaveInputSchema = runtimeSettingsInputSchema.extend({
  provider: z.string().min(1),
  model: z.string().min(1),
  thinkingLevel: z.enum(['off', 'low', 'medium', 'high', 'xhigh', 'max']),
  permissionMode: z.enum(['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'])
})
export const settingsSaveInputSchema = runtimeSettingsInputSchema.extend({
  baseRevision: z.string().length(64),
  values: z.object({
    apiBaseUrl: z.string(), provider: z.string().min(1), model: z.string().min(1),
    thinkingLevel: z.enum(['off', 'low', 'medium', 'high', 'xhigh', 'max']),
    permissionMode: z.enum(['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions']),
    theme: z.enum(['auto', 'dark', 'light']), motion: z.enum(['auto', 'off']), sendImages: z.boolean(),
    cacheControl: z.boolean(), respondToBashCommands: z.boolean(), shell: z.string(),
    permissions: z.object({ allow: z.array(z.string()), ask: z.array(z.string()), deny: z.array(z.string()) }),
    team: z.object({ autoStart: z.boolean() }),
    experimental: z.object({ agentChannels: z.boolean(), channelMessageLimit: z.number().int().positive(), agentMessageLimit: z.number().int().positive() }),
    share: z.object({ baseUrl: z.string() })
  })
})
const secretPatchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('unchanged') }),
  z.object({ action: z.literal('clear') }),
  z.object({ action: z.literal('replace'), value: z.string().min(1).max(100_000) })
])
export const providerSettingsInputSchema = runtimeSettingsInputSchema.extend({
  baseRevision: z.string().length(64),
  provider: z.object({
    name: z.string().trim().min(1).max(80), protocol: z.enum(['anthropic', 'openai']),
    apiBaseUrl: z.string().trim().max(4_096), supportsImages: z.boolean(), apiKey: secretPatchSchema
  })
})
export const providerRemoveInputSchema = runtimeSettingsInputSchema.extend({
  baseRevision: z.string().length(64), name: z.string().trim().min(1).max(80),
  fallback: z.object({ provider: z.string().min(1), model: z.string().min(1) }).optional()
})
export const mcpServerSettingsInputSchema = runtimeSettingsInputSchema.extend({
  baseRevision: z.string().length(64),
  server: z.object({
    name: z.string().trim().min(1).max(80), type: z.enum(['stdio', 'http']), command: z.string().trim().max(4_096),
    args: z.array(z.string().max(4_096)).max(256), url: z.string().trim().max(4_096),
    env: z.record(z.string().min(1).max(256), secretPatchSchema), headers: z.record(z.string().min(1).max(256), secretPatchSchema), disabled: z.boolean()
  }).superRefine((server, context) => {
    if (server.type === 'stdio' && !server.command) context.addIssue({ code: 'custom', path: ['command'], message: 'stdio server requires command' })
    if (server.type === 'http' && !server.url) context.addIssue({ code: 'custom', path: ['url'], message: 'http server requires url' })
  })
})
export const mcpServerRemoveInputSchema = runtimeSettingsInputSchema.extend({ baseRevision: z.string().length(64), name: z.string().trim().min(1).max(80) })
export const appearancePreferencesSchema = z.object({
  schemaVersion: z.literal(1),
  colorMode: z.enum(['system', 'light', 'dark']),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  density: z.enum(['comfortable', 'compact']),
  motion: z.enum(['system', 'reduced']),
  inspectorCollapsed: z.boolean().default(false)
})
export const workspacePreferencesSchema = z.discriminatedUnion('schemaVersion', [
  z.object({ schemaVersion: z.literal(1), path: z.string().min(1) }),
  z.object({
    schemaVersion: z.literal(2),
    currentPath: z.string().min(1),
    recentPaths: z.array(z.string().min(1)).max(8)
  })
])
export const appearanceSaveInputSchema = z.object({ baseRevision: z.string().length(64), values: appearancePreferencesSchema })
export const userProfileSchema = z.object({ schemaVersion: z.literal(1), avatar: z.string().min(1).max(128) })
export const profileSaveInputSchema = z.object({
  baseRevision: z.string().length(64),
  avatar: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('builtin'), id: z.string().min(1).max(128) }),
    z.object({ kind: z.literal('existing'), id: z.string().regex(/^user:[0-9a-f]{64}$/) }),
    z.object({ kind: z.literal('upload'), fileName: z.string().min(1).max(255), data: z.string().min(1).max(28_000_000) })
  ])
})
export const notificationPreferencesSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  turnCompleted: z.boolean(),
  actionRequired: z.boolean(),
  failures: z.boolean(),
  sound: z.boolean()
})
export const notificationPreferencesSaveInputSchema = z.object({ baseRevision: z.string().length(64), values: notificationPreferencesSchema })
export const notificationActivationSchema = z.object({ connectionId: uuid, kind: z.enum(['turn-completed', 'action-required', 'failure']) })
export const workspaceSelectInputSchema = z.object({ path: z.string().min(1).optional() })
export const connectionInputSchema = z.object({ connectionId: uuid })
export const teamSaveInputSchema = connectionInputSchema.extend({ baseRevision: z.string().length(64), definition: teamDefinitionSchema })
export const teamLobbyGetInputSchema = connectionInputSchema.extend({ beforeSeq: z.number().int().positive().optional(), limit: z.number().int().min(1).max(200).optional() })
export const teamLobbyPostInputSchema = connectionInputSchema.extend({ text: z.string().trim().min(1).max(1_000_000), targets: z.array(z.string().min(1).max(255)).default([]) })
export const teamAvatarImportInputSchema = connectionInputSchema.extend({ fileName: z.string().min(1).max(255), data: z.string().min(1).max(28_000_000) })
export const teamAvatarGetInputSchema = connectionInputSchema.extend({ avatar: z.string().regex(/^project:[0-9a-fA-F]{24}$/) })
export const teamPresetImportInputSchema = connectionInputSchema.extend({ data: z.string().min(1).max(44_739_244), baseRevision: z.string().length(64), resolutions: z.record(z.string(), z.enum(['update', 'keep'])).default({}), modelMappings: z.record(z.string(), teamPresetModelMappingSchema).default({}) })
export const teamMemberInputSchema = connectionInputSchema.extend({ member: z.string().min(1).max(255) })
export const teamMemberPromoteInputSchema = teamMemberInputSchema.extend({ baseRevision: z.string().length(64) })
export const teamMessageInputSchema = teamMemberInputSchema.extend({ message: z.string().trim().min(1).max(1_000_000) })
export const teamChannelInputSchema = connectionInputSchema.extend({ channel: z.string().min(1).max(255) })
export const teamChannelPostInputSchema = teamChannelInputSchema.extend({ text: z.string().trim().min(1).max(1_000_000) })
export const teamTaskInputSchema = connectionInputSchema.extend({ taskId: z.string().min(1).max(255) })
export const teamTaskGetInputSchema = teamTaskInputSchema.extend({ beforeSeq: z.number().int().positive().optional(), limit: z.number().int().min(1).max(200).optional() })
export const teamTaskCreateInputSchema = connectionInputSchema.extend({
  title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(1_000_000),
  participants: z.array(z.string().min(1).max(255)).min(1).optional(), leader: z.string().min(1).max(255).optional(),
  contextMessageSeqs: z.array(z.number().int().positive()).default([]), additionalConstraints: z.array(behaviorConstraintSchema).default([])
})
export const teamTaskPostInputSchema = teamTaskInputSchema.extend({ text: z.string().trim().min(1).max(1_000_000) })
export const teamTaskResumeInputSchema = teamTaskInputSchema.extend({ message: z.string().max(1_000_000).optional() })
export const agentDefinitionInputBaseSchema = connectionInputSchema.extend({ scope: z.enum(['user', 'project']), id: z.string().trim().min(1).max(255) })
export const agentDefinitionSaveInputSchema = agentDefinitionInputBaseSchema.extend({ baseRevision: z.string().length(64).optional(), definition: agentDefinitionInputSchema })
export const agentDefinitionArchiveInputSchema = agentDefinitionInputBaseSchema.extend({ baseRevision: z.string().length(64) })
const autoTitleSchema = z.string().trim().min(1).max(1_024).refine(
  (value) => conversationTitleLength(value) <= MAX_CONVERSATION_TITLE_LENGTH,
  `autoTitle must contain at most ${MAX_CONVERSATION_TITLE_LENGTH} characters`
)
export const sessionSendInputSchema = z.object({ connectionId: uuid, turnId: uuid, prompt: z.string().min(1).max(1_000_000), autoTitle: autoTitleSchema.optional() })
export const sessionAttachmentInputSchema = z.object({
  connectionId: uuid,
  attachmentId: z.string().min(1).max(128),
  data: z.string().min(1).max(44_739_244)
})
export const sessionTurnInputSchema = z.object({ connectionId: uuid, turnId: uuid })
export const sessionPromptInputSchema = sessionTurnInputSchema.extend({
  promptId: promptIdSchema,
  response: z.discriminatedUnion('kind', [z.object({ kind: z.literal('option'), optionId: z.string() }), z.object({ kind: z.literal('text'), text: z.string().max(100_000) }), z.object({ kind: z.literal('cancel') })])
})
export type BingoGuiApi = {
  getAppInfo(): Promise<Result<AppInfo>>
  probeRuntime(): Promise<Result<RuntimeInfo>>
  getWorkspaces(): Promise<Result<WorkspacePreferencesV2>>
  selectWorkspace(input?: { path?: string }): Promise<Result<WorkspaceSelectionResult>>
  openExternalTerminal(): Promise<Result<ExternalTerminalOpened>>
  writeClipboardText(input: z.infer<typeof clipboardWriteTextInputSchema>): Promise<Result<{ written: true }>>
  listSessions(): Promise<Result<SessionListOutput>>
  openSession(input: { sessionId: string | null; workspacePath?: string; chooseWorkspace?: boolean; bindWorkspace?: boolean }): Promise<Result<SessionOpened>>
  renameSession(input: { sessionId: string; name: string }): Promise<Result<{ previousId: string; session: SessionSummary }>>
  deleteSession(input: { sessionId: string }): Promise<Result<{ deletedId: string }>>
  forkSession(input: { sourceSessionId: string; reason: SessionForkReason; sourceTurnId?: string; sourceRevision?: string }): Promise<Result<SessionOpened>>
  readRuntimeSettings(input: { workspacePath: string }): Promise<Result<RuntimeSettings>>
  listModels(input: { workspacePath: string; provider: string }): Promise<Result<ModelListOutput>>
  saveRuntimeSettings(input: { workspacePath: string; provider: string; model: string; thinkingLevel: RuntimeSettings['thinkingLevel']; permissionMode: PermissionMode }): Promise<Result<{ connectionId?: string; contextUsage?: ContextUsage | null; settings: RuntimeSettings }>>
  readSettings(input: { workspacePath: string }): Promise<Result<SettingsSnapshot>>
  saveSettings(input: { workspacePath: string; baseRevision: string; values: EditableSettings }): Promise<Result<{ connectionId?: string; contextUsage?: ContextUsage | null; snapshot: SettingsSnapshot }>>
  upsertProvider(input: { workspacePath: string; baseRevision: string; provider: ProviderSettingsInput }): Promise<Result<{ connectionId?: string; contextUsage?: ContextUsage | null; snapshot: SettingsSnapshot }>>
  removeProvider(input: { workspacePath: string; baseRevision: string; name: string; fallback?: { provider: string; model: string } }): Promise<Result<{ connectionId?: string; contextUsage?: ContextUsage | null; snapshot: SettingsSnapshot }>>
  upsertMcpServer(input: { workspacePath: string; baseRevision: string; server: McpServerSettingsInput }): Promise<Result<{ connectionId?: string; contextUsage?: ContextUsage | null; snapshot: SettingsSnapshot }>>
  removeMcpServer(input: { workspacePath: string; baseRevision: string; name: string }): Promise<Result<{ connectionId?: string; contextUsage?: ContextUsage | null; snapshot: SettingsSnapshot }>>
  readTeam(input: { connectionId: string }): Promise<Result<TeamSnapshot>>
  validateTeam(input: { connectionId: string }): Promise<Result<{ valid: boolean; msg: string }>>
  saveTeam(input: { connectionId: string; baseRevision: string; definition: TeamDefinition }): Promise<Result<TeamSnapshot>>
  startTeam(input: { connectionId: string }): Promise<Result<TeamSnapshot>>
  stopTeam(input: { connectionId: string }): Promise<Result<TeamSnapshot>>
  getTeamLobby(input: { connectionId: string; beforeSeq?: number; limit?: number }): Promise<Result<TeamLobby>>
  postTeamLobby(input: { connectionId: string; text: string; targets?: string[] }): Promise<Result<TeamLobby>>
  importTeamAvatar(input: { connectionId: string; fileName: string; data: string }): Promise<Result<{ avatar: string; snapshot: TeamSnapshot }>>
  getTeamAvatar(input: { connectionId: string; avatar: string }): Promise<Result<{ avatar: string; dataUrl: string }>>
  chooseTeamPreset(input: { connectionId: string }): Promise<Result<{ canceled: true } | { canceled: false; data: string; preview: TeamPresetPreview }>>
  importTeamPreset(input: { connectionId: string; data: string; baseRevision: string; resolutions: Record<string, 'update' | 'keep'>; modelMappings: Record<string, TeamPresetModelMapping> }): Promise<Result<{ preview: TeamPresetPreview; snapshot: TeamSnapshot }>>
  exportTeamPreset(input: { connectionId: string }): Promise<Result<{ canceled: boolean; path?: string }>>
  restartTeamMember(input: { connectionId: string; member: string }): Promise<Result<TeamSnapshot>>
  markTeamMemberUseful(input: { connectionId: string; member: string }): Promise<Result<TeamSnapshot>>
  promoteTeamMember(input: { connectionId: string; member: string; baseRevision: string }): Promise<Result<{ memberId?: string; snapshot: TeamSnapshot }>>
  messageTeamMember(input: { connectionId: string; member: string; message: string }): Promise<Result<TeamSnapshot>>
  stopTeamMember(input: { connectionId: string; member: string }): Promise<Result<TeamSnapshot>>
  removeTeamMember(input: { connectionId: string; member: string }): Promise<Result<TeamSnapshot>>
  readTeamActivity(input: { connectionId: string; member: string }): Promise<Result<{ member: string; activity: Array<{ id: string; kind: string; summary: string; status: string }> }>>
  postTeamChannel(input: { connectionId: string; channel: string; text: string }): Promise<Result<TeamSnapshot>>
  readTeamChannel(input: { connectionId: string; channel: string }): Promise<Result<TeamSnapshot>>
  listTeamTasks(input: { connectionId: string }): Promise<Result<{ branch: string; tasks: TeamTaskSummary[] }>>
  getTeamTask(input: { connectionId: string; taskId: string; beforeSeq?: number; limit?: number }): Promise<Result<TeamTask>>
  createTeamTask(input: { connectionId: string; title: string; description: string; participants?: string[]; leader?: string; contextMessageSeqs?: number[]; additionalConstraints?: BehaviorConstraint[] }): Promise<Result<TeamTask>>
  postTeamTask(input: { connectionId: string; taskId: string; text: string }): Promise<Result<TeamTaskSummary>>
  pauseTeamTask(input: { connectionId: string; taskId: string }): Promise<Result<TeamTaskSummary>>
  resumeTeamTask(input: { connectionId: string; taskId: string; message?: string }): Promise<Result<TeamTaskSummary>>
  completeTeamTask(input: { connectionId: string; taskId: string }): Promise<Result<TeamTaskSummary>>
  cancelTeamTask(input: { connectionId: string; taskId: string }): Promise<Result<TeamTaskSummary>>
  listAgentDefinitions(input: { connectionId: string }): Promise<Result<AgentDefinitionDocument[]>>
  getAgentDefinition(input: { connectionId: string; scope: 'user' | 'project'; id: string }): Promise<Result<AgentDefinitionDocument>>
  saveAgentDefinition(input: { connectionId: string; scope: 'user' | 'project'; id: string; baseRevision?: string; definition: AgentDefinitionInput }): Promise<Result<AgentDefinitionDocument>>
  archiveAgentDefinition(input: { connectionId: string; scope: 'user' | 'project'; id: string; baseRevision: string }): Promise<Result<{ definition: AgentDefinitionDocument; archivePath?: string }>>
  readAppearance(): Promise<Result<AppearanceSnapshot>>
  saveAppearance(input: { baseRevision: string; values: AppearancePreferencesV1 }): Promise<Result<AppearanceSnapshot>>
  readProfile(): Promise<Result<UserProfileSnapshot>>
  saveProfile(input: { baseRevision: string; avatar: UserProfileAvatarInput }): Promise<Result<UserProfileSnapshot>>
  readNotificationPreferences(): Promise<Result<NotificationPreferencesSnapshot>>
  saveNotificationPreferences(input: { baseRevision: string; values: NotificationPreferencesV1 }): Promise<Result<NotificationPreferencesSnapshot>>
  closeSession(input: { connectionId: string }): Promise<Result<{ closed: true }>>
  addAttachment(input: { connectionId: string; attachmentId: string; data: string }): Promise<Result<AttachmentRegistration>>
  sendTurn(input: { connectionId: string; turnId: string; prompt: string; autoTitle?: string }): Promise<Result<{ accepted: true }>>
  cancelTurn(input: { connectionId: string; turnId: string }): Promise<Result<{ requested: true }>>
  respondToPrompt(input: { connectionId: string; turnId: string; promptId: string; response: PromptResponse }): Promise<Result<{ accepted: true }>>
  listGamePacks(): Promise<Result<GamePackSnapshot>>
  chooseGamePack(): Promise<Result<GamePackChoice>>
  installGamePack(input: { token: string; baseRevision: string }): Promise<Result<GamePackSnapshot>>
  setGamePackEnabled(input: { id: string; enabled: boolean; baseRevision: string }): Promise<Result<GamePackSnapshot>>
  launchGamePack(input: { id: string }): Promise<Result<{ launched: true }>>
  clearGamePackData(input: { id: string }): Promise<Result<{ cleared: true }>>
  uninstallGamePack(input: { id: string; clearData: boolean; baseRevision: string }): Promise<Result<GamePackSnapshot>>
  onSessionEvent(listener: (event: RendererSessionEvent) => void): () => void
  onNotificationActivated(listener: (event: NotificationActivation) => void): () => void
  onGamePackEvent(listener: (event: GamePackEvent) => void): () => void
}
