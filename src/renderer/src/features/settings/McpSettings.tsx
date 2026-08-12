import { useEffect, useMemo, useState } from 'react'
import { Alert, App, Button, Drawer, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import type { GuiError, McpServerSettingsInput, McpServerView, SecretPatch, SettingsSnapshot } from '../../../../shared/contracts/ipc'
import { SettingsSectionLayout } from './AppearanceSettings'

type McpForm = {
  name: string
  type: 'stdio' | 'http'
  command: string
  argsText: string
  url: string
  disabled: boolean
  envText: string
  headerText: string
  clearEnv: string[]
  clearHeaders: string[]
}

export function McpSettings({ snapshot, error, busy, onUpsert, onRemove }: {
  snapshot: SettingsSnapshot
  error: GuiError | null
  busy: boolean
  onUpsert: (server: McpServerSettingsInput) => Promise<boolean>
  onRemove: (name: string) => Promise<boolean>
}): React.JSX.Element {
  const { message, modal } = App.useApp()
  const servers = snapshot.mcpServers ?? []
  const [editing, setEditing] = useState<McpServerView | 'new' | null>(null)
  const [form, setForm] = useState<McpForm>(emptyMcp())
  const [saving, setSaving] = useState(false)
  const current = editing === 'new' ? null : editing

  useEffect(() => {
    if (!editing) return
    setForm(editing === 'new' ? emptyMcp() : {
      name: editing.name,
      type: editing.type,
      command: editing.command,
      argsText: editing.args.join('\n'),
      url: editing.url,
      disabled: editing.disabled,
      envText: '',
      headerText: '',
      clearEnv: [],
      clearHeaders: []
    })
  }, [editing])

  const columns = useMemo(() => [
    { title: '服务器', dataIndex: 'name', key: 'name', render: (name: string, item: McpServerView) => <Space><strong>{name}</strong>{item.disabled ? <Tag>已禁用</Tag> : <Tag color="success">已启用</Tag>}</Space> },
    { title: '传输', dataIndex: 'type', key: 'type', width: 100, render: (type: string) => <Tag>{type}</Tag> },
    { title: '目标', key: 'target', ellipsis: true, render: (_: unknown, item: McpServerView) => item.type === 'stdio' ? [item.command, ...item.args].join(' ') : item.url },
    { title: '秘密字段', key: 'secrets', width: 120, render: (_: unknown, item: McpServerView) => `${item.envKeys.length + item.headerKeys.length} 项` },
    { title: '来源', dataIndex: 'source', key: 'source', width: 90, render: (source: string) => <Tag>{source === 'user' ? '用户' : source === 'project' ? '项目' : 'Local'}</Tag> },
    { title: '', key: 'action', width: 54, render: (_: unknown, item: McpServerView) => <Button type="text" icon={<EditOutlined />} aria-label={`编辑 ${item.name}`} onClick={() => setEditing(item)} /> }
  ], [])

  const save = (): void => {
    const target = form.type === 'stdio' ? [form.command, ...lines(form.argsText)].join(' ') : form.url
    modal.confirm({
      title: form.disabled ? '保存 MCP 服务器？' : '启用外部 MCP 服务器？',
      content: <><Typography.Paragraph>Bingo Go 会将以下配置写入 Bingo 用户设置，下一次会话会连接它。</Typography.Paragraph><Typography.Text code>{target}</Typography.Text></>,
      okText: form.disabled ? '保存' : '确认并保存',
      onOk: async () => {
        setSaving(true)
        const ok = await onUpsert(toInput(form, current))
        setSaving(false)
        setForm((value) => ({ ...value, envText: '', headerText: '', clearEnv: [], clearHeaders: [] }))
        if (ok) { setEditing(null); void message.success('MCP 设置已保存') }
        else throw new Error('MCP 设置保存失败')
      }
    })
  }

  const remove = (): void => {
    if (!current) return
    Modal.confirm({ title: `删除 ${current.name}？`, content: '只删除用户设置层中的定义，不会删除外部程序或数据。', okText: '删除', okButtonProps: { danger: true }, onOk: async () => { if (await onRemove(current.name)) setEditing(null) } })
  }

  return <SettingsSectionLayout title="MCP" description="配置 Bingo 使用的 stdio 与 Streamable HTTP 工具服务器。" extra={<Button type="primary" icon={<PlusOutlined />} disabled={busy} onClick={() => setEditing('new')}>添加服务器</Button>}>
    {error && <Alert type="error" showIcon message={error.code} description={error.msg} />}
    {servers.length === 0 ? <Empty description="尚未配置 MCP 服务器" /> : <Table rowKey="name" size="middle" pagination={false} columns={columns} dataSource={servers} />}
    <Drawer title={editing === 'new' ? '添加 MCP 服务器' : `编辑 ${current?.name ?? ''}`} size={500} open={Boolean(editing)} onClose={() => setEditing(null)} extra={<Space>{current?.editable && <Button danger icon={<DeleteOutlined />} onClick={remove}>删除</Button>}<Button type="primary" loading={saving} disabled={!valid(form) || Boolean(current && !current.editable)} onClick={save}>保存</Button></Space>}>
      {current && !current.editable && <Alert type="warning" showIcon message="工作区层的 MCP 配置只能查看。" />}
      <Form layout="vertical" className="drawer-form">
        <Form.Item label="名称" required><Input value={form.name} disabled={editing !== 'new'} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Form.Item>
        <Form.Item label="传输类型"><Select value={form.type} disabled={Boolean(current && !current.editable)} options={[{ value: 'stdio', label: 'stdio' }, { value: 'http', label: 'Streamable HTTP' }]} onChange={(type) => setForm({ ...form, type })} /></Form.Item>
        {form.type === 'stdio' ? <>
          <Form.Item label="命令" required><Input value={form.command} disabled={Boolean(current && !current.editable)} onChange={(event) => setForm({ ...form, command: event.target.value })} /></Form.Item>
          <Form.Item label="参数" extra="每行一个参数"><Input.TextArea value={form.argsText} rows={4} disabled={Boolean(current && !current.editable)} onChange={(event) => setForm({ ...form, argsText: event.target.value })} /></Form.Item>
          <SecretEditor label="环境变量" existing={current?.envKeys ?? []} text={form.envText} cleared={form.clearEnv} disabled={Boolean(current && !current.editable)} onText={(envText) => setForm({ ...form, envText })} onClear={(clearEnv) => setForm({ ...form, clearEnv })} />
        </> : <>
          <Form.Item label="URL" required><Input value={form.url} disabled={Boolean(current && !current.editable)} onChange={(event) => setForm({ ...form, url: event.target.value })} /></Form.Item>
          <SecretEditor label="HTTP Headers" existing={current?.headerKeys ?? []} text={form.headerText} cleared={form.clearHeaders} disabled={Boolean(current && !current.editable)} onText={(headerText) => setForm({ ...form, headerText })} onClear={(clearHeaders) => setForm({ ...form, clearHeaders })} />
        </>}
        <Form.Item label="禁用"><Switch checked={form.disabled} disabled={Boolean(current && !current.editable)} onChange={(disabled) => setForm({ ...form, disabled })} /></Form.Item>
      </Form>
    </Drawer>
  </SettingsSectionLayout>
}

function SecretEditor({ label, existing, text, cleared, disabled, onText, onClear }: { label: string; existing: string[]; text: string; cleared: string[]; disabled: boolean; onText: (value: string) => void; onClear: (keys: string[]) => void }): React.JSX.Element {
  return <Form.Item label={label} extra="新值使用 KEY=value，每行一项；现有值不会显示。"><Space direction="vertical" className="secret-editor">{existing.length > 0 && <><div className="secret-tags">{existing.map((key) => <Tag key={key}>{key}</Tag>)}</div><Select mode="multiple" value={cleared} disabled={disabled} placeholder="选择要清除的已有字段" options={existing.map((key) => ({ value: key, label: key }))} onChange={onClear} /></>}<Input.TextArea value={text} rows={4} disabled={disabled} autoComplete="off" placeholder="TOKEN=新的值" onChange={(event) => onText(event.target.value)} /></Space></Form.Item>
}

function toInput(form: McpForm, current: McpServerView | null): McpServerSettingsInput {
  return {
    name: form.name.trim(), type: form.type, command: form.command.trim(), args: lines(form.argsText), url: form.url.trim(), disabled: form.disabled,
    env: secretMap(current?.envKeys ?? [], form.envText, form.clearEnv),
    headers: secretMap(current?.headerKeys ?? [], form.headerText, form.clearHeaders)
  }
}

function secretMap(existing: string[], source: string, cleared: string[]): Record<string, SecretPatch> {
  const result: Record<string, SecretPatch> = Object.fromEntries(existing.map((key) => [key, { action: cleared.includes(key) ? 'clear' : 'unchanged' }]))
  for (const line of lines(source)) {
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    result[line.slice(0, separator).trim()] = { action: 'replace', value: line.slice(separator + 1) }
  }
  return result
}

function lines(value: string): string[] { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }
function valid(form: McpForm): boolean { return Boolean(form.name.trim() && (form.type === 'stdio' ? form.command.trim() : form.url.trim())) }
function emptyMcp(): McpForm { return { name: '', type: 'stdio', command: '', argsText: '', url: '', disabled: false, envText: '', headerText: '', clearEnv: [], clearHeaders: [] } }
