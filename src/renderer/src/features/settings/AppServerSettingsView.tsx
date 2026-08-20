import { useCallback, useEffect, useState } from 'react'
import { Alert, Descriptions, List, Menu, Segmented, Select, Skeleton, Space, Tag, type MenuProps } from 'antd'
import {
  ApiOutlined,
  AppstoreOutlined,
  BellOutlined,
  BgColorsOutlined,
  ControlOutlined,
  ToolOutlined,
  UserOutlined
} from '@ant-design/icons'
import type { ConfigSnapshot, McpServerState, ProviderInfo } from '../../../../shared/contracts/appServer'
import type {
  GuiError,
  McpServerSettingsInput,
  ModelListOutput,
  ProviderSettingsInput,
  SettingsSnapshot
} from '../../../../shared/contracts/ipc'
import { AppearanceSettings, SettingsSectionLayout, type SettingsSectionTransaction } from './AppearanceSettings'
import { GamePackSettings } from './GamePackSettings'
import { McpSettings } from './McpSettings'
import { NotificationSettings } from './NotificationSettings'
import { ProfileSettings } from './ProfileSettings'
import { ProviderSettings } from './ProviderSettings'

export type SettingsSectionId = 'runtime' | 'providers' | 'mcp' | 'profile' | 'appearance' | 'notifications' | 'games'

const settingsNavigation: MenuProps['items'] = [
  {
    type: 'group',
    label: '运行环境',
    children: [
      { key: 'runtime', icon: <ControlOutlined />, label: '运行设置' },
      { key: 'providers', icon: <ApiOutlined />, label: 'API 供应商' },
      { key: 'mcp', icon: <ToolOutlined />, label: 'MCP 服务器' }
    ]
  },
  {
    type: 'group',
    label: '个人偏好',
    children: [
      { key: 'profile', icon: <UserOutlined />, label: '个人资料' },
      { key: 'appearance', icon: <BgColorsOutlined />, label: '外观' },
      { key: 'notifications', icon: <BellOutlined />, label: '通知' }
    ]
  },
  {
    type: 'group',
    label: '应用管理',
    children: [{ key: 'games', icon: <AppstoreOutlined />, label: '小游戏' }]
  }
]

export function AppServerSettingsView({
  activeSection,
  onSectionChange,
  onTransactionChange,
  workspacePath,
  config,
  providers,
  models,
  mcpServers,
  onModelSelect,
  onProviderSelect,
  onThinkingSelect,
  onPermissionMode,
  onTheme,
  onDefinitionsChanged
}: {
  activeSection: SettingsSectionId
  onSectionChange: (section: SettingsSectionId) => void
  onTransactionChange: (transaction: SettingsSectionTransaction | null) => void
  workspacePath: string
  config: ConfigSnapshot | null
  providers: ProviderInfo[]
  models: string[]
  mcpServers: McpServerState[]
  onModelSelect: (model: string) => void
  onProviderSelect: (provider: string) => void
  onThinkingSelect: (thinking: string) => void
  onPermissionMode: (mode: string) => void
  onTheme: (theme: 'auto' | 'dark' | 'light') => void
  onDefinitionsChanged: () => Promise<void>
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null)
  const [error, setError] = useState<GuiError | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!workspacePath) return
    setBusy(true)
    const result = await window.bingoGui.readSettings({ workspacePath })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      setSnapshot(null)
      return
    }
    setError(null)
    setSnapshot(result.value)
  }, [workspacePath])

  useEffect(() => { void load() }, [load])

  const acceptDefinitionWrite = async (result: Awaited<ReturnType<typeof window.bingoGui.upsertProvider>>): Promise<boolean> => {
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setSnapshot(result.value)
    setError(null)
    await onDefinitionsChanged()
    await load()
    return true
  }
  const upsertProvider = async (provider: ProviderSettingsInput): Promise<boolean> => {
    if (!snapshot) return false
    setBusy(true)
    const result = await window.bingoGui.upsertProvider({ workspacePath, baseRevision: snapshot.revision, provider })
    const ok = await acceptDefinitionWrite(result)
    setBusy(false)
    return ok
  }
  const removeProvider = async (name: string, fallback?: { provider: string; model: string }): Promise<boolean> => {
    if (!snapshot) return false
    setBusy(true)
    const result = await window.bingoGui.removeProvider({ workspacePath, baseRevision: snapshot.revision, name, fallback })
    const ok = await acceptDefinitionWrite(result)
    setBusy(false)
    return ok
  }
  const upsertMcp = async (server: McpServerSettingsInput): Promise<boolean> => {
    if (!snapshot) return false
    setBusy(true)
    const result = await window.bingoGui.upsertMcpServer({ workspacePath, baseRevision: snapshot.revision, server })
    const ok = await acceptDefinitionWrite(result)
    setBusy(false)
    return ok
  }
  const removeMcp = async (name: string): Promise<boolean> => {
    if (!snapshot) return false
    setBusy(true)
    const result = await window.bingoGui.removeMcpServer({ workspacePath, baseRevision: snapshot.revision, name })
    const ok = await acceptDefinitionWrite(result)
    setBusy(false)
    return ok
  }
  const listModels = async (provider: string): Promise<ModelListOutput | null> => {
    const result = await window.bingoGui.listModels({ workspacePath, provider })
    if (!result.ok) {
      setError(result.error)
      return null
    }
    return result.value
  }

  const definitionFallback = error
    ? <Alert type="error" showIcon title={error.code} description={error.msg} />
    : <Skeleton active paragraph={{ rows: 8 }} />

  let content: React.ReactNode
  if (activeSection === 'runtime') {
    content = <RuntimeSettings
          config={config}
          providers={providers}
          models={models}
          mcpServers={mcpServers}
          onModelSelect={onModelSelect}
          onProviderSelect={onProviderSelect}
          onThinkingSelect={onThinkingSelect}
          onPermissionMode={onPermissionMode}
          onTheme={onTheme}
        />
  } else if (activeSection === 'providers') {
    content = snapshot
      ? <ProviderSettings snapshot={snapshot} error={error} busy={busy} activeProvider={config?.provider ?? snapshot.values.provider} onTransactionChange={onTransactionChange} onUpsert={upsertProvider} onRemove={removeProvider} onListModels={listModels} />
      : definitionFallback
  } else if (activeSection === 'mcp') {
    content = snapshot
      ? <McpSettings snapshot={snapshot} error={error} busy={busy} onTransactionChange={onTransactionChange} onUpsert={upsertMcp} onRemove={removeMcp} />
      : definitionFallback
  } else if (activeSection === 'profile') {
    content = <ProfileSettings onTransactionChange={onTransactionChange} />
  } else if (activeSection === 'appearance') {
    content = <AppearanceSettings onTransactionChange={onTransactionChange} />
  } else if (activeSection === 'notifications') {
    content = <NotificationSettings onTransactionChange={onTransactionChange} />
  } else {
    content = <GamePackSettings />
  }

  return <main className="settings-v2">
    <aside className="settings-navigation-v2">
      <header>
        <span>BINGO GO</span>
        <strong>设置</strong>
        <small title={workspacePath}>{workspacePath}</small>
      </header>
      <Menu
        mode="inline"
        selectedKeys={[activeSection]}
        items={settingsNavigation}
        onClick={({ key }) => onSectionChange(key as SettingsSectionId)}
      />
    </aside>
    <div className="settings-content-v2">{content}</div>
  </main>
}

function RuntimeSettings({ config, providers, models, mcpServers, onModelSelect, onProviderSelect, onThinkingSelect, onPermissionMode, onTheme }: {
  config: ConfigSnapshot | null
  providers: ProviderInfo[]
  models: string[]
  mcpServers: McpServerState[]
  onModelSelect: (model: string) => void
  onProviderSelect: (provider: string) => void
  onThinkingSelect: (thinking: string) => void
  onPermissionMode: (mode: string) => void
  onTheme: (theme: 'auto' | 'dark' | 'light') => void
}): React.JSX.Element {
  return <SettingsSectionLayout title="运行设置" description="这些选择通过 app-server 写入当前会话，并由 Bingo 保存。">
    <div className="settings-form-section">
      <SettingRow title="Provider"><Select value={config?.provider} options={providers.map((provider) => ({ value: provider.name, label: provider.name }))} onChange={onProviderSelect} /></SettingRow>
      <SettingRow title="Model"><Select showSearch value={config?.model} options={models.map((model) => ({ value: model, label: model }))} onChange={onModelSelect} /></SettingRow>
      <SettingRow title="Thinking"><Select value={config?.thinking} options={['off', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) => ({ value: level, label: level }))} onChange={onThinkingSelect} /></SettingRow>
      <SettingRow title="权限模式"><Select value={config?.permissionMode} options={['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'].map((mode) => ({ value: mode, label: mode }))} onChange={onPermissionMode} /></SettingRow>
      <SettingRow title="终端主题"><Segmented value={config?.theme ?? 'auto'} options={[{ label: '自动', value: 'auto' }, { label: '明亮', value: 'light' }, { label: '暗色', value: 'dark' }]} onChange={(value) => onTheme(value as 'auto' | 'dark' | 'light')} /></SettingRow>
    </div>
    <List size="small" header="MCP 运行状态" dataSource={mcpServers} locale={{ emptyText: '没有配置 MCP 服务器' }} renderItem={(server) => <List.Item><Descriptions size="small" column={2} items={[
      { key: 'name', label: '服务器', children: server.name },
      { key: 'status', label: '状态', children: <Tag>{server.status}</Tag> }
    ]} /></List.Item>} />
  </SettingsSectionLayout>
}

function SettingRow({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return <div className="setting-row"><strong>{title}</strong><Space className="setting-control">{children}</Space></div>
}
