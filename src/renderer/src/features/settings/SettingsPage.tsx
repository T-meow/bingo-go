import { useEffect, useState } from 'react'
import { Alert, App, Button, Descriptions, Input, InputNumber, List, Segmented, Select, Skeleton, Space, Switch, Tabs, Tag, Typography } from 'antd'
import { ReloadOutlined, SaveOutlined, TeamOutlined } from '@ant-design/icons'
import type {
  AppInfo, EditableSettings, GuiError, McpServerSettingsInput, ModelListOutput, PermissionMode, ProviderSettingsInput,
  RuntimeInfo, SettingsSnapshot
} from '../../../../shared/contracts/ipc'
import { AppearanceSettings, SettingsSectionLayout, type SettingsSectionTransaction } from './AppearanceSettings'
import { McpSettings } from './McpSettings'
import { ProviderSettings } from './ProviderSettings'
import type { SettingsSection } from './SettingsSidebar'
import { ModelPicker } from '../../components/ModelPicker'
import { NotificationSettings } from './NotificationSettings'
import { GamePackSettings } from './GamePackSettings'
import { ProfileSettings } from './ProfileSettings'

export function SettingsPage({ section, snapshot, draft, error, runtime, appInfo, busy, onChange, onSave, onDiscard, onSectionTransactionChange, onGoTeam, onUpsertProvider, onRemoveProvider, onUpsertMcp, onRemoveMcp, onListModels }: {
  section: SettingsSection
  snapshot: SettingsSnapshot | null
  draft: EditableSettings | null
  error: GuiError | null
  runtime: RuntimeInfo | null
  appInfo: AppInfo | null
  busy: boolean
  onChange: (value: EditableSettings) => void
  onSave: () => Promise<boolean>
  onDiscard: () => void
  onSectionTransactionChange: (transaction: SettingsSectionTransaction | null) => void
  onGoTeam: () => void
  onUpsertProvider: (provider: ProviderSettingsInput) => Promise<boolean>
  onRemoveProvider: (name: string, fallback?: { provider: string; model: string }) => Promise<boolean>
  onUpsertMcp: (server: McpServerSettingsInput) => Promise<boolean>
  onRemoveMcp: (name: string) => Promise<boolean>
  onListModels: (provider: string) => Promise<ModelListOutput | null>
}): React.JSX.Element {
  const { message } = App.useApp()
  const [defaultModels, setDefaultModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  useEffect(() => {
    const provider = draft?.provider
    if (section !== 'general' || !provider) return
    let live = true
    setModelsLoading(true)
    void onListModels(provider).then((result) => {
      if (live) setDefaultModels(result?.models ?? [])
    }).finally(() => { if (live) setModelsLoading(false) })
    return () => { live = false }
  }, [draft?.provider, section, snapshot?.revision])
  if (section === 'profile' || section === 'appearance' || section === 'notifications' || section === 'games') {
    const content = section === 'profile'
      ? <ProfileSettings onTransactionChange={onSectionTransactionChange} />
      : section === 'appearance'
      ? <AppearanceSettings onTransactionChange={onSectionTransactionChange} />
      : section === 'notifications'
        ? <NotificationSettings onTransactionChange={onSectionTransactionChange} />
        : <GamePackSettings />
    return <main className="settings-page"><div className="settings-page-scroll">{content}</div></main>
  }
  if (error && !snapshot) return <main className="settings-page"><div className="settings-page-scroll"><SettingsSectionLayout title="设置不可用" description="无法读取 Bingo 配置。"><Alert type="error" showIcon message={error.code} description={error.msg} /></SettingsSectionLayout></div></main>
  if (!snapshot || !draft) return <main className="settings-page"><div className="settings-loading"><Skeleton active paragraph={{ rows: 8 }} /></div></main>
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.values)
  const update = <K extends keyof EditableSettings>(key: K, value: EditableSettings[K]): void => onChange({ ...draft, [key]: value })
  const shadowed = (key: keyof EditableSettings): boolean => snapshot.shadowed.includes(key)
  const source = (key: keyof EditableSettings): string | undefined => snapshot.sources[key]
  const save = async (): Promise<void> => {
    if (await onSave()) void message.success('设置已保存')
  }
  const editableSection = section === 'general' || section === 'permissions' || section === 'team' || section === 'advanced'

  let content: React.ReactNode
  if (section === 'providers') content = <ProviderSettings snapshot={snapshot} error={error} busy={busy} activeProvider={(snapshot.effective ?? snapshot.values).provider} onTransactionChange={onSectionTransactionChange} onUpsert={onUpsertProvider} onRemove={onRemoveProvider} onListModels={onListModels} />
  else if (section === 'mcp') content = <McpSettings snapshot={snapshot} error={error} busy={busy} onTransactionChange={onSectionTransactionChange} onUpsert={onUpsertMcp} onRemove={onRemoveMcp} />
  else if (section === 'general') content = <SettingsSectionLayout title="常规与运行" description="设置 Bingo 会话的默认运行参数。">
    {error && <Alert type="error" showIcon message={error.code} description={error.msg} />}
    <div className="runtime-summary"><Descriptions size="small" column={2} items={[
      { key: 'workspace', label: '工作区', children: runtime?.workspacePath ?? '未知' },
      { key: 'binary', label: 'Bingo', children: runtime ? `${runtime.bingoVersion} · Protocol ${runtime.protocolVersion}` : '未连接' },
      { key: 'capabilities', label: '能力', span: 2, children: runtime?.capabilities?.length ? runtime.capabilities.join(' · ') : '基础 Chat' }
    ]} /></div>
    <div className="settings-form-section">
      <SettingRow title="默认供应商" description="每个新对话默认使用的 Provider。" source={source('provider')} shadowed={shadowed('provider')}><Select value={draft.provider} disabled={shadowed('provider')} options={snapshot.providers.map((provider) => ({ value: provider.name, label: provider.name }))} onChange={(provider) => onChange({ ...draft, provider, model: '' })} /></SettingRow>
      <SettingRow title="默认模型" description="从供应商列表选择，或输入准确的模型 ID。" source={source('model')} shadowed={shadowed('model')}><ModelPicker value={draft.model} models={defaultModels} loading={modelsLoading} disabled={shadowed('model')} onChange={(model) => update('model', model)} /></SettingRow>
      <SettingRow title="Thinking" description="控制模型推理深度。" source={source('thinkingLevel')} shadowed={shadowed('thinkingLevel')}><Select value={draft.thinkingLevel} disabled={shadowed('thinkingLevel')} options={['off', 'low', 'medium', 'high', 'xhigh', 'max'].map((value) => ({ value, label: value }))} onChange={(value) => update('thinkingLevel', value)} /></SettingRow>
      <SettingRow title="发送图片" description="仅在 Provider 支持图片时生效。" source={source('sendImages')} shadowed={shadowed('sendImages')}><Switch checked={draft.sendImages} disabled={shadowed('sendImages')} onChange={(value) => update('sendImages', value)} /></SettingRow>
      <SettingRow title="Prompt Cache" description="向兼容端点发送 cache_control。" source={source('cacheControl')} shadowed={shadowed('cacheControl')}><Switch checked={draft.cacheControl} disabled={shadowed('cacheControl')} onChange={(value) => update('cacheControl', value)} /></SettingRow>
    </div>
  </SettingsSectionLayout>
  else if (section === 'permissions') content = <SettingsSectionLayout title="权限" description="控制工具默认行为和按规则覆盖。">
    {error && <Alert type="error" showIcon message={error.code} description={error.msg} />}
    <div className="settings-form-section"><SettingRow title="权限模式" description="高风险模式保存前会再次确认。" source={source('permissionMode')} shadowed={shadowed('permissionMode')}><Select value={draft.permissionMode} disabled={shadowed('permissionMode')} options={permissionOptions} onChange={(value) => update('permissionMode', value as PermissionMode)} /></SettingRow></div>
    <Tabs className="permission-tabs" items={[
      { key: 'deny', label: `Deny (${draft.permissions.deny.length})`, children: <RuleEditor title="Deny" tone="danger" value={draft.permissions.deny} onChange={(deny) => update('permissions', { ...draft.permissions, deny })} /> },
      { key: 'ask', label: `Ask (${draft.permissions.ask.length})`, children: <RuleEditor title="Ask" tone="warning" value={draft.permissions.ask} onChange={(ask) => update('permissions', { ...draft.permissions, ask })} /> },
      { key: 'allow', label: `Allow (${draft.permissions.allow.length})`, children: <RuleEditor title="Allow" tone="success" value={draft.permissions.allow} onChange={(allow) => update('permissions', { ...draft.permissions, allow })} /> }
    ]} />
    {snapshot.effective && JSON.stringify(snapshot.effective.permissions) !== JSON.stringify(draft.permissions) && <Alert type="info" showIcon message="工作区还附加了权限规则" description="本页面只编辑用户层；项目与 local 层规则仍会按 Bingo 的 deny > ask > allow 语义参与计算。" />}
  </SettingsSectionLayout>
  else if (section === 'team') content = <SettingsSectionLayout title="Team 与协作" description="设置项目 Team 的启动和频道预算。" extra={<Button icon={<TeamOutlined />} onClick={onGoTeam}>打开 Team 工作台</Button>}>
    {error && <Alert type="error" showIcon message={error.code} description={error.msg} />}
    <div className="settings-form-section">
      <SettingRow title="自动启动 Team" description="启动只创建待命成员，不产生模型调用。" source={source('team')} shadowed={shadowed('team')}><Switch checked={draft.team.autoStart} disabled={shadowed('team')} onChange={(autoStart) => update('team', { autoStart })} /></SettingRow>
      <SettingRow title="Agent Channels" description="启用 Channel 和 Post 工具。" source={source('experimental')} shadowed={shadowed('experimental')}><Switch checked={draft.experimental.agentChannels} disabled={shadowed('experimental')} onChange={(agentChannels) => update('experimental', { ...draft.experimental, agentChannels })} /></SettingRow>
      <SettingRow title="频道消息上限" description="达到上限后频道冻结。" source={source('experimental')} shadowed={shadowed('experimental')}><InputNumber min={1} max={100000} value={draft.experimental.channelMessageLimit} disabled={shadowed('experimental')} onChange={(value) => update('experimental', { ...draft.experimental, channelMessageLimit: value ?? 500 })} /></SettingRow>
      <SettingRow title="成员消息上限" description="每个 Agent 在每个频道中的预算。" source={source('experimental')} shadowed={shadowed('experimental')}><InputNumber min={1} max={100000} value={draft.experimental.agentMessageLimit} disabled={shadowed('experimental')} onChange={(value) => update('experimental', { ...draft.experimental, agentMessageLimit: value ?? 50 })} /></SettingRow>
    </div>
  </SettingsSectionLayout>
  else if (section === 'advanced') content = <SettingsSectionLayout title="高级" description="Bingo 终端、Shell 与公开分享配置。">
    {error && <Alert type="error" showIcon message={error.code} description={error.msg} />}
    <div className="settings-form-section">
      <SettingRow title="Bingo TUI 主题" description="只影响终端界面，不影响 Bingo Go。" source={source('theme')} shadowed={shadowed('theme')}><Segmented value={draft.theme} disabled={shadowed('theme')} options={[{ label: '自动', value: 'auto' }, { label: '暗色', value: 'dark' }, { label: '明亮', value: 'light' }]} onChange={(value) => update('theme', value as EditableSettings['theme'])} /></SettingRow>
      <SettingRow title="Bingo TUI 动效" description="关闭终端中的非必要动态效果。" source={source('motion')} shadowed={shadowed('motion')}><Switch checked={draft.motion === 'off'} disabled={shadowed('motion')} onChange={(off) => update('motion', off ? 'off' : 'auto')} /></SettingRow>
      <SettingRow title="Shell" description="Bash 工具与 Hooks 使用的程序。" source={source('shell')} shadowed={shadowed('shell')}><Input value={draft.shell} disabled={shadowed('shell')} placeholder="使用平台默认 Shell" onChange={(event) => update('shell', event.target.value)} /></SettingRow>
      <SettingRow title="将命令结果交给模型" description="关闭后，本地命令执行结果不会继续触发模型回答。" source={source('respondToBashCommands')} shadowed={shadowed('respondToBashCommands')}><Switch checked={draft.respondToBashCommands} disabled={shadowed('respondToBashCommands')} onChange={(value) => update('respondToBashCommands', value)} /></SettingRow>
      <SettingRow title="公开分享地址" description="仅供 bingo share --public 使用。" source={source('share')} shadowed={shadowed('share')}><Input value={draft.share.baseUrl} disabled={shadowed('share')} onChange={(event) => update('share', { baseUrl: event.target.value })} /></SettingRow>
    </div>
    <div className="readonly-block"><h2>Hooks</h2><p>首版只读展示，避免在 GUI 中编辑任意命令。</p>{(snapshot.hooks ?? []).length === 0 ? <Typography.Text type="secondary">未配置 Hooks</Typography.Text> : <List size="small" dataSource={snapshot.hooks} renderItem={(hook) => <List.Item><span>{hook.name}</span><Tag>{hook.ruleCount} 条规则</Tag></List.Item>} />}</div>
  </SettingsSectionLayout>
  else content = <SettingsSectionLayout title="关于" description="本地运行时、配置层与许可证信息。">
    <Descriptions bordered size="small" column={1} items={[
      { key: 'bingo-go', label: 'Bingo Go', children: appInfo ? `${appInfo.appVersion} · ${appInfo.platform}-${appInfo.arch}` : '读取中' },
      { key: 'bingo', label: 'Bingo', children: runtime ? `${runtime.bingoVersion} · Protocol ${runtime.protocolVersion}` : '未连接' },
      { key: 'binary', label: '二进制', children: <Typography.Text copyable={Boolean(runtime?.binaryPath)}>{runtime?.binaryPath ?? '未知'}</Typography.Text> },
      { key: 'settings', label: '用户配置', children: <Typography.Text copyable>{snapshot.path}</Typography.Text> },
      { key: 'capabilities', label: '运行能力', children: runtime?.capabilities?.length ? runtime.capabilities.join(', ') : '基础 Chat' }
    ]} />
    <div className="readonly-block"><h2>配置层</h2><List dataSource={Object.entries(snapshot.layers)} renderItem={([name, layer]) => <List.Item><List.Item.Meta title={<Space><strong>{layerName(name)}</strong>{layer.exists ? <Tag color="success">存在</Tag> : <Tag>未创建</Tag>}</Space>} description={layer.path} /><span>{layer.keys.length} keys</span></List.Item>} /></div>
    <div className="readonly-block"><h2>许可证</h2><Typography.Paragraph>Bingo Go、Bingo、Ant Design 与 Ant Design X 使用 MIT 许可；头像素材为 CC0。完整第三方声明随 Windows 测试目录提供。</Typography.Paragraph></div>
  </SettingsSectionLayout>

  return <main className={`settings-page${editableSection ? ' has-save-bar' : ''}`}><div className="settings-page-scroll">{content}</div>{editableSection && <div className="settings-save-bar"><div><strong>{dirty ? '有未保存的更改' : '设置已同步'}</strong><span>{dirty ? '保存后会应用到新的和当前可重连会话。' : '当前分区没有待保存内容。'}</span></div><Space><Button icon={<ReloadOutlined />} disabled={!dirty || busy} onClick={onDiscard}>放弃更改</Button><Button type="primary" icon={<SaveOutlined />} loading={busy} disabled={!dirty || busy} onClick={() => void save()}>保存更改</Button></Space></div>}</main>
}

function SettingRow({ title, description, source, shadowed, children }: { title: string; description: string; source?: string; shadowed?: boolean; children: React.ReactNode }): React.JSX.Element {
  return <div className="setting-row"><div><Space><strong>{title}</strong>{shadowed && <Tag color="warning">工作区只读</Tag>}</Space><span>{description}</span>{source && <small title={source}>{source}</small>}</div><div className="setting-control">{children}</div></div>
}

function RuleEditor({ title, tone, value, onChange }: { title: string; tone: 'danger' | 'warning' | 'success'; value: string[]; onChange: (value: string[]) => void }): React.JSX.Element {
  return <section className={`rule-editor ${tone}`}><header><strong>{title}</strong><Tag>{value.length}</Tag></header><Input.TextArea aria-label={`${title} rules`} value={value.join('\n')} rows={10} placeholder="Tool(pattern)" onChange={(event) => onChange(toLines(event.target.value))} /></section>
}

const permissionOptions = [
  { value: 'default', label: '默认' }, { value: 'acceptEdits', label: '自动接受编辑' }, { value: 'plan', label: '计划模式' },
  { value: 'dontAsk', label: '不询问' }, { value: 'bypassPermissions', label: '绕过权限' }
]
function toLines(value: string): string[] { return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) }
function layerName(name: string): string { return name === 'user' ? '用户层' : name === 'project' ? '项目层' : 'Local 层' }
