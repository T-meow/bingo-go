import { Button, Descriptions, List, Select, Space, Switch, Tabs, Tag } from 'antd'
import type { ActionInfo, Catalog, ConfigSnapshot, McpServerState, ProviderInfo } from '../../../../shared/contracts/appServer'

export function AppServerSettingsView({ config, providers, models, mcpServers, actions, onModelSelect, onProviderSelect, onThinkingSelect, onPermissionMode, onTheme, onAction }: {
  config: ConfigSnapshot | null
  providers: ProviderInfo[]
  models: string[]
  mcpServers: McpServerState[]
  actions: ActionInfo[]
  onModelSelect: (model: string) => void
  onProviderSelect: (provider: string) => void
  onThinkingSelect: (thinking: string) => void
  onPermissionMode: (mode: string) => void
  onTheme: (theme: 'auto' | 'dark' | 'light') => void
  onAction: (action: ActionInfo) => void
}): React.JSX.Element {
  return (
    <Tabs
      items={[
        {
          key: 'selection', label: '模型选择',
          children: (
            <Space direction="vertical" size={12} className="settings-v2-panel">
              <label>Provider <Select value={config?.provider} style={{ width: 240 }} options={providers.map((provider) => ({ value: provider.name, label: provider.name }))} onChange={onProviderSelect} /></label>
              <label>Model <Select value={config?.model} style={{ width: 240 }} options={models.map((model) => ({ value: model, label: model }))} onChange={onModelSelect} /></label>
              <label>Thinking <Select value={config?.thinking} style={{ width: 240 }} options={['off', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) => ({ value: level, label: level }))} onChange={onThinkingSelect} /></label>
              <label>Permission <Select value={config?.permissionMode} style={{ width: 240 }} options={['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'].map((mode) => ({ value: mode, label: mode }))} onChange={onPermissionMode} /></label>
              <label>Theme <Switch checkedChildren="dark" unCheckedChildren="light" checked={config?.theme === 'dark'} onChange={(dark) => onTheme(dark ? 'dark' : 'light')} /></label>
            </Space>
          )
        },
        {
          key: 'catalog', label: 'Provider / MCP',
          children: (
            <Space direction="vertical" size={12} className="settings-v2-panel">
              <List size="small" dataSource={providers} renderItem={(provider) => <List.Item><Descriptions size="small" column={2} items={[
                { key: 'name', label: 'Name', children: provider.name },
                { key: 'protocol', label: 'Protocol', children: provider.protocol },
                { key: 'base', label: 'Base URL', children: provider.apiBaseUrl },
                { key: 'credential', label: 'Credential', children: <Tag>{provider.credential.configured ? 'configured' : provider.credential.status}</Tag> }
              ]} /></List.Item>} />
              <List size="small" dataSource={mcpServers} renderItem={(server) => <List.Item><Space><strong>{server.name}</strong><Tag>{server.status}</Tag><Switch size="small" checked={server.enabled} disabled /></Space></List.Item>} />
            </Space>
          )
        },
        {
          key: 'actions', label: 'Commands',
          children: (
            <List size="small" dataSource={actions} renderItem={(action) => <List.Item><Button size="small" disabled={!action.available} onClick={() => onAction(action)}>{action.label}</Button><small>{action.description}</small></List.Item>} />
          )
        }
      ]}
    />
  )
}
