import { chmod, copyFile, mkdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type {
  EditableSettings, HookSummary, McpServerSettingsInput, McpServerView, ProviderSettingsInput,
  SecretPatch, SettingsLayerName, SettingsLayerView, SettingsSnapshot
} from '../../shared/contracts/ipc'

type JsonObject = Record<string, unknown>
type Layer = { name: SettingsLayerName; path: string; exists: boolean; source: string; revision: string; object: JsonObject }
export type SettingsFileSnapshot = Omit<SettingsSnapshot, 'providers'> & {
  providerSources: Record<string, SettingsLayerName>
}

const MISSING_REVISION = createHash('sha256').update('').digest('hex')
const EDITABLE_KEYS: Array<keyof EditableSettings> = [
  'apiBaseUrl', 'provider', 'model', 'thinkingLevel', 'permissionMode', 'theme', 'motion',
  'sendImages', 'cacheControl', 'respondToBashCommands', 'shell', 'permissions', 'share'
]
const SCALAR_KEYS: Array<keyof EditableSettings> = [
  'apiBaseUrl', 'provider', 'model', 'thinkingLevel', 'permissionMode', 'theme', 'motion',
  'sendImages', 'cacheControl', 'respondToBashCommands', 'shell'
]
const HOOK_NAMES = [
  'PreToolUse', 'PostToolUse', 'PreCompact', 'PostCompact', 'UserPromptSubmit', 'Stop',
  'SessionStart', 'SessionEnd', 'TaskCreated', 'TaskCompleted'
] as const

export class SettingsRepository {
  constructor(private readonly path: string) {}

  async read(workspacePath: string): Promise<SettingsFileSnapshot> {
    const rawLayers = await Promise.all([
      this.readLayer('user', this.path),
      this.readLayer('project', `${workspacePath}/.bingo/settings.json`),
      this.readLayer('local', `${workspacePath}/.bingo/local.json`)
    ])
    const [user, project, local] = rawLayers
    const merged = mergeLayers(rawLayers)
    const effective = editableValues(merged)
    const shadowed = EDITABLE_KEYS.filter((key) => isShadowed(key, project.object, local.object))
    const values: EditableSettings = {
      ...effective,
      permissions: permissionRules(user.object.permissions),
      share: shareSettings(user.object.share, effective.share)
    }
    const sources: SettingsFileSnapshot['sources'] = {}
    for (const key of EDITABLE_KEYS) {
      const layer = [...rawLayers].reverse().find((candidate) => key in candidate.object)
      if (layer) sources[key] = layer.path
    }
    const providerSources = providerSourceMap(rawLayers)
    return {
      path: this.path,
      revision: user.revision,
      values,
      effective,
      layers: {
        user: layerView(user),
        project: layerView(project),
        local: layerView(local)
      },
      sources,
      shadowed,
      providerSources,
      mcpServers: mcpViews(rawLayers, merged),
      hooks: hookSummaries(merged)
    }
  }

  async saveRuntime(patch: Pick<EditableSettings, 'provider' | 'model' | 'thinkingLevel' | 'permissionMode'>): Promise<void> {
    await this.patchUser(undefined, patch, false)
  }

  async save(workspacePath: string, baseRevision: string, patch: EditableSettings): Promise<SettingsFileSnapshot> {
    const before = await this.read(workspacePath)
    this.assertRevision(before, baseRevision)
    const blocked = before.shadowed.filter((key) => !same(before.effective?.[key], patch[key]))
    if (blocked.length > 0) throw new Error(`CONFIG_SHADOWED: ${blocked.join(', ')} is controlled by a workspace layer.`)
    await this.patchUser(before, serializeEditable(patch), true)
    return this.read(workspacePath)
  }

  async upsertProvider(workspacePath: string, baseRevision: string, provider: ProviderSettingsInput): Promise<SettingsFileSnapshot> {
    const before = await this.read(workspacePath)
    this.assertRevision(before, baseRevision)
    const source = before.providerSources[provider.name]
    if (source && source !== 'user') throw new Error(`CONFIG_SHADOWED: Provider "${provider.name}" is controlled by the ${source} layer.`)
    const layer = await this.readLayer('user', this.path)
    const next = { ...layer.object }
    if (provider.name === 'default') {
      next.apiBaseUrl = provider.apiBaseUrl
      next.sendImages = provider.supportsImages
      applySecret(next, 'apiKey', provider.apiKey)
    } else {
      const providers = objectValue(next.providers)
      const current = objectValue(providers[provider.name])
      const config: JsonObject = {
        ...current,
        apiBaseUrl: provider.apiBaseUrl,
        protocol: provider.protocol,
        supportsImages: provider.supportsImages
      }
      applySecret(config, 'apiKey', provider.apiKey)
      providers[provider.name] = config
      next.providers = providers
    }
    await this.writeLayer(layer, next, true)
    return this.read(workspacePath)
  }

  async removeProvider(workspacePath: string, baseRevision: string, name: string, fallback?: { provider: string; model: string }): Promise<SettingsFileSnapshot> {
    if (name === 'default') throw new Error('CONFIG_INVALID: The default provider cannot be removed.')
    const before = await this.read(workspacePath)
    this.assertRevision(before, baseRevision)
    if (before.providerSources[name] !== 'user') throw new Error(`CONFIG_SHADOWED: Provider "${name}" is not defined in the user layer.`)
    if (before.effective?.provider === name && !fallback) throw new Error('CONFIG_INVALID: Choose a fallback provider before removing the active provider.')
    const layer = await this.readLayer('user', this.path)
    const next = { ...layer.object }
    const providers = objectValue(next.providers)
    delete providers[name]
    if (Object.keys(providers).length > 0) next.providers = providers
    else delete next.providers
    if (fallback) {
      next.provider = fallback.provider
      next.model = fallback.model
    }
    await this.writeLayer(layer, next, true)
    return this.read(workspacePath)
  }

  async upsertMcpServer(workspacePath: string, baseRevision: string, server: McpServerSettingsInput): Promise<SettingsFileSnapshot> {
    const before = await this.read(workspacePath)
    this.assertRevision(before, baseRevision)
    const effectiveSource = before.mcpServers?.[0]?.source
    if (effectiveSource && effectiveSource !== 'user') throw new Error('CONFIG_SHADOWED: MCP servers are controlled by a workspace layer.')
    const layer = await this.readLayer('user', this.path)
    const next = { ...layer.object }
    const servers = objectValue(next.mcpServers)
    const current = objectValue(servers[server.name])
    const config: JsonObject = server.type === 'stdio'
      ? { ...current, type: 'stdio', command: server.command, args: server.args }
      : { ...current, type: 'http', url: server.url }
    if (server.type === 'stdio') {
      delete config.url
      delete config.headers
      config.env = applySecretMap(objectValue(current.env), server.env)
    } else {
      delete config.command
      delete config.args
      delete config.env
      config.headers = applySecretMap(objectValue(current.headers), server.headers)
    }
    servers[server.name] = config
    next.mcpServers = servers
    const disabled = stringArray(next.disabledMcpServers).filter((name) => name !== server.name)
    if (server.disabled) disabled.push(server.name)
    if (disabled.length > 0) next.disabledMcpServers = [...new Set(disabled)]
    else delete next.disabledMcpServers
    await this.writeLayer(layer, next, true)
    return this.read(workspacePath)
  }

  async removeMcpServer(workspacePath: string, baseRevision: string, name: string): Promise<SettingsFileSnapshot> {
    const before = await this.read(workspacePath)
    this.assertRevision(before, baseRevision)
    const target = before.mcpServers?.find((server) => server.name === name)
    if (!target?.editable) throw new Error(`CONFIG_SHADOWED: MCP server "${name}" is not defined in the user layer.`)
    const layer = await this.readLayer('user', this.path)
    const next = { ...layer.object }
    const servers = objectValue(next.mcpServers)
    delete servers[name]
    if (Object.keys(servers).length > 0) next.mcpServers = servers
    else delete next.mcpServers
    const disabled = stringArray(next.disabledMcpServers).filter((item) => item !== name)
    if (disabled.length > 0) next.disabledMcpServers = disabled
    else delete next.disabledMcpServers
    await this.writeLayer(layer, next, true)
    return this.read(workspacePath)
  }

  private assertRevision(before: SettingsFileSnapshot, revision: string): void {
    if (before.revision !== revision) throw new Error('SETTINGS_CONFLICT: Settings changed on disk. Reload and retry.')
  }

  private async patchUser(before: SettingsFileSnapshot | undefined, patch: JsonObject, backup: boolean): Promise<void> {
    const layer = await this.readLayer('user', this.path)
    if (before && layer.revision !== before.revision) throw new Error('SETTINGS_CONFLICT: Settings changed on disk. Reload and retry.')
    const next = mergeForWrite(layer.object, patch)
    await this.writeLayer(layer, next, backup)
  }

  private async writeLayer(layer: Layer, next: JsonObject, backup: boolean): Promise<void> {
    if (backup && layer.exists) {
      const backupPath = `${this.path}.bak-${timestamp()}`
      await copyFile(this.path, backupPath)
      await chmod(backupPath, 0o600).catch(() => undefined)
    }
    await mkdir(dirname(this.path), { recursive: true })
    await writeFileAtomic(this.path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, fsync: true })
  }

  private async readLayer(name: SettingsLayerName, path: string): Promise<Layer> {
    let source: string
    try { source = await readFile(path, 'utf8') } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { name, path, exists: false, source: '', revision: MISSING_REVISION, object: {} }
      throw error
    }
    let value: unknown
    try { value = JSON.parse(source) } catch (error) { throw new Error(`Cannot read ${path}: ${error instanceof Error ? error.message : 'invalid JSON'}`) }
    if (!isObject(value)) throw new Error(`Cannot read ${path}: settings must be a JSON object`)
    return { name, path, exists: true, source, revision: createHash('sha256').update(source).digest('hex'), object: value }
  }
}

function mergeLayers(layers: Layer[]): JsonObject {
  const merged: JsonObject = {}
  for (const layer of layers) {
    for (const key of ['apiKey', 'apiBaseUrl', 'provider', 'model', 'sendImages', 'thinkingLevel', 'permissionMode', 'theme', 'motion', 'cacheControl', 'respondToBashCommands', 'shell'] as const) {
      if (key in layer.object) merged[key] = layer.object[key]
    }
    const providers = objectValue(layer.object.providers)
    if (Object.keys(providers).length > 0) merged.providers = { ...objectValue(merged.providers), ...providers }
    const mcpServers = objectValue(layer.object.mcpServers)
    if (Object.keys(mcpServers).length > 0) merged.mcpServers = mcpServers
    merged.disabledMcpServers = [...stringArray(merged.disabledMcpServers), ...stringArray(layer.object.disabledMcpServers)]
    const permissions = permissionRules(layer.object.permissions)
    const basePermissions = permissionRules(merged.permissions)
    merged.permissions = {
      allow: [...basePermissions.allow, ...permissions.allow],
      ask: [...basePermissions.ask, ...permissions.ask],
      deny: [...basePermissions.deny, ...permissions.deny]
    }
    for (const key of ['share'] as const) {
      const value = objectValue(layer.object[key])
      if (Object.keys(value).length > 0) merged[key] = { ...objectValue(merged[key]), ...value }
    }
    const hooks = objectValue(layer.object.hooks)
    const baseHooks = objectValue(merged.hooks)
    for (const name of HOOK_NAMES) {
      const rules = arrayValue(hooks[name])
      if (rules.length > 0) baseHooks[name] = rules
    }
    merged.hooks = baseHooks
  }
  return merged
}

function editableValues(raw: JsonObject): EditableSettings {
  return {
    apiBaseUrl: stringValue(raw.apiBaseUrl),
    provider: stringValue(raw.provider, 'default'),
    model: stringValue(raw.model),
    thinkingLevel: thinkingValue(raw.thinkingLevel),
    permissionMode: permissionMode(raw.permissionMode),
    theme: themeValue(raw.theme),
    motion: raw.motion === 'off' ? 'off' : 'auto',
    sendImages: booleanValue(raw.sendImages, true),
    cacheControl: booleanValue(raw.cacheControl, false),
    respondToBashCommands: booleanValue(raw.respondToBashCommands, true),
    shell: stringValue(raw.shell),
    permissions: permissionRules(raw.permissions),
    share: shareSettings(raw.share, { baseUrl: 'https://bingo.ruobin.dev' })
  }
}

function serializeEditable(values: EditableSettings): JsonObject {
  return {
    apiBaseUrl: values.apiBaseUrl,
    provider: values.provider,
    model: values.model,
    thinkingLevel: values.thinkingLevel,
    permissionMode: values.permissionMode,
    theme: values.theme,
    motion: values.motion,
    sendImages: values.sendImages,
    cacheControl: values.cacheControl,
    respondToBashCommands: values.respondToBashCommands,
    shell: values.shell,
    permissions: values.permissions,
    share: values.share
  }
}

function mergeForWrite(current: JsonObject, patch: JsonObject): JsonObject {
  const next = { ...current, ...patch }
  for (const key of ['permissions', 'share'] as const) {
    if (isObject(patch[key])) next[key] = { ...objectValue(current[key]), ...patch[key] }
  }
  return next
}

function layerView(layer: Layer): SettingsLayerView {
  const values: SettingsLayerView['values'] = {}
  for (const key of EDITABLE_KEYS) if (key in layer.object) values[key] = layer.object[key]
  return { path: layer.path, exists: layer.exists, keys: Object.keys(layer.object), values }
}

function providerSourceMap(layers: Layer[]): Record<string, SettingsLayerName> {
  const sources: Record<string, SettingsLayerName> = {}
  for (const layer of layers) {
    for (const name of Object.keys(objectValue(layer.object.providers))) sources[name] = layer.name
    if ('apiKey' in layer.object || 'apiBaseUrl' in layer.object) sources.default = layer.name
  }
  return sources
}

function mcpViews(layers: Layer[], merged: JsonObject): McpServerView[] {
  const source = [...layers].reverse().find((layer) => Object.keys(objectValue(layer.object.mcpServers)).length > 0)?.name ?? 'user'
  const disabled = new Set(stringArray(merged.disabledMcpServers))
  return Object.entries(objectValue(merged.mcpServers)).map(([name, raw]) => {
    const config = objectValue(raw)
    const type: McpServerView['type'] = config.type === 'http' ? 'http' : 'stdio'
    return {
      name,
      type,
      command: stringValue(config.command),
      args: stringArray(config.args),
      url: stringValue(config.url),
      envKeys: Object.keys(objectValue(config.env)),
      headerKeys: Object.keys(objectValue(config.headers)),
      disabled: disabled.has(name),
      source,
      editable: source === 'user'
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

function hookSummaries(merged: JsonObject): HookSummary[] {
  const hooks = objectValue(merged.hooks)
  return HOOK_NAMES.map((name) => ({ name, ruleCount: arrayValue(hooks[name]).length })).filter((item) => item.ruleCount > 0)
}

function isShadowed(key: keyof EditableSettings, project: JsonObject, local: JsonObject): boolean {
  if (key === 'permissions') return false
  return key in project || key in local
}

function permissionRules(value: unknown): EditableSettings['permissions'] {
  const object = objectValue(value)
  return { allow: stringArray(object.allow), ask: stringArray(object.ask), deny: stringArray(object.deny) }
}

function shareSettings(value: unknown, fallback: EditableSettings['share']): EditableSettings['share'] {
  return { baseUrl: stringValue(objectValue(value).baseUrl, fallback.baseUrl) }
}

function applySecret(target: JsonObject, key: string, patch: SecretPatch): void {
  if (patch.action === 'clear') delete target[key]
  else if (patch.action === 'replace') target[key] = patch.value
}

function applySecretMap(current: JsonObject, patches: Record<string, SecretPatch>): JsonObject {
  const next = { ...current }
  for (const [key, patch] of Object.entries(patches)) applySecret(next, key, patch)
  return next
}

function objectValue(value: unknown): JsonObject { return isObject(value) ? { ...value } : {} }
function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? [...value] : [] }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function stringValue(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback }
function booleanValue(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback }
function thinkingValue(value: unknown): EditableSettings['thinkingLevel'] { return ['off', 'low', 'medium', 'high', 'xhigh', 'max'].includes(String(value)) ? value as EditableSettings['thinkingLevel'] : 'off' }
function permissionMode(value: unknown): EditableSettings['permissionMode'] { return ['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'].includes(String(value)) ? value as EditableSettings['permissionMode'] : 'default' }
function themeValue(value: unknown): EditableSettings['theme'] { return value === 'dark' || value === 'light' ? value : 'auto' }
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right) }
function timestamp(): string { return new Date().toISOString().replace(/[:.]/g, '-') }
