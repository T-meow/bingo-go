import { useEffect, useState } from 'react'
import { Bubble, Sender, ThoughtChain, type BubbleItemType, type ThoughtChainItemType } from '@ant-design/x'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, StopOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, App, Button, Drawer, Empty, Form, Input, InputNumber, Select, Space, Tag, Typography } from 'antd'
import type { TeamDefinition, TeamSnapshot } from '../../../../shared/contracts/cli'
import type { GuiError } from '../../../../shared/contracts/ipc'
import type { TeamSelection } from './TeamSidebar'

export type TeamActivity = Array<{ id: string; kind: string; summary: string; status: string }>

export function TeamPage({ snapshot, selection, error, operationBusy, turnBusy, activity, onRefresh, onValidate, onSave, onStart, onStop, onMessage, onPost }: {
  snapshot: TeamSnapshot | null
  selection: TeamSelection | null
  error: GuiError | null
  operationBusy: boolean
  turnBusy: boolean
  activity: TeamActivity
  onRefresh: () => void
  onValidate: () => void
  onSave: (definition: TeamDefinition) => Promise<boolean>
  onStart: () => void
  onStop: () => void
  onMessage: (member: string, message: string) => Promise<boolean>
  onPost: (channel: string, text: string) => Promise<boolean>
}): React.JSX.Element {
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<TeamDefinition | null>(null)
  const currentDefinition = isTeamDefinition(snapshot?.definition) ? snapshot.definition : null
  const futureDefinition = Boolean(snapshot?.definition && snapshot.definition.schemaVersion > 1)
  useEffect(() => {
    if (currentDefinition) setDraft(normalizeDefinition(currentDefinition))
  }, [currentDefinition, snapshot?.revision])

  const openEditor = (): void => {
    if (!snapshot || futureDefinition) return
    setDraft(currentDefinition ? normalizeDefinition(currentDefinition) : createDefinition(snapshot))
    setEditorOpen(true)
  }
  const save = async (): Promise<void> => {
    if (draft && await onSave(draft)) setEditorOpen(false)
  }
  const selectedChannel = selection?.kind === 'channel' ? snapshot?.channels.find((item) => item.name === selection.id) : undefined
  const selectedMember = selection?.kind === 'member' ? snapshot?.members.find((item) => item.name === selection.id) : undefined
  const messageCount = snapshot?.channels.reduce((total, channel) => total + channel.messages.length, 0) ?? 0
  const messageLimit = currentDefinition?.channel?.messageLimit ?? 500
  const runningMembers = snapshot?.members.filter((member) => member.status !== 'offline').length ?? 0

  return <main className="team-page">
    <header className="page-toolbar team-toolbar">
      <div className="page-heading"><span>Team 工作台</span><h1>{currentDefinition?.name ?? '项目协作'}</h1><div className="team-meta"><Tag title={snapshot?.path}>{projectLabel(snapshot?.path)}</Tag><Tag>{snapshot?.branch ?? '未知分支'}</Tag><Tag>{currentDefinition?.channel?.mode ?? 'serial'}</Tag><Tag>{messageCount}/{messageLimit} 消息</Tag><Tag color={runningMembers ? 'processing' : 'default'}>{runningMembers ? `${runningMembers} 个成员运行中` : '未运行'}</Tag><Tag color={snapshot?.validation ? 'error' : snapshot?.available ? 'success' : 'default'}>{snapshot?.validation ? '配置异常' : snapshot?.available ? '蓝图已加载' : '未配置'}</Tag></div></div>
      <Space wrap>
        <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={operationBusy}>刷新</Button>
        <Button onClick={onValidate} disabled={!snapshot?.available}>校验</Button>
        <Button icon={<EditOutlined />} onClick={openEditor} disabled={!snapshot || futureDefinition}>编辑蓝图</Button>
        <Button type="primary" icon={<TeamOutlined />} disabled={turnBusy || !snapshot?.available || Boolean(snapshot.validation)} loading={operationBusy} onClick={onStart}>启动</Button>
        <Button danger icon={<StopOutlined />} disabled={turnBusy || !snapshot?.members.some((member) => member.status !== 'offline')} onClick={onStop}>停止</Button>
      </Space>
    </header>
    {error && <Alert className="page-alert" type="error" showIcon message={error.code} description={error.msg} />}
    {futureDefinition && <Alert className="page-alert" type="warning" showIcon message="较新的 Team 蓝图" description={`schemaVersion ${snapshot?.definition?.schemaVersion ?? ''} 高于当前支持的 v1，现以只读方式打开。`} />}
    {snapshot?.validation && <Alert className="page-alert" type="warning" showIcon message="Team 校验未通过" description={snapshot.validation} />}
    <section className="team-workspace">
      {!snapshot && <Empty description="正在读取 Team 状态" />}
      {snapshot && !selection && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧选择频道或成员" />}
      {selectedChannel && <ChannelView channel={selectedChannel} busy={operationBusy} onPost={(text) => onPost(selectedChannel.name, text)} />}
      {selectedMember && <MemberView member={selectedMember} activity={activity} busy={operationBusy} onMessage={(message) => onMessage(selectedMember.name, message)} />}
    </section>
    <TeamEditor open={editorOpen} snapshot={snapshot} draft={draft} busy={operationBusy} onChange={setDraft} onClose={() => setEditorOpen(false)} onSave={save} />
  </main>
}

export function TeamInspector({ snapshot, selection, activity, operationBusy, onRefreshChannel, onReadActivity, onStopMember, onRemoveMember }: {
  snapshot: TeamSnapshot | null
  selection: TeamSelection | null
  activity: TeamActivity
  operationBusy: boolean
  onRefreshChannel: (channel: string) => void
  onReadActivity: (member: string) => void
  onStopMember: (member: string) => void
  onRemoveMember: (member: string) => void
}): React.JSX.Element {
  const { modal } = App.useApp()
  const member = selection?.kind === 'member' ? snapshot?.members.find((item) => item.name === selection.id) : undefined
  const channel = selection?.kind === 'channel' ? snapshot?.channels.find((item) => item.name === selection.id) : undefined
  return <div className="inspector-content team-inspector"><header><span>Copilot 检查器</span><strong>{member?.name ?? (channel ? `#${channel.name}` : 'Team 状态')}</strong></header>
    {!member && !channel && <div className="inspector-empty"><TeamOutlined /><span>选择成员或频道查看详情</span></div>}
    {member && <>
      <dl className="inspector-details"><dt>状态</dt><dd><Tag color={member.status === 'standby' ? 'success' : member.status === 'busy' ? 'processing' : member.status === 'failed' ? 'error' : 'default'}>{member.status}</Tag></dd><dt>Agent</dt><dd>{member.agent}</dd><dt>Provider</dt><dd>{member.provider || '继承会话'}</dd><dt>Model</dt><dd>{member.model || '继承会话'}</dd><dt>待处理</dt><dd>{member.pending}</dd><dt>未确认</dt><dd>{member.unacked}</dd></dl>
      <Space wrap><Button onClick={() => onReadActivity(member.name)} loading={operationBusy}>刷新活动</Button><Button danger onClick={() => onStopMember(member.name)}>停止</Button><Button danger icon={<DeleteOutlined />} onClick={() => modal.confirm({ title: `移除 ${member.name}？`, content: '这会停止并移除当前运行实例，但不会改写 Team 蓝图。', okText: '移除实例', okButtonProps: { danger: true }, onOk: () => onRemoveMember(member.name) })}>移除</Button></Space>
      <section className="inspector-activity"><h2>消息活动</h2>{activity.length ? <ThoughtChain items={activityToThoughts(activity)} /> : <Typography.Text type="secondary">暂无活动记录</Typography.Text>}</section>
    </>}
    {channel && <><dl className="inspector-details"><dt>模式</dt><dd>{channel.mode}</dd><dt>序号</dt><dd>{channel.seq}</dd><dt>状态</dt><dd>{channel.frozen ? <Tag color="error">已冻结</Tag> : <Tag color="success">可用</Tag>}</dd><dt>成员</dt><dd>{channel.members.join(', ')}</dd></dl><Button icon={<ReloadOutlined />} onClick={() => onRefreshChannel(channel.name)}>刷新记录</Button></>}
  </div>
}

function ChannelView({ channel, busy, onPost }: { channel: TeamSnapshot['channels'][number]; busy: boolean; onPost: (text: string) => Promise<boolean> }): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const items: BubbleItemType[] = channel.messages.map((message) => ({ key: `${channel.name}-${message.seq}`, role: message.from === 'user' ? 'user' : 'ai', content: message.text, header: `${message.from} · #${message.seq}` }))
  const submit = async (value: string): Promise<void> => { if (await onPost(value)) setDraft('') }
  return <div className="team-thread"><header><div><span>频道</span><h2>#{channel.name}</h2></div><Tag color={channel.frozen ? 'error' : 'success'}>{channel.frozen ? '已冻结' : channel.mode}</Tag></header><div className="team-thread-scroll">{items.length ? <Bubble.List items={items} role={{ user: { placement: 'end', variant: 'filled' }, ai: { placement: 'start', variant: 'borderless' } }} /> : <Empty description="频道还没有消息" />}</div><Sender value={draft} disabled={busy || channel.frozen} placeholder={channel.frozen ? '频道已冻结' : `发送到 #${channel.name}`} onChange={setDraft} onSubmit={(value) => void submit(value)} /></div>
}

function MemberView({ member, activity, busy, onMessage }: { member: TeamSnapshot['members'][number]; activity: TeamActivity; busy: boolean; onMessage: (message: string) => Promise<boolean> }): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const submit = async (value: string): Promise<void> => { if (await onMessage(value)) setDraft('') }
  return <div className="team-thread"><header><div><span>定向消息</span><h2>{member.name}</h2></div><Tag>{member.agent}</Tag></header><div className="team-thread-scroll">{activity.length ? <ThoughtChain items={activityToThoughts(activity)} /> : <Empty description="选择“刷新活动”查看消息回执" />}</div><Sender value={draft} disabled={busy || member.status === 'offline' || member.status === 'failed'} placeholder={`给 ${member.name} 发送指令`} onChange={setDraft} onSubmit={(value) => void submit(value)} /></div>
}

function TeamEditor({ open, snapshot, draft, busy, onChange, onClose, onSave }: { open: boolean; snapshot: TeamSnapshot | null; draft: TeamDefinition | null; busy: boolean; onChange: (value: TeamDefinition) => void; onClose: () => void; onSave: () => void }): React.JSX.Element {
  const definitions = snapshot?.agentDefinitions ?? []
  const updateMember = (index: number, patch: Partial<TeamDefinition['members'][number]>): void => {
    if (!draft) return
    onChange({ ...draft, members: draft.members.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member) })
  }
  return <Drawer title="Team 蓝图" size={560} open={open} onClose={onClose} extra={<Button type="primary" icon={<SaveOutlined />} disabled={!draft?.members.length} loading={busy} onClick={onSave}>保存</Button>}>
    {!draft ? <Empty description="没有可编辑的蓝图" /> : <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Team 名称" required><Input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></Form.Item>
      <div className="team-editor-grid"><Form.Item label="频道模式"><Select value={draft.channel?.mode ?? 'serial'} options={[{ value: 'serial', label: 'Serial' }, { value: 'free', label: 'Free' }]} onChange={(mode) => onChange({ ...draft, channel: { ...draft.channel, mode } })} /></Form.Item><Form.Item label="频道消息上限"><InputNumber min={1} max={100000} value={draft.channel?.messageLimit ?? 500} onChange={(messageLimit) => onChange({ ...draft, channel: { ...draft.channel, messageLimit: messageLimit ?? 500 } })} /></Form.Item></div>
      <div className="team-editor-members"><header><div><strong>成员</strong><span>实例名引用现有 AgentDef，运行引擎可按成员覆盖。</span></div><Button icon={<PlusOutlined />} disabled={!definitions.length} onClick={() => onChange({ ...draft, members: [...draft.members, { name: `member-${draft.members.length + 1}`, agent: definitions[0]?.name ?? '' }] })}>添加</Button></header>
        {draft.members.map((member, index) => <section className="team-member-editor" key={`${index}-${member.name}`}><div className="team-member-editor-title"><strong>{member.name || `成员 ${index + 1}`}</strong><Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除 ${member.name}`} onClick={() => onChange({ ...draft, members: draft.members.filter((_, memberIndex) => memberIndex !== index) })} /></div><div className="team-editor-grid"><Form.Item label="实例名" required><Input value={member.name} onChange={(event) => updateMember(index, { name: event.target.value })} /></Form.Item><Form.Item label="AgentDef" required><Select value={member.agent} options={definitions.map((definition) => ({ value: definition.name, label: `${definition.name} · ${definition.source}` }))} onChange={(agent) => updateMember(index, { agent })} /></Form.Item><Form.Item label="头像"><Select allowClear value={member.avatar} options={(snapshot?.avatars ?? []).map((avatar) => ({ value: avatar, label: avatar }))} onChange={(avatar) => updateMember(index, { avatar })} /></Form.Item><Form.Item label="Provider"><Input value={member.provider ?? ''} placeholder="继承" onChange={(event) => updateMember(index, { provider: event.target.value || undefined })} /></Form.Item><Form.Item label="Model"><Input value={member.model ?? ''} placeholder="继承" onChange={(event) => updateMember(index, { model: event.target.value || undefined })} /></Form.Item><Form.Item label="Thinking"><Select allowClear value={member.thinking} options={['off', 'low', 'medium', 'high', 'xhigh', 'max'].map((value) => ({ value, label: value }))} onChange={(thinking) => updateMember(index, { thinking })} /></Form.Item></div></section>)}
      </div>
    </Form>}
  </Drawer>
}

function normalizeDefinition(definition: TeamDefinition): TeamDefinition {
  return { ...definition, channel: { mode: definition.channel?.mode ?? 'serial', messageLimit: definition.channel?.messageLimit ?? 500 }, members: definition.members.map((member) => ({ ...member })) }
}
function createDefinition(snapshot: TeamSnapshot): TeamDefinition {
  const agent = snapshot.agentDefinitions[0]?.name ?? ''
  return { schemaVersion: 1, name: 'project-team', channel: { mode: 'serial', messageLimit: 500 }, members: agent ? [{ name: 'member-1', agent }] : [] }
}
function activityToThoughts(activity: TeamActivity): ThoughtChainItemType[] {
  return activity.map((item) => ({ key: item.id, title: item.kind, description: item.summary, status: item.status === 'answered' ? 'success' : item.status === 'dropped' ? 'error' : 'loading' }))
}
function isTeamDefinition(value: TeamSnapshot['definition'] | undefined): value is TeamDefinition {
  return Boolean(value && value.schemaVersion === 1 && typeof value.name === 'string' && Array.isArray(value.members))
}
function projectLabel(path?: string): string {
  if (!path) return '未知项目'
  const parts = path.split(/[\\/]/)
  const bingo = parts.lastIndexOf('.bingo')
  return bingo > 0 ? parts[bingo - 1] : parts.at(-2) ?? '项目'
}
