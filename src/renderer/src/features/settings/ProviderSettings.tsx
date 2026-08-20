import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App, Button, Drawer, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, ExperimentOutlined, PlusOutlined } from '@ant-design/icons'
import type { GuiError, ModelListOutput, ProviderSettingsInput, ProviderView, SecretPatch, SettingsSnapshot } from '../../../../shared/contracts/ipc'
import { ModelPicker } from '../../components/ModelPicker'
import { SettingsSectionLayout, type SettingsSectionTransaction } from './AppearanceSettings'

type ProviderForm = Omit<ProviderSettingsInput, 'apiKey'> & { credentialAction: SecretPatch['action']; apiKey: string }

export function ProviderSettings({ snapshot, error, busy, activeProvider, onTransactionChange, onUpsert, onRemove, onListModels }: {
  snapshot: SettingsSnapshot
  error: GuiError | null
  busy: boolean
  activeProvider: string
  onTransactionChange?: (transaction: SettingsSectionTransaction | null) => void
  onUpsert: (provider: ProviderSettingsInput) => Promise<boolean>
  onRemove: (name: string, fallback?: { provider: string; model: string }) => Promise<boolean>
  onListModels: (provider: string) => Promise<ModelListOutput | null>
}): React.JSX.Element {
  const { message, modal } = App.useApp()
  const [editing, setEditing] = useState<ProviderView | 'new' | null>(null)
  const [form, setForm] = useState<ProviderForm>(emptyProvider())
  const [initialForm, setInitialForm] = useState<ProviderForm>(emptyProvider())
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [fallbackProvider, setFallbackProvider] = useState('')
  const [fallbackModel, setFallbackModel] = useState('')
  const [fallbackModels, setFallbackModels] = useState<string[]>([])
  const [fallbackOpen, setFallbackOpen] = useState(false)
  const transactionRef = useRef<SettingsSectionTransaction | null>(null)

  useEffect(() => {
    if (!editing) return
    const next: ProviderForm = editing === 'new' ? emptyProvider() : {
      name: editing.name,
      protocol: editing.protocol,
      apiBaseUrl: editing.apiBaseUrl,
      supportsImages: editing.supportsImages,
      credentialAction: 'unchanged',
      apiKey: ''
    }
    setForm(next)
    setInitialForm(next)
  }, [editing])

  const current = editing === 'new' ? null : editing
  const lockedIdentity = Boolean(current?.builtin || current?.source === 'project' || current?.source === 'local')
  const formDirty = Boolean(editing && JSON.stringify(form) !== JSON.stringify(initialForm))
  const closeEditor = (): void => {
    if (!formDirty) { setEditing(null); return }
    modal.confirm({ title: '放弃供应商更改？', content: '抽屉中的内容尚未保存。', okText: '放弃更改', cancelText: '继续编辑', okButtonProps: { danger: true }, onOk: () => setEditing(null) })
  }
  const columns = useMemo(() => [
    { title: '供应商', dataIndex: 'name', key: 'name', render: (name: string, item: ProviderView) => <Space><strong>{name}</strong>{item.builtin && <Tag>内置</Tag>}{name === activeProvider && <Tag color="processing">当前</Tag>}</Space> },
    { title: '协议', dataIndex: 'protocol', key: 'protocol', width: 110, render: (value: string) => <Tag>{value}</Tag> },
    { title: '端点', dataIndex: 'apiBaseUrl', key: 'endpoint', ellipsis: true },
    { title: '凭据', key: 'credential', width: 110, render: (_: unknown, item: ProviderView) => <Tag color={item.credentialConfigured ? 'success' : 'warning'}>{item.credentialConfigured ? '已配置' : '未配置'}</Tag> },
    { title: '来源', key: 'source', width: 100, render: (_: unknown, item: ProviderView) => <Tag>{sourceLabel(item.source)}</Tag> },
    { title: '', key: 'actions', width: 92, render: (_: unknown, item: ProviderView) => <Space size={4}><Button type="text" icon={<ExperimentOutlined />} aria-label={`测试 ${item.name}`} loading={testing === item.name} onClick={() => void test(item.name)} /><Button type="text" icon={<EditOutlined />} aria-label={`编辑 ${item.name}`} onClick={() => setEditing(item)} /></Space> }
  ], [activeProvider, testing])

  const test = async (name: string): Promise<void> => {
    setTesting(name)
    const result = await onListModels(name)
    setTesting(null)
    if (!result) return
    if (result.source === 'remote') void message.success(result.models.length > 0 ? `连接成功，发现 ${result.models.length} 个模型` : '连接成功，供应商未返回模型列表')
    else void message.warning(`${result.warning?.code ?? 'MODEL_LIST_UNVERIFIED'}：${result.warning?.msg ?? '无法连接供应商'}；已加载 ${result.models.length} 个内置候选，但连接尚未验证`)
  }

  const save = async (): Promise<boolean> => {
    if (!form.name.trim() || (form.credentialAction === 'replace' && !form.apiKey)) {
      void message.error('请补全供应商必填项')
      return false
    }
    const apiKey: SecretPatch = form.credentialAction === 'replace' ? { action: 'replace', value: form.apiKey } : { action: form.credentialAction }
    setSaving(true)
    const ok = await onUpsert({ name: form.name.trim(), protocol: form.protocol, apiBaseUrl: form.apiBaseUrl.trim(), supportsImages: form.supportsImages, apiKey })
    setSaving(false)
    setForm((value) => ({ ...value, apiKey: '', credentialAction: 'unchanged' }))
    if (ok) {
      const result = await onListModels(form.name.trim())
      setEditing(null)
      if (result === null) void message.warning('设置已保存，但该供应商无法自动验证模型列表')
      else if (result.source === 'fallback') void message.warning(`设置已保存，但连接验证失败：${result.warning?.msg ?? '无法连接供应商'}`)
      else void message.success(result.models.length ? `设置已保存，发现 ${result.models.length} 个模型` : '设置已保存；请手工填写模型标识')
    }
    return ok
  }

  transactionRef.current = formDirty ? { save, discard: () => setEditing(null) } : null
  useEffect(() => {
    onTransactionChange?.(formDirty ? {
      save: () => transactionRef.current?.save() ?? Promise.resolve(false),
      discard: () => transactionRef.current?.discard()
    } : null)
    return () => onTransactionChange?.(null)
  }, [formDirty, onTransactionChange])

  const remove = (): void => {
    if (!current) return
    if (current.name !== activeProvider) {
      modal.confirm({ title: `删除 ${current.name}？`, content: '只会删除用户设置层中的定义。', okText: '删除', okButtonProps: { danger: true }, onOk: async () => { if (await onRemove(current.name)) setEditing(null) } })
      return
    }
    const candidates = snapshot.providers.filter((provider) => provider.name !== current.name)
    const initialProvider = candidates[0]?.name ?? ''
    setFallbackProvider(initialProvider)
    setFallbackModel('')
    setFallbackModels([])
    setFallbackOpen(true)
    if (initialProvider) void loadFallback(initialProvider)
  }

  const loadFallback = async (name: string): Promise<void> => {
    setFallbackProvider(name)
    setFallbackModel('')
    const result = await onListModels(name)
    const nextModels = result?.models ?? []
    setFallbackModels(nextModels)
    setFallbackModel(nextModels[0] ?? '')
    if (result?.source === 'fallback') void message.warning(`未验证替代供应商连接：${result.warning?.msg ?? '无法连接供应商'}`)
  }

  const confirmFallbackRemove = async (): Promise<void> => {
    if (!current || !fallbackProvider || !fallbackModel) return
    if (await onRemove(current.name, { provider: fallbackProvider, model: fallbackModel })) {
      setFallbackOpen(false)
      setEditing(null)
    }
  }

  return <SettingsSectionLayout title="API 供应商" description="管理 Bingo 已有 Provider 配置和静态 API Key。" extra={<Button type="primary" icon={<PlusOutlined />} disabled={busy} onClick={() => setEditing('new')}>添加供应商</Button>}>
    {error && <Alert type="error" showIcon title={error.code} description={error.msg} />}
    {snapshot.providers.length === 0 ? <Empty description="没有可用供应商" /> : <Table rowKey="name" size="middle" pagination={false} columns={columns} dataSource={snapshot.providers} />}
    <Drawer title={editing === 'new' ? '添加供应商' : `编辑 ${current?.name ?? ''}`} size={480} open={Boolean(editing)} maskClosable={!saving} closable={!saving} onClose={closeEditor} extra={<Space>{current && current.name !== 'default' && current.source === 'user' && <Button danger icon={<DeleteOutlined />} onClick={remove}>删除</Button>}<Button type="primary" loading={saving} disabled={!form.name.trim() || (form.credentialAction === 'replace' && !form.apiKey)} onClick={() => void save()}>保存并测试</Button></Space>}>
      {current && !current.editable && <Alert type="warning" showIcon title="该定义来自工作区设置，只能查看。" />}
      <Form layout="vertical" className="drawer-form">
        <Form.Item label="名称" required><Input value={form.name} disabled={lockedIdentity || editing !== 'new'} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Form.Item>
        <Form.Item label="协议" required><Select value={form.protocol} disabled={Boolean(current && (lockedIdentity || !current.editable))} options={[{ value: 'anthropic', label: 'Anthropic Messages' }, { value: 'openai', label: 'OpenAI Responses' }]} onChange={(protocol) => setForm({ ...form, protocol })} /></Form.Item>
        <Form.Item label="API Base URL"><Input value={form.apiBaseUrl} disabled={Boolean(current && !current.editable) || Boolean(current?.builtin)} placeholder="留空使用协议默认端点" onChange={(event) => setForm({ ...form, apiBaseUrl: event.target.value })} /></Form.Item>
        <Form.Item label="API Key"><Select value={form.credentialAction} disabled={Boolean(current && !current.editable)} options={[{ value: 'unchanged', label: '保持现有凭据' }, { value: 'replace', label: '替换 API Key' }, { value: 'clear', label: '清除 API Key' }]} onChange={(credentialAction) => setForm({ ...form, credentialAction })} />{form.credentialAction === 'replace' && <Input.Password className="secret-input" value={form.apiKey} autoComplete="new-password" placeholder="输入新的 API Key" onChange={(event) => setForm({ ...form, apiKey: event.target.value })} />}</Form.Item>
        <Form.Item label="支持图片"><Switch checked={form.supportsImages} disabled={Boolean(current && !current.editable)} onChange={(supportsImages) => setForm({ ...form, supportsImages })} /></Form.Item>
        {current?.oauthConfigured && <Typography.Text type="secondary">OAuth 状态由 Bingo 管理，本页面不会读取或修改令牌。</Typography.Text>}
      </Form>
    </Drawer>
    <Modal open={fallbackOpen} title={`替换并删除 ${current?.name ?? ''}`} width={500} okText="替换并删除" cancelText="取消" okButtonProps={{ danger: true, disabled: !fallbackProvider || !fallbackModel }} onCancel={() => setFallbackOpen(false)} onOk={() => void confirmFallbackRemove()}>
      <FallbackSelector providers={snapshot.providers.filter((provider) => provider.name !== current?.name)} provider={fallbackProvider} model={fallbackModel} models={fallbackModels} onProvider={loadFallback} onModel={setFallbackModel} />
    </Modal>
  </SettingsSectionLayout>
}

function FallbackSelector({ providers, provider, model, models, onProvider, onModel }: { providers: ProviderView[]; provider: string; model: string; models: string[]; onProvider: (value: string) => Promise<void>; onModel: (value: string) => void }): React.JSX.Element {
  return <Space orientation="vertical" className="fallback-selector"><Typography.Text>当前供应商正在使用，删除时必须同时选择替代项。</Typography.Text><Select value={provider || undefined} placeholder="替代供应商" options={providers.map((item) => ({ value: item.name, label: item.name }))} onChange={(value) => void onProvider(value)} /><ModelPicker value={model} models={models} placeholder="选择或输入替代模型" onChange={onModel} /></Space>
}

function emptyProvider(): ProviderForm { return { name: '', protocol: 'anthropic', apiBaseUrl: '', supportsImages: true, credentialAction: 'unchanged', apiKey: '' } }
function sourceLabel(source: ProviderView['source']): string { return source === 'project' ? '项目' : source === 'local' ? 'Local' : source === 'user' ? '用户' : source === 'builtin' ? '内置' : '环境' }
