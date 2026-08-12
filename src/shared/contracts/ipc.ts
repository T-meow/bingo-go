import { z } from 'zod'
import { teamDefinitionSchema, type CliEvent, type CliSessionMetadata, type PromptResponse, type TeamDefinition, type TeamSnapshot } from './cli'

export const IPC = {
  appGetInfo: 'app:get-info', runtimeProbe: 'runtime:probe', workspaceGet: 'workspace:get', workspaceSelect: 'workspace:select', sessionOpen: 'session:open', sessionClose: 'session:close',
  sessionAddAttachment: 'session:add-attachment', sessionSend: 'session:send', sessionCancel: 'session:cancel', sessionRespondPrompt: 'session:respond-prompt',
  sessionRename: 'session:rename', sessionDelete: 'session:delete',
  settingsReadRuntime: 'settings:read-runtime', settingsListModels: 'settings:list-models', settingsSaveRuntime: 'settings:save-runtime',
  settingsRead: 'settings:read', settingsSave: 'settings:save',
  settingsProviderUpsert: 'settings:provider-upsert', settingsProviderRemove: 'settings:provider-remove',
  settingsMcpUpsert: 'settings:mcp-upsert', settingsMcpRemove: 'settings:mcp-remove',
  teamRead: 'team:read', teamValidate: 'team:validate', teamSave: 'team:save', teamStart: 'team:start', teamStop: 'team:stop',
  teamMessage: 'team:message', teamAgentStop: 'team:agent-stop', teamAgentRemove: 'team:agent-remove', teamActivity: 'team:activity',
  teamChannelPost: 'team:channel-post', teamChannelHistory: 'team:channel-history',
  appearanceRead: 'appearance:read', appearanceSave: 'appearance:save',
  sessionEvent: 'session:event', sessionList: 'session:list', visualCapture: 'visual:capture'
} as const

export type GuiError = { code: string; msg: string; level: 'field' | 'page' | 'flow'; recoverable: boolean; action?: 'retry' }
export type Result<T> = { ok: true; value: T } | { ok: false; error: GuiError }
export type AppInfo = { appVersion: string; platform: NodeJS.Platform; arch: string; packaged: boolean }
export type RuntimeInfo = { binaryPath: string; bingoVersion: string; protocolVersion: 1; workspacePath: string; capabilities?: string[] }
export type WorkspacePreferencesV2 = { schemaVersion: 2; currentPath: string; recentPaths: string[] }
export type WorkspaceSelectionResult =
  | { canceled: true; preferences: WorkspacePreferencesV2 }
  | { canceled: false; changed: boolean; runtime: RuntimeInfo; preferences: WorkspacePreferencesV2 }
export type RendererSessionMetadata = Omit<CliSessionMetadata, 'transcriptPath'>
export type RendererCliPayload = Exclude<CliEvent, { type: 'protocol.ready' | 'inspection.ready' | 'session.ready' }> | {
  type: 'transport.error'; error: GuiError; exitCode: number | null; signal: string | null
}
export type RendererSessionEvent = { connectionId: string; sequence: number; payload: RendererCliPayload }
export type SessionSummary = { id: string; name: string; preview: string; updatedAt: string; messageCount: number }
export type MessageImageAttachment = {
  id: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif'
  dataUrl: string
  name?: string
}
export type SessionHistoryItem = {
  type: 'message'
  value: { id: string; role: 'user' | 'assistant'; markdown: string; attachments?: MessageImageAttachment[] }
}
export type SessionListOutput = { sessions: SessionSummary[]; warnings: string[] }
export type SessionOpened = { connectionId: string; metadata: RendererSessionMetadata; history: SessionHistoryItem[] }
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
export type RuntimeSettings = { providers: ProviderView[]; provider: string; model: string; thinkingLevel: 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'; theme: 'auto' | 'dark' | 'light' }
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'bypassPermissions'
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
export type WorkspacePreferencesV1 = { schemaVersion: 1; path: string }
export type AttachmentRegistration = {
  attachmentId: string
  marker: string
  mediaType: 'image/png' | 'image/jpeg'
}
export type VisualCaptureInput = { runId: string; theme: 'dark' | 'light'; state: 'chat' | 'empty' | 'loading' | 'error'; viewport: '1440x900' | '800x600' }

const uuid = z.string().uuid()
export const sessionOpenInputSchema = z.object({ sessionId: z.string().nullable() })
export const sessionRenameInputSchema = z.object({ sessionId: z.string().min(1).max(255), name: z.string().trim().min(1).max(80) })
export const sessionDeleteInputSchema = z.object({ sessionId: z.string().min(1).max(255) })
export const runtimeSettingsInputSchema = z.object({ workspacePath: z.string().min(1) })
export const modelListInputSchema = runtimeSettingsInputSchema.extend({ provider: z.string().min(1) })
export const runtimeSettingsSaveInputSchema = runtimeSettingsInputSchema.extend({
  provider: z.string().min(1),
  model: z.string().min(1),
  thinkingLevel: z.enum(['off', 'low', 'medium', 'high', 'xhigh', 'max'])
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
export const workspaceSelectInputSchema = z.object({ path: z.string().min(1).optional() })
export const connectionInputSchema = z.object({ connectionId: uuid })
export const teamSaveInputSchema = connectionInputSchema.extend({ baseRevision: z.string().length(64), definition: teamDefinitionSchema })
export const teamMemberInputSchema = connectionInputSchema.extend({ member: z.string().min(1).max(255) })
export const teamMessageInputSchema = teamMemberInputSchema.extend({ message: z.string().trim().min(1).max(1_000_000) })
export const teamChannelInputSchema = connectionInputSchema.extend({ channel: z.string().min(1).max(255) })
export const teamChannelPostInputSchema = teamChannelInputSchema.extend({ text: z.string().trim().min(1).max(1_000_000) })
export const sessionSendInputSchema = z.object({ connectionId: uuid, turnId: uuid, prompt: z.string().min(1).max(1_000_000) })
export const sessionAttachmentInputSchema = z.object({
  connectionId: uuid,
  attachmentId: z.string().min(1).max(128),
  data: z.string().min(1).max(44_739_244)
})
export const sessionTurnInputSchema = z.object({ connectionId: uuid, turnId: uuid })
export const sessionPromptInputSchema = sessionTurnInputSchema.extend({
  promptId: uuid,
  response: z.discriminatedUnion('kind', [z.object({ kind: z.literal('option'), optionId: z.string() }), z.object({ kind: z.literal('text'), text: z.string().max(100_000) }), z.object({ kind: z.literal('cancel') })])
})
export const visualCaptureInputSchema = z.object({ runId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), theme: z.enum(['dark', 'light']), state: z.enum(['chat', 'empty', 'loading', 'error']), viewport: z.enum(['1440x900', '800x600']) })

export type BingoGuiApi = {
  getAppInfo(): Promise<Result<AppInfo>>
  probeRuntime(): Promise<Result<RuntimeInfo>>
  getWorkspaces(): Promise<Result<WorkspacePreferencesV2>>
  selectWorkspace(input?: { path?: string }): Promise<Result<WorkspaceSelectionResult>>
  listSessions(): Promise<Result<SessionListOutput>>
  openSession(input: { sessionId: string | null }): Promise<Result<SessionOpened>>
  renameSession(input: { sessionId: string; name: string }): Promise<Result<{ previousId: string; session: SessionSummary }>>
  deleteSession(input: { sessionId: string }): Promise<Result<{ deletedId: string }>>
  readRuntimeSettings(input: { workspacePath: string }): Promise<Result<RuntimeSettings>>
  listModels(input: { workspacePath: string; provider: string }): Promise<Result<{ provider: string; models: string[] }>>
  saveRuntimeSettings(input: { workspacePath: string; provider: string; model: string; thinkingLevel: RuntimeSettings['thinkingLevel'] }): Promise<Result<{ connectionId?: string; settings: RuntimeSettings }>>
  readSettings(input: { workspacePath: string }): Promise<Result<SettingsSnapshot>>
  saveSettings(input: { workspacePath: string; baseRevision: string; values: EditableSettings }): Promise<Result<{ connectionId?: string; snapshot: SettingsSnapshot }>>
  upsertProvider(input: { workspacePath: string; baseRevision: string; provider: ProviderSettingsInput }): Promise<Result<{ connectionId?: string; snapshot: SettingsSnapshot }>>
  removeProvider(input: { workspacePath: string; baseRevision: string; name: string; fallback?: { provider: string; model: string } }): Promise<Result<{ connectionId?: string; snapshot: SettingsSnapshot }>>
  upsertMcpServer(input: { workspacePath: string; baseRevision: string; server: McpServerSettingsInput }): Promise<Result<{ connectionId?: string; snapshot: SettingsSnapshot }>>
  removeMcpServer(input: { workspacePath: string; baseRevision: string; name: string }): Promise<Result<{ connectionId?: string; snapshot: SettingsSnapshot }>>
  readTeam(input: { connectionId: string }): Promise<Result<TeamSnapshot>>
  validateTeam(input: { connectionId: string }): Promise<Result<{ valid: boolean; msg: string }>>
  saveTeam(input: { connectionId: string; baseRevision: string; definition: TeamDefinition }): Promise<Result<TeamSnapshot>>
  startTeam(input: { connectionId: string }): Promise<Result<TeamSnapshot>>
  stopTeam(input: { connectionId: string }): Promise<Result<TeamSnapshot>>
  messageTeamMember(input: { connectionId: string; member: string; message: string }): Promise<Result<TeamSnapshot>>
  stopTeamMember(input: { connectionId: string; member: string }): Promise<Result<TeamSnapshot>>
  removeTeamMember(input: { connectionId: string; member: string }): Promise<Result<TeamSnapshot>>
  readTeamActivity(input: { connectionId: string; member: string }): Promise<Result<{ member: string; activity: Array<{ id: string; kind: string; summary: string; status: string }> }>>
  postTeamChannel(input: { connectionId: string; channel: string; text: string }): Promise<Result<TeamSnapshot>>
  readTeamChannel(input: { connectionId: string; channel: string }): Promise<Result<TeamSnapshot>>
  readAppearance(): Promise<Result<AppearanceSnapshot>>
  saveAppearance(input: { baseRevision: string; values: AppearancePreferencesV1 }): Promise<Result<AppearanceSnapshot>>
  closeSession(input: { connectionId: string }): Promise<Result<{ closed: true }>>
  addAttachment(input: { connectionId: string; attachmentId: string; data: string }): Promise<Result<AttachmentRegistration>>
  sendTurn(input: { connectionId: string; turnId: string; prompt: string }): Promise<Result<{ accepted: true }>>
  cancelTurn(input: { connectionId: string; turnId: string }): Promise<Result<{ requested: true }>>
  respondToPrompt(input: { connectionId: string; turnId: string; promptId: string; response: PromptResponse }): Promise<Result<{ accepted: true }>>
  captureVisual(input: VisualCaptureInput): Promise<Result<{ absolutePath: string }>>
  onSessionEvent(listener: (event: RendererSessionEvent) => void): () => void
}
