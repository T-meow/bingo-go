import { z } from 'zod'
import type { FrameLimits, ProtocolVersion, ServerCapabilities } from './appServer'
import type { GamePackChoice, GamePackEvent, GamePackSnapshot } from './gamePacks'
export * from './gamePacks'

export const IPC = {
  appGetInfo: 'app:get-info',
  workspaceGet: 'workspace:get',
  workspaceSelect: 'workspace:select',
  terminalOpenExternal: 'terminal:open-external',
  clipboardWriteText: 'clipboard:write-text',
  settingsRead: 'settings:read',
  settingsListModels: 'settings:list-models',
  settingsProviderUpsert: 'settings:provider-upsert',
  settingsProviderRemove: 'settings:provider-remove',
  settingsMcpUpsert: 'settings:mcp-upsert',
  settingsMcpRemove: 'settings:mcp-remove',
  appearanceRead: 'appearance:read',
  appearanceSave: 'appearance:save',
  profileRead: 'profile:read',
  profileSave: 'profile:save',
  notificationPreferencesRead: 'notification-preferences:read',
  notificationPreferencesSave: 'notification-preferences:save',
  notificationActivated: 'notification:activated',
  gamePackList: 'game-pack:list',
  gamePackChoose: 'game-pack:choose',
  gamePackInstall: 'game-pack:install',
  gamePackSetEnabled: 'game-pack:set-enabled',
  gamePackLaunch: 'game-pack:launch',
  gamePackClearData: 'game-pack:clear-data',
  gamePackUninstall: 'game-pack:uninstall',
  gamePackEvent: 'game-pack:event'
} as const

export type GuiError = {
  code: string
  msg: string
  level: 'field' | 'page' | 'flow'
  recoverable: boolean
  action?: 'retry'
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: GuiError }
export type AppInfo = { appVersion: string; platform: NodeJS.Platform; arch: string; packaged: boolean }
export type RuntimeInfo = {
  binaryPath: string
  bingoVersion: string
  workspacePath: string
  appServer: { protocol: ProtocolVersion; capabilities: ServerCapabilities; limits: FrameLimits }
}
export type WorkspacePreferencesV2 = { schemaVersion: 2; currentPath: string; recentPaths: string[] }
export type WorkspaceSelectionResult =
  | { canceled: true; preferences: WorkspacePreferencesV2 }
  | { canceled: false; changed: boolean; runtime: RuntimeInfo; preferences: WorkspacePreferencesV2 }
export type ExternalTerminalOpened = { terminalName: string; workspacePath: string }

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
export type ModelListOutput = { provider: string; models: string[]; source: 'remote' | 'fallback'; warning?: GuiError }
export type EditableSettings = {
  apiBaseUrl: string
  provider: string
  model: string
  thinkingLevel: 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  permissionMode: PermissionMode
  theme: 'auto' | 'dark' | 'light'
  motion: 'auto' | 'off'
  sendImages: boolean
  cacheControl: boolean
  respondToBashCommands: boolean
  shell: string
  permissions: { allow: string[]; ask: string[]; deny: string[] }
  share: { baseUrl: string }
}
export type SettingsLayerView = {
  path: string
  exists: boolean
  keys: string[]
  values: Partial<Record<keyof EditableSettings, unknown>>
}
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
  mcpServers: McpServerView[]
  hooks: HookSummary[]
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
export type NotificationPreferencesSnapshot = {
  path: string
  revision: string
  values: NotificationPreferencesV1
  supported: boolean
}
export type NotificationActivation = {
  sessionId: string
  conversationId?: string
  kind: 'turn-completed' | 'action-required' | 'failure'
}
export type WorkspacePreferencesV1 = { schemaVersion: 1; path: string }

export const clipboardWriteTextInputSchema = z.object({ text: z.string().max(1_000_000) }).strict()
export const workspaceSelectInputSchema = z.object({ path: z.string().min(1).optional() }).strict()
export const settingsReadInputSchema = z.object({ workspacePath: z.string().min(1) }).strict()
export const modelListInputSchema = settingsReadInputSchema.extend({ provider: z.string().min(1) }).strict()
const secretPatchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('unchanged') }),
  z.object({ action: z.literal('clear') }),
  z.object({ action: z.literal('replace'), value: z.string().min(1).max(100_000) })
])
export const providerSettingsInputSchema = settingsReadInputSchema.extend({
  baseRevision: z.string().length(64),
  provider: z.object({
    name: z.string().trim().min(1).max(80),
    protocol: z.enum(['anthropic', 'openai']),
    apiBaseUrl: z.string().trim().max(4_096),
    supportsImages: z.boolean(),
    apiKey: secretPatchSchema
  })
}).strict()
export const providerRemoveInputSchema = settingsReadInputSchema.extend({
  baseRevision: z.string().length(64),
  name: z.string().trim().min(1).max(80),
  fallback: z.object({ provider: z.string().min(1), model: z.string().min(1) }).optional()
}).strict()
export const mcpServerSettingsInputSchema = settingsReadInputSchema.extend({
  baseRevision: z.string().length(64),
  server: z.object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(['stdio', 'http']),
    command: z.string().trim().max(4_096),
    args: z.array(z.string().max(4_096)).max(256),
    url: z.string().trim().max(4_096),
    env: z.record(z.string().min(1).max(256), secretPatchSchema),
    headers: z.record(z.string().min(1).max(256), secretPatchSchema),
    disabled: z.boolean()
  }).superRefine((server, context) => {
    if (server.type === 'stdio' && !server.command) context.addIssue({ code: 'custom', path: ['command'], message: 'stdio server requires command' })
    if (server.type === 'http' && !server.url) context.addIssue({ code: 'custom', path: ['url'], message: 'http server requires url' })
  })
}).strict()
export const mcpServerRemoveInputSchema = settingsReadInputSchema.extend({
  baseRevision: z.string().length(64),
  name: z.string().trim().min(1).max(80)
}).strict()
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
  z.object({ schemaVersion: z.literal(2), currentPath: z.string().min(1), recentPaths: z.array(z.string().min(1)).max(8) })
])
export const appearanceSaveInputSchema = z.object({ baseRevision: z.string().length(64), values: appearancePreferencesSchema }).strict()
export const userProfileSchema = z.object({ schemaVersion: z.literal(1), avatar: z.string().min(1).max(128) })
export const profileSaveInputSchema = z.object({
  baseRevision: z.string().length(64),
  avatar: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('builtin'), id: z.string().min(1).max(128) }),
    z.object({ kind: z.literal('existing'), id: z.string().regex(/^user:[0-9a-f]{64}$/) }),
    z.object({ kind: z.literal('upload'), fileName: z.string().min(1).max(255), data: z.string().min(1).max(28_000_000) })
  ])
}).strict()
export const notificationPreferencesSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  turnCompleted: z.boolean(),
  actionRequired: z.boolean(),
  failures: z.boolean(),
  sound: z.boolean()
})
export const notificationPreferencesSaveInputSchema = z.object({
  baseRevision: z.string().length(64),
  values: notificationPreferencesSchema
}).strict()
export const notificationActivationSchema = z.object({
  sessionId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  kind: z.enum(['turn-completed', 'action-required', 'failure'])
}).strict()

export type BingoGuiApi = {
  getAppInfo(): Promise<Result<AppInfo>>
  getWorkspaces(): Promise<Result<WorkspacePreferencesV2>>
  selectWorkspace(input?: { path?: string }): Promise<Result<WorkspaceSelectionResult>>
  openExternalTerminal(): Promise<Result<ExternalTerminalOpened>>
  writeClipboardText(input: z.infer<typeof clipboardWriteTextInputSchema>): Promise<Result<{ written: true }>>
  readSettings(input: { workspacePath: string }): Promise<Result<SettingsSnapshot>>
  listModels(input: { workspacePath: string; provider: string }): Promise<Result<ModelListOutput>>
  upsertProvider(input: { workspacePath: string; baseRevision: string; provider: ProviderSettingsInput }): Promise<Result<SettingsSnapshot>>
  removeProvider(input: { workspacePath: string; baseRevision: string; name: string; fallback?: { provider: string; model: string } }): Promise<Result<SettingsSnapshot>>
  upsertMcpServer(input: { workspacePath: string; baseRevision: string; server: McpServerSettingsInput }): Promise<Result<SettingsSnapshot>>
  removeMcpServer(input: { workspacePath: string; baseRevision: string; name: string }): Promise<Result<SettingsSnapshot>>
  readAppearance(): Promise<Result<AppearanceSnapshot>>
  saveAppearance(input: { baseRevision: string; values: AppearancePreferencesV1 }): Promise<Result<AppearanceSnapshot>>
  readProfile(): Promise<Result<UserProfileSnapshot>>
  saveProfile(input: { baseRevision: string; avatar: UserProfileAvatarInput }): Promise<Result<UserProfileSnapshot>>
  readNotificationPreferences(): Promise<Result<NotificationPreferencesSnapshot>>
  saveNotificationPreferences(input: { baseRevision: string; values: NotificationPreferencesV1 }): Promise<Result<NotificationPreferencesSnapshot>>
  listGamePacks(): Promise<Result<GamePackSnapshot>>
  chooseGamePack(): Promise<Result<GamePackChoice>>
  installGamePack(input: { token: string; baseRevision: string }): Promise<Result<GamePackSnapshot>>
  setGamePackEnabled(input: { id: string; enabled: boolean; baseRevision: string }): Promise<Result<GamePackSnapshot>>
  launchGamePack(input: { id: string }): Promise<Result<{ launched: true }>>
  clearGamePackData(input: { id: string }): Promise<Result<{ cleared: true }>>
  uninstallGamePack(input: { id: string; clearData: boolean; baseRevision: string }): Promise<Result<GamePackSnapshot>>
  onNotificationActivated(listener: (event: NotificationActivation) => void): () => void
  onGamePackEvent(listener: (event: GamePackEvent) => void): () => void
}
