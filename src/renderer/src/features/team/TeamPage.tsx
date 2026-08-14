import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import { Bubble, Sender, ThoughtChain, type BubbleItemType, type ThoughtChainItemType } from '@ant-design/x'
import { DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, StopOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, App, Button, Checkbox, Collapse, Drawer, Dropdown, Empty, Form, Input, InputNumber, Modal, Select, Skeleton, Space, Tag, Typography } from 'antd'
import type { AgentDefinitionDocument, TeamDefinition, TeamLobby, TeamPresetModelMapping, TeamPresetPreview, TeamSnapshot, TeamTask } from '../../../../shared/contracts/cli'
import type { GuiError, ModelListOutput, RuntimeSettings } from '../../../../shared/contracts/ipc'
import type { TeamSelection, TeamState } from '../../state/teamReducer'
import { AgentDefinitionPanel, type AgentDefinitionDraft } from './AgentDefinitionEditor'
import { ModelPicker } from '../../components/ModelPicker'
import { TeamTaskCreateDrawer, type TeamTaskCreateInput } from './TeamTaskCreateDrawer'
import { TaskStatusTag, TeamTaskView } from './TeamTaskView'
import { AvatarPicker } from '../../components/AvatarPicker'
import { IdentityAvatar, SpeakerAvatar } from '../../components/IdentityAvatar'
import { useUserProfile } from '../../profile/UserProfileProvider'
import { availableGeometricAvatarIds } from '../../../../shared/avatars'

export type TeamActivity = Array<{ id: string; kind: string; summary: string; status: string }>
export type TeamCreateRequest = 'task' | 'role' | 'blueprint' | null

export function TeamPage({ state, error, operationBusy, turnBusy, activity, taskCapability, teamV2Capability, createRequest, providers, onCreateRequestHandled, onRefresh, onValidate, onSave, onStart, onStop, onMessage, onPost, onPostLobby, onImportAvatar, onChoosePreset, onImportPreset, onExportPreset, onLoadTask, onCreateTask, onPostTask, onPauseTask, onResumeTask, onCompleteTask, onCancelTask, onReloadDefinitions, onListModels, onSaveDefinition, onArchiveDefinition }: {
  state: TeamState
  error: GuiError | null
  operationBusy: boolean
  turnBusy: boolean
  activity: TeamActivity
  taskCapability: boolean
  teamV2Capability: boolean
  createRequest: TeamCreateRequest
  providers: RuntimeSettings['providers']
  onCreateRequestHandled: () => void
  onRefresh: () => void
  onValidate: () => void
  onSave: (definition: TeamDefinition) => Promise<boolean>
  onStart: () => void
  onStop: () => void
  onMessage: (member: string, message: string) => Promise<boolean>
  onPost: (channel: string, text: string) => Promise<boolean>
  onPostLobby: (text: string, targets: string[]) => Promise<boolean>
  onImportAvatar: (fileName: string, data: string) => Promise<string | null>
  onChoosePreset: () => Promise<{ data: string; preview: TeamPresetPreview } | null>
  onImportPreset: (data: string, resolutions: Record<string, 'update' | 'keep'>, modelMappings: Record<string, TeamPresetModelMapping>) => Promise<boolean>
  onExportPreset: () => Promise<boolean>
  onLoadTask: (taskId: string, beforeSeq?: number) => void
  onCreateTask: (input: TeamTaskCreateInput) => Promise<boolean>
  onPostTask: (taskId: string, text: string) => Promise<boolean>
  onPauseTask: (taskId: string) => void
  onResumeTask: (taskId: string, message?: string) => Promise<boolean>
  onCompleteTask: (taskId: string) => void
  onCancelTask: (taskId: string) => void
  onReloadDefinitions: () => void
  onListModels: (provider: string) => Promise<ModelListOutput | null>
  onSaveDefinition: (draft: AgentDefinitionDraft) => Promise<boolean>
  onArchiveDefinition: (definition: AgentDefinitionDocument) => Promise<boolean>
}): React.JSX.Element {
  const snapshot = state.snapshot
  const selection = state.selection
  const [editorOpen, setEditorOpen] = useState(false)
  const [taskCreateOpen, setTaskCreateOpen] = useState(false)
  const [roleCreateOpen, setRoleCreateOpen] = useState(false)
  const [draft, setDraft] = useState<TeamDefinition | null>(null)
  const [selectedLobbyMessages, setSelectedLobbyMessages] = useState<number[]>([])
  const [preset, setPreset] = useState<{ data: string; preview: TeamPresetPreview } | null>(null)
  const [presetResolutions, setPresetResolutions] = useState<Record<string, 'update' | 'keep'>>({})
  const [presetModelMappings, setPresetModelMappings] = useState<Record<string, TeamPresetModelMapping>>({})
  const [starterBusy, setStarterBusy] = useState(false)
  const currentDefinition = useMemo(() => editableDefinition(snapshot?.definition), [snapshot?.definition])
  const futureDefinition = Boolean(snapshot?.definition && snapshot.definition.schemaVersion > 2)

  useEffect(() => {
    if (currentDefinition) setDraft(normalizeDefinition(currentDefinition))
  }, [currentDefinition, snapshot?.revision])
  useEffect(() => {
    if (!createRequest) return
    if (createRequest === 'task') setTaskCreateOpen(true)
    if (createRequest === 'role') setRoleCreateOpen(true)
    if (createRequest === 'blueprint') openEditor()
    onCreateRequestHandled()
  }, [createRequest])

  const openEditor = (): void => {
    if (!snapshot || futureDefinition || !teamV2Capability) return
    setDraft(currentDefinition ? normalizeDefinition(currentDefinition) : createDefinition(snapshot))
    setEditorOpen(true)
  }
  const save = async (): Promise<void> => {
    if (draft && await onSave(draft)) setEditorOpen(false)
  }
  const saveMemberAvatar = async (memberName: string, avatar: string): Promise<boolean> => {
    if (!currentDefinition) return false
    const index = currentDefinition.members.findIndex((member) => member.name === memberName)
    if (index < 0) return false
    const next = normalizeDefinition({
      ...currentDefinition,
      members: currentDefinition.members.map((member, memberIndex) => memberIndex === index ? { ...member, avatar } : member)
    })
    const saved = await onSave(next)
    if (saved) setDraft(next)
    return saved
  }
  const installStarterTeam = async (): Promise<void> => {
    if (!snapshot || !teamV2Capability) return
    setStarterBusy(true)
    try {
      const known = new Set(state.definitions.map((definition) => definition.name))
      for (const role of starterRoles()) {
        if (known.has(role.name)) continue
        if (!await onSaveDefinition(role)) return
        known.add(role.name)
      }
      const definition = createStarterDefinition()
      if (await onSave(definition)) setDraft(definition)
    } finally {
      setStarterBusy(false)
    }
  }
  const selectedChannel = selection?.kind === 'channel' ? snapshot?.channels.find((item) => item.name === selection.id) : undefined
  const selectedMember = selection?.kind === 'member' ? snapshot?.members.find((item) => item.name === selection.id) : undefined
  const messageCount = snapshot?.channels.reduce((total, channel) => total + channel.messages.length, 0) ?? 0
  const runningMembers = snapshot?.members.filter((member) => member.status !== 'offline').length ?? 0

  return <main className="team-page">
    <header className="page-toolbar team-toolbar">
      <div className="page-heading"><span>{sectionKicker(state)}</span><h1>{currentDefinition?.name ?? '项目协作'}</h1><div className="team-meta"><Tag title={snapshot?.path}>{projectLabel(snapshot?.path)}</Tag><Tag>{snapshot?.branch ?? '未知分支'}</Tag>{state.section === 'tasks' && <Tag>{state.tasks.length} 个任务</Tag>}{state.section === 'rooms' && <Tag>{messageCount} 条房间消息</Tag>}{state.section === 'roles' && <Tag>{state.definitions.length} 个角色</Tag>}<Tag color={runningMembers ? 'processing' : 'default'}>{runningMembers ? `${runningMembers} 个实例在线` : '未运行'}</Tag><Tag color={snapshot?.validation ? 'error' : snapshot?.available ? 'success' : 'default'}>{snapshot?.validation ? '配置异常' : snapshot?.available ? '蓝图已加载' : '未配置'}</Tag></div></div>
      <Space wrap className="team-primary-actions">
        {state.section === 'tasks' && <Button type="primary" icon={<PlusOutlined />} disabled={!taskCapability || !snapshot?.available || Boolean(snapshot.validation)} onClick={() => setTaskCreateOpen(true)}>新建任务</Button>}
        {state.section === 'roles' && <Button type="primary" icon={<PlusOutlined />} disabled={!taskCapability} onClick={() => setRoleCreateOpen(true)}>新建角色</Button>}
        {state.section === 'rooms' && <Button type="primary" icon={<TeamOutlined />} disabled={turnBusy || !snapshot?.available || Boolean(snapshot.validation)} loading={operationBusy} onClick={onStart}>启动 Team</Button>}
        <Dropdown menu={{ items: [
          { key: 'refresh', icon: <ReloadOutlined />, label: '刷新状态', disabled: operationBusy, onClick: onRefresh },
          { key: 'validate', label: '校验蓝图', disabled: !snapshot?.available, onClick: onValidate },
          { key: 'edit', icon: <EditOutlined />, label: '编辑蓝图', disabled: !snapshot || futureDefinition || !teamV2Capability, onClick: openEditor },
          { key: 'import-preset', label: '导入团队预设', disabled: operationBusy || !teamV2Capability, onClick: () => { void onChoosePreset().then((selected) => { if (selected) { setPreset(selected); setPresetResolutions({}); setPresetModelMappings({}) } }) } },
          { key: 'export-preset', label: '导出团队预设', disabled: operationBusy || !snapshot?.available || !teamV2Capability, onClick: () => { void onExportPreset() } },
          { key: 'stop', icon: <StopOutlined />, danger: true, label: '停止 Team', disabled: turnBusy || !snapshot?.members.some((member) => member.status !== 'offline'), onClick: onStop }
        ] }}><Button icon={<MoreOutlined />} aria-label="更多 Team 操作">更多</Button></Dropdown>
      </Space>
    </header>
    {error && <Alert className="page-alert" type="error" showIcon message={error.code} description={error.msg} />}
    {!teamV2Capability && <Alert className="page-alert" type="info" showIcon message="当前 Bingo 不支持固定团队 v2" description="升级内置 Bingo 后可使用固定成员、团队大厅、任务群聊、人格配置和预设；传统房间与成员功能仍可使用。" />}
    {futureDefinition && <Alert className="page-alert" type="warning" showIcon message="较新的 Team 蓝图" description={`schemaVersion ${snapshot?.definition?.schemaVersion ?? ''} 高于当前支持的 v2，现以只读方式打开。`} />}
    {snapshot?.validation && <Alert className="page-alert" type="warning" showIcon message="Team 校验未通过" description={snapshot.validation} />}
    <section className="team-workspace">
      {!snapshot && <div className="team-loading"><Skeleton active paragraph={{ rows: 7 }} /></div>}
      {snapshot && state.section === 'tasks' && <TeamTaskView state={state} busy={operationBusy} onLoad={onLoadTask} onPost={onPostTask} onPause={onPauseTask} onResume={onResumeTask} onComplete={onCompleteTask} onCancel={onCancelTask} />}
      {snapshot && state.section === 'lobby' && !currentDefinition && <div className="team-starter-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未配置固定团队"><Button type="primary" icon={<TeamOutlined />} loading={starterBusy} disabled={operationBusy || !teamV2Capability} onClick={() => { void installStarterTeam() }}>创建开发三人组</Button></Empty></div>}
      {snapshot && state.section === 'lobby' && currentDefinition && !selectedMember && <LobbyView lobby={state.lobby} members={snapshot.members.filter((member) => member.kind !== 'hire')} busy={operationBusy} selected={selectedLobbyMessages} onSelectedChange={setSelectedLobbyMessages} onCreateTask={() => setTaskCreateOpen(true)} onPost={onPostLobby} />}
      {snapshot && state.section === 'roles' && <AgentDefinitionPanel state={state} openRequest={roleCreateOpen} busy={operationBusy} error={error} providers={providers} onRequestHandled={() => setRoleCreateOpen(false)} onReload={onReloadDefinitions} onListModels={onListModels} onSave={onSaveDefinition} onArchive={onArchiveDefinition} />}
      {snapshot && state.section === 'rooms' && !selection && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧选择频道或成员" />}
      {snapshot && state.section === 'rooms' && selectedChannel && <ChannelView channel={selectedChannel} members={snapshot.members} busy={operationBusy} onPost={(text) => onPost(selectedChannel.name, text)} />}
      {snapshot && (state.section === 'rooms' || state.section === 'lobby') && selectedMember && <MemberView member={selectedMember} activity={activity} busy={operationBusy} editable={Boolean(currentDefinition?.members.some((member) => member.name === selectedMember.name))} onImportAvatar={onImportAvatar} onSaveAvatar={(avatar) => saveMemberAvatar(selectedMember.name, avatar)} onMessage={(message) => onMessage(selectedMember.name, message)} />}
    </section>
    <TeamEditor open={editorOpen} snapshot={snapshot} draft={draft} busy={operationBusy} providers={providers} onListModels={onListModels} onImportAvatar={onImportAvatar} onChange={setDraft} onClose={() => setEditorOpen(false)} onSave={save} />
    <TeamTaskCreateDrawer open={taskCreateOpen} state={state} busy={operationBusy} contextMessageSeqs={selectedLobbyMessages} onClose={() => setTaskCreateOpen(false)} onCreate={onCreateTask} />
    <PresetImportModal preset={preset} resolutions={presetResolutions} modelMappings={presetModelMappings} providers={providers} busy={operationBusy} onListModels={onListModels} onResolution={(key, choice) => setPresetResolutions((current) => ({ ...current, [key]: choice }))} onModelMapping={(memberId, mapping) => setPresetModelMappings((current) => ({ ...current, [memberId]: mapping }))} onClose={() => setPreset(null)} onImport={async () => { if (preset && await onImportPreset(preset.data, presetResolutions, presetModelMappings)) setPreset(null) }} />
  </main>
}

export function TeamInspector({ state, activity, operationBusy, onRefreshChannel, onReadActivity, onStopMember, onRemoveMember, onRestartMember, onMarkUseful, onPromoteMember }: {
  state: TeamState
  activity: TeamActivity
  operationBusy: boolean
  onRefreshChannel: (channel: string) => void
  onReadActivity: (member: string) => void
  onStopMember: (member: string) => void
  onRemoveMember: (member: string) => void
  onRestartMember: (member: string) => void
  onMarkUseful: (member: string) => void
  onPromoteMember: (member: string) => void
}): React.JSX.Element {
  const { modal } = App.useApp()
  const selection = state.selection
  const member = selection?.kind === 'member' ? state.snapshot?.members.find((item) => item.name === selection.id) : undefined
  const channel = selection?.kind === 'channel' ? state.snapshot?.channels.find((item) => item.name === selection.id) : undefined
  const task = selection?.kind === 'task' ? state.taskDetails[selection.id] ?? state.tasks.find((item) => item.id === selection.id) : undefined
  if (task) return <TaskInspector task={task} state={state} />
  return <div className="inspector-content team-inspector"><header><span>Team 检查器</span><strong>{member?.name ?? (channel ? `#${channel.name}` : 'Team 状态')}</strong></header>
    {!member && !channel && <div className="inspector-empty"><TeamOutlined /><span>选择成员、频道或任务查看详情</span></div>}
    {member && <>
      <div className="team-inspector-identity"><IdentityAvatar identity={member.name} avatar={member.avatar} avatarDataUrl={member.avatarDataUrl} size={52} /><span><strong>{member.name}</strong><small>{member.profile?.identity?.title || (member.kind === 'hire' ? '临时成员' : '固定成员')}</small></span></div>
      <dl className="inspector-details"><dt>状态</dt><dd><Tag color={member.status === 'standby' ? 'success' : member.status === 'busy' ? 'processing' : member.status === 'failed' ? 'error' : 'default'}>{member.status}</Tag>{member.kind === 'hire' && <Tag color={member.recommended ? 'success' : 'default'}>{member.recommended ? '推荐固定' : '临时成员'}</Tag>}{member.restartRequired && <Tag color="warning">需要重启</Tag>}</dd><dt>身份</dt><dd>{member.profile?.identity?.title || (member.kind === 'hire' ? '临时成员' : '固定成员')}</dd><dt>Agent</dt><dd>{member.agent}</dd>{member.taskId && <><dt>关联任务</dt><dd>{state.tasks.find((task) => task.id === member.taskId)?.title ?? member.taskId}</dd></>}<dt>Provider</dt><dd>{member.provider || '继承会话'}</dd><dt>Model</dt><dd>{member.model || '继承会话'}</dd><dt>Thinking</dt><dd>{member.thinking || '继承'}</dd><dt>待处理</dt><dd>{member.pending}</dd><dt>未确认</dt><dd>{member.unacked}</dd></dl>
      <Space wrap><Button onClick={() => onReadActivity(member.name)} loading={operationBusy}>刷新活动</Button>{member.kind === 'hire' ? <><Button onClick={() => onMarkUseful(member.name)}>标记有用</Button><Button type="primary" disabled={member.status === 'busy'} onClick={() => onPromoteMember(member.name)}>固定成员</Button></> : <Button icon={<ReloadOutlined />} disabled={member.status === 'busy'} onClick={() => onRestartMember(member.name)}>重启成员</Button>}<Button danger onClick={() => onStopMember(member.name)}>停止</Button><Button danger icon={<DeleteOutlined />} onClick={() => modal.confirm({ title: `移除 ${member.name}？`, content: '这会停止并移除当前运行实例，但不会改写 Team 蓝图。', okText: '移除实例', okButtonProps: { danger: true }, onOk: () => onRemoveMember(member.name) })}>移除</Button></Space>
      {member.profile && <section className="inspector-activity"><h2>身份与工作方式</h2>{member.profile.personality && <Typography.Paragraph>{member.profile.personality}</Typography.Paragraph>}<Space wrap>{member.profile.constraints.map((constraint, index) => <Tag key={`${constraint.kind}-${index}`} color="warning">{constraint.kind}</Tag>)}{member.profile.preferences.map((preference) => <Tag key={preference}>{preference}</Tag>)}</Space></section>}
      <section className="inspector-activity"><h2>消息活动</h2>{activity.length ? <ThoughtChain items={activityToThoughts(activity)} /> : <Typography.Text type="secondary">暂无活动记录</Typography.Text>}</section>
    </>}
    {channel && <><dl className="inspector-details"><dt>模式</dt><dd>{channel.mode}</dd><dt>序号</dt><dd>{channel.seq}</dd><dt>状态</dt><dd>{channel.frozen ? <Tag color="error">已冻结</Tag> : <Tag color="success">可用</Tag>}</dd><dt>成员</dt><dd>{channel.members.join(', ')}</dd></dl><Button icon={<ReloadOutlined />} onClick={() => onRefreshChannel(channel.name)}>刷新记录</Button></>}
  </div>
}

function TaskInspector({ task, state }: { task: TeamTask | TeamState['tasks'][number]; state: TeamState }): React.JSX.Element {
  return <div className="inspector-content team-inspector"><header><span>任务检查器</span><strong>{task.title}</strong></header>
    <dl className="inspector-details"><dt>状态</dt><dd><TaskStatusTag status={task.status} /></dd><dt>领导人</dt><dd>{task.leader}</dd><dt>分支</dt><dd>{task.branch}</dd><dt>项目</dt><dd>{task.projectPath}</dd><dt>消息</dt><dd>{'messageCount' in task ? task.messageCount : task.messages.length}</dd></dl>
    {'reviewSummary' in task && task.reviewSummary && <section className="inspector-activity"><h2>验收摘要</h2><Typography.Paragraph>{task.reviewSummary}</Typography.Paragraph></section>}
    <section className="inspector-activity"><h2>参与者</h2><div className="team-inspector-members">{task.participants.map((participant) => { const current = state.memberRuntime[participant.name]; const runtime = current?.taskId && current.taskId !== task.id ? undefined : current; return <div key={participant.name}><IdentityAvatar identity={participant.name} avatar={participant.avatar} size={30} /><span><strong>{participant.name}</strong><small>{participant.provider || '继承 Provider'} · {participant.model || '继承模型'}</small></span><i className={`team-member-state ${runtime?.status ?? 'offline'}`} />{participant.name === task.leader && <Tag>领导人</Tag>}</div> })}</div></section>
  </div>
}

export function LobbyView({ lobby, members, busy, selected, onSelectedChange, onCreateTask, onPost }: {
  lobby: TeamLobby | null
  members: TeamSnapshot['members']
  busy: boolean
  selected: number[]
  onSelectedChange: (seqs: number[]) => void
  onCreateTask: () => void
  onPost: (text: string, targets: string[]) => Promise<boolean>
}): React.JSX.Element {
  const profile = useUserProfile()
  const [draft, setDraft] = useState('')
  const [targets, setTargets] = useState<string[]>([])
  const toggle = (seq: number, checked: boolean): void => onSelectedChange(checked ? [...selected, seq] : selected.filter((value) => value !== seq))
  const items: BubbleItemType[] = (lobby?.messages ?? []).map((message) => {
    if (message.kind === 'system') return { key: `${lobby?.id}-${message.seq}`, role: 'system', content: <span className="team-system-message">{message.text}</span> }
    const member = message.kind === 'member' ? members.find((candidate) => candidate.name === message.from) : undefined
    const user = message.kind === 'user'
    return {
      key: `${lobby?.id}-${message.seq}`,
      role: user ? 'user' : 'ai',
      avatar: user
        ? <SpeakerAvatar identity="用户" avatar={profile.snapshot?.values.avatar} avatarDataUrl={profile.snapshot?.avatarDataUrl} />
        : <SpeakerAvatar identity={message.from ?? 'main'} avatar={member?.avatar} avatarDataUrl={member?.avatarDataUrl} />,
      content: <div className="markdown-body"><Markdown skipHtml>{message.text}</Markdown></div>,
      header: <span className="team-message-header"><strong>{user ? '用户' : message.from ?? '主 Agent'}</strong><time>{new Date(message.at * 1_000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time><small>#{message.seq}</small></span>,
      footer: <Checkbox checked={selected.includes(message.seq)} onChange={(event) => toggle(message.seq, event.target.checked)}>选为任务上下文</Checkbox>
    }
  })
  const submit = async (value: string): Promise<void> => { if (await onPost(value, targets)) setDraft('') }
  return <div className="team-thread team-lobby-thread">
    <header><div><span>固定团队</span><h2>团队大厅</h2></div><Space><Select mode="multiple" allowClear maxTagCount="responsive" value={targets} placeholder="全体空闲成员" options={members.map((member) => ({ value: member.name, label: member.name, disabled: member.status === 'busy' }))} onChange={setTargets} /><Button icon={<PlusOutlined />} disabled={!selected.length} onClick={onCreateTask}>从所选消息创建任务</Button></Space></header>
    <div className="team-thread-scroll">{items.length ? <Bubble.List items={items} role={{ user: { placement: 'end', variant: 'filled', rootClassName: 'team-user-bubble' }, ai: { placement: 'start', variant: 'borderless', rootClassName: 'team-member-bubble' }, system: { placement: 'start', variant: 'borderless', rootClassName: 'team-system-bubble' } }} /> : <Empty description="大厅还没有消息" />}</div>
    <Sender value={draft} disabled={busy || members.length === 0} placeholder={targets.length ? `发送给 ${targets.join('、')}` : '发送给全体空闲成员'} onChange={setDraft} onSubmit={(value) => void submit(value)} />
  </div>
}

function PresetImportModal({ preset, resolutions, modelMappings, providers, busy, onListModels, onResolution, onModelMapping, onClose, onImport }: {
  preset: { data: string; preview: TeamPresetPreview } | null
  resolutions: Record<string, 'update' | 'keep'>
  modelMappings: Record<string, TeamPresetModelMapping>
  providers: RuntimeSettings['providers']
  busy: boolean
  onListModels: (provider: string) => Promise<ModelListOutput | null>
  onResolution: (key: string, choice: 'update' | 'keep') => void
  onModelMapping: (memberId: string, mapping: TeamPresetModelMapping) => void
  onClose: () => void
  onImport: () => Promise<void>
}): React.JSX.Element {
  const conflicts = preset?.preview.items.filter((item) => item.action === 'update') ?? []
  const providerNames = new Set(providers.map((provider) => provider.name))
  const teamConflict = conflicts.find((item) => item.kind === 'team')
  const keepsLocalTeam = Boolean(teamConflict && resolutions[teamConflict.key] === 'keep')
  const requiresMapping = keepsLocalTeam ? [] : preset?.preview.members.filter((member) => member.needsMapping || !member.provider || !providerNames.has(member.provider)) ?? []
  const unresolved = conflicts.some((item) => !resolutions[item.key])
    || requiresMapping.some((member) => !modelMappings[member.memberId]?.provider.trim() || !modelMappings[member.memberId]?.model.trim())
  return <Modal width={720} open={Boolean(preset)} title="导入团队预设" okText="导入" cancelText="取消" confirmLoading={busy} okButtonProps={{ disabled: unresolved }} onCancel={onClose} onOk={() => void onImport()}>
    {preset && <><div className="team-preset-summary"><strong>{preset.preview.teamName}</strong><span>{preset.preview.memberCount} 名成员 · {preset.preview.roleCount} 个角色 · {preset.preview.avatarCount} 个头像</span></div><div className="team-preset-items">{preset.preview.items.map((item) => <div key={item.key}><span><Tag color={item.action === 'add' ? 'success' : item.action === 'update' ? 'warning' : 'default'}>{item.action === 'add' ? '新增' : item.action === 'update' ? '冲突' : '保留'}</Tag><strong>{item.name}</strong><small>{item.kind}</small></span>{item.action === 'update' && <Select value={resolutions[item.key]} placeholder="选择处理方式" options={[{ value: 'update', label: '使用预设更新' }, { value: 'keep', label: '保留本地版本' }]} onChange={(choice) => onResolution(item.key, choice)} />}</div>)}</div>
      <section className="team-preset-models"><h3>成员模型映射</h3>{preset.preview.members.map((member) => <PresetMemberModelRow key={member.memberId} member={member} required={requiresMapping.some((candidate) => candidate.memberId === member.memberId)} mapping={modelMappings[member.memberId]} providers={providers} onListModels={onListModels} onChange={(mapping) => onModelMapping(member.memberId, mapping)} />)}</section>
      {requiresMapping.length > 0 && <Alert type="warning" showIcon message="需要完成模型映射" description="预设中缺少 Provider/模型，或对应 Provider 在本机不存在。完成逐成员映射后才能导入。" />}</>}
  </Modal>
}

function PresetMemberModelRow({ member, required, mapping, providers, onListModels, onChange }: {
  member: TeamPresetPreview['members'][number]
  required: boolean
  mapping?: TeamPresetModelMapping
  providers: RuntimeSettings['providers']
  onListModels: (provider: string) => Promise<ModelListOutput | null>
  onChange: (mapping: TeamPresetModelMapping) => void
}): React.JSX.Element {
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const chooseProvider = async (provider: string): Promise<void> => {
    onChange({ provider, model: '', thinking: mapping?.thinking })
    setLoading(true)
    const listed = await onListModels(provider)
    setLoading(false)
    setModels(listed?.models ?? [])
  }
  return <div className={`team-preset-model-row${required ? ' required' : ''}`}>
    <span><strong>{member.name}</strong><small>{member.memberId}</small></span>
    {required ? <><Select showSearch value={mapping?.provider} placeholder="映射 Provider" options={providers.map((provider) => ({ value: provider.name, label: provider.name }))} onChange={(provider) => { void chooseProvider(provider) }} /><ModelPicker value={mapping?.model ?? ''} models={models} loading={loading} disabled={!mapping?.provider} onChange={(model) => mapping && onChange({ ...mapping, model })} /></> : <span className="team-preset-effective-model"><Tag>{member.provider}</Tag><Tag>{member.model}</Tag>{member.thinking && <Tag>{member.thinking}</Tag>}</span>}
  </div>
}

export function ChannelView({ channel, members, busy, onPost }: { channel: TeamSnapshot['channels'][number]; members: TeamSnapshot['members']; busy: boolean; onPost: (text: string) => Promise<boolean> }): React.JSX.Element {
  const profile = useUserProfile()
  const [draft, setDraft] = useState('')
  const items: BubbleItemType[] = channel.messages.map((message) => {
    const user = message.from === 'user'
    const member = members.find((candidate) => candidate.name === message.from)
    return {
      key: `${channel.name}-${message.seq}`,
      role: user ? 'user' : 'ai',
      avatar: user
        ? <SpeakerAvatar identity="用户" avatar={profile.snapshot?.values.avatar} avatarDataUrl={profile.snapshot?.avatarDataUrl} />
        : <SpeakerAvatar identity={message.from || 'main'} avatar={member?.avatar} avatarDataUrl={member?.avatarDataUrl} />,
      content: <div className="markdown-body"><Markdown skipHtml>{message.text}</Markdown></div>,
      header: <span className="team-message-header"><strong>{user ? '用户' : message.from || '主 Agent'}</strong><small>#{message.seq}</small></span>
    }
  })
  const submit = async (value: string): Promise<void> => { if (await onPost(value)) setDraft('') }
  return <div className="team-thread"><header><div><span>频道</span><h2>#{channel.name}</h2></div><Tag color={channel.frozen ? 'error' : 'success'}>{channel.frozen ? '已冻结' : channel.mode}</Tag></header><div className="team-thread-scroll">{items.length ? <Bubble.List items={items} role={{ user: { placement: 'end', variant: 'filled', rootClassName: 'team-user-bubble' }, ai: { placement: 'start', variant: 'borderless', rootClassName: 'team-member-bubble' } }} /> : <Empty description="频道还没有消息" />}</div><Sender value={draft} disabled={busy || channel.frozen} placeholder={channel.frozen ? '频道已冻结' : `发送到 #${channel.name}`} onChange={setDraft} onSubmit={(value) => void submit(value)} /></div>
}

export function MemberView({ member, activity, busy, editable, onImportAvatar, onSaveAvatar, onMessage }: { member: TeamSnapshot['members'][number]; activity: TeamActivity; busy: boolean; editable: boolean; onImportAvatar: (fileName: string, data: string) => Promise<string | null>; onSaveAvatar: (avatar: string) => Promise<boolean>; onMessage: (message: string) => Promise<boolean> }): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [avatar, setAvatar] = useState(member.avatar)
  useEffect(() => setAvatar(member.avatar), [member.name, member.avatar])
  const submit = async (value: string): Promise<void> => { if (await onMessage(value)) setDraft('') }
  const upload = async (file: File): Promise<void> => {
    const imported = await onImportAvatar(file.name, await readFileBase64(file))
    if (imported) setAvatar(imported)
  }
  const saveAvatar = async (): Promise<void> => {
    if (avatar && await onSaveAvatar(avatar)) setAvatarOpen(false)
  }
  const editReason = member.kind === 'hire' ? '固定成员后可修改头像' : !editable ? '该成员来自只读子团队' : undefined
  return <div className="team-thread"><header><div className="team-member-thread-heading"><IdentityAvatar identity={member.name} avatar={member.avatar} avatarDataUrl={member.avatarDataUrl} size={54} /><span><small>定向消息</small><h2>{member.name}</h2></span></div><Space><Tag>{member.agent}</Tag><Button icon={<EditOutlined />} disabled={busy || Boolean(editReason)} title={editReason ?? '修改成员头像'} onClick={() => { setAvatar(member.avatar); setAvatarOpen(true) }}>修改头像</Button></Space></header><div className="team-thread-scroll">{activity.length ? <ThoughtChain items={activityToThoughts(activity)} /> : <Empty description="选择“刷新活动”查看消息回执" />}</div><Sender value={draft} disabled={busy || member.status === 'offline' || member.status === 'failed'} placeholder={`给 ${member.name} 发送指令`} onChange={setDraft} onSubmit={(value) => void submit(value)} />
    <Modal open={avatarOpen} title={`修改 ${member.name} 的头像`} okText="保存头像" cancelText="取消" confirmLoading={busy} okButtonProps={{ disabled: !avatar }} onCancel={() => setAvatarOpen(false)} onOk={() => void saveAvatar()}>
      <div className="member-avatar-preview"><IdentityAvatar identity={member.name} avatar={avatar} avatarDataUrl={avatar === member.avatar ? member.avatarDataUrl : undefined} size={72} /><span>头像会写入项目 Team 蓝图，并用于之后创建的任务快照。</span></div>
      <AvatarPicker value={avatar} identity={member.name} allowUpload disabled={busy} extraAvatars={member.avatar?.startsWith('project:') ? [{ id: member.avatar, dataUrl: member.avatarDataUrl }] : []} onChange={setAvatar} onUpload={(file) => void upload(file)} />
    </Modal>
  </div>
}

function TeamEditor({ open, snapshot, draft, busy, providers, onListModels, onImportAvatar, onChange, onClose, onSave }: { open: boolean; snapshot: TeamSnapshot | null; draft: TeamDefinition | null; busy: boolean; providers: RuntimeSettings['providers']; onListModels: (provider: string) => Promise<ModelListOutput | null>; onImportAvatar: (fileName: string, data: string) => Promise<string | null>; onChange: (value: TeamDefinition) => void; onClose: () => void; onSave: () => void }): React.JSX.Element {
  const definitions = snapshot?.agentDefinitions ?? []
  const updateMember = (index: number, patch: Partial<TeamDefinition['members'][number]>): void => {
    if (draft) onChange({ ...draft, members: draft.members.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member) })
  }
  const channels = draft?.channels ?? []
  return <Drawer title="Team 蓝图" size={720} open={open} onClose={onClose} extra={<Button type="primary" icon={<SaveOutlined />} disabled={!draft?.members.length || Boolean(draft.leader && !draft.members.some((member) => member.name === draft.leader))} loading={busy} onClick={onSave}>保存</Button>}>
    {!draft ? <Empty description="没有可编辑的蓝图" /> : <Form layout="vertical" requiredMark={false}>
      <div className="team-editor-grid"><Form.Item label="Team 名称" required><Input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></Form.Item><Form.Item label="稳定 Team ID" required><Input value={draft.teamId} disabled /></Form.Item><Form.Item label="默认领导人"><Select allowClear value={draft.leader} options={draft.members.filter((member) => member.name).map((member) => ({ value: member.name, label: member.name }))} onChange={(leader) => onChange({ ...draft, leader })} /></Form.Item></div>
      <div className="team-editor-grid"><Form.Item label="默认频道模式"><Select value={draft.channel?.mode ?? 'serial'} disabled={channels.length > 0} options={[{ value: 'serial', label: 'Serial' }, { value: 'free', label: 'Free' }]} onChange={(mode) => onChange({ ...draft, channel: { ...draft.channel, mode } })} /></Form.Item><Form.Item label="默认消息上限"><InputNumber min={1} max={100000} disabled={channels.length > 0} value={draft.channel?.messageLimit ?? 500} onChange={(messageLimit) => onChange({ ...draft, channel: { ...draft.channel, messageLimit: messageLimit ?? 500 } })} /></Form.Item></div>
      <EditorHeader title="固定成员" action={<Button icon={<PlusOutlined />} disabled={!definitions.length} onClick={() => onChange({ ...draft, members: [...draft.members, newMember(`member-${draft.members.length + 1}`, definitions[0]?.name ?? '', draft.members.length, undefined, draft.members.flatMap((member) => member.avatar ? [member.avatar] : []))] })}>添加成员</Button>} />
      <Collapse className="team-member-collapse" defaultActiveKey={draft.members[0] ? ['member-0'] : []} items={draft.members.map((member, index) => ({
        key: `member-${index}`,
        label: <span className="team-member-collapse-label"><IdentityAvatar identity={member.name || `成员 ${index + 1}`} avatar={member.avatar} avatarDataUrl={snapshot?.members.find((candidate) => candidate.name === member.name && candidate.avatar === member.avatar)?.avatarDataUrl} size={30} /><span><strong>{member.name || `成员 ${index + 1}`}</strong><small>{member.agent || '未选择角色'}</small></span></span>,
        extra: <Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除 ${member.name || `成员 ${index + 1}`}`} onClick={(event) => { event.stopPropagation(); const members = draft.members.filter((_, memberIndex) => memberIndex !== index); onChange({ ...draft, members, leader: draft.leader === member.name ? undefined : draft.leader }) }} />,
        children: <MemberEditor member={member} avatarDataUrl={snapshot?.members.find((candidate) => candidate.name === member.name && candidate.avatar === member.avatar)?.avatarDataUrl} definitions={definitions} avatars={snapshot?.avatars ?? []} providers={providers} onListModels={onListModels} onImportAvatar={onImportAvatar} onChange={(patch) => updateMember(index, patch)} />
      }))} />
      <EditorHeader title="命名频道" action={<Button icon={<PlusOutlined />} onClick={() => onChange({ ...draft, channels: [...channels, { name: `room-${channels.length + 1}`, mode: 'serial', messageLimit: 500 }] })}>添加频道</Button>} />
      {channels.length > 0 && <Collapse className="team-member-collapse" items={channels.map((channel, index) => ({
        key: `channel-${index}`,
        label: <span className="team-member-collapse-label"><strong>#{channel.name}</strong><small>{channel.mode ?? 'serial'}</small></span>,
        extra: <Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除频道 ${channel.name}`} onClick={(event) => { event.stopPropagation(); onChange({ ...draft, channels: channels.filter((_, channelIndex) => channelIndex !== index) }) }} />,
        children: <div className="team-editor-grid"><Form.Item label="频道名" required><Input value={channel.name} onChange={(event) => onChange({ ...draft, channels: channels.map((item, channelIndex) => channelIndex === index ? { ...item, name: event.target.value } : item) })} /></Form.Item><Form.Item label="模式"><Select value={channel.mode ?? 'serial'} options={[{ value: 'serial', label: 'Serial' }, { value: 'free', label: 'Free' }]} onChange={(mode) => onChange({ ...draft, channels: channels.map((item, channelIndex) => channelIndex === index ? { ...item, mode } : item) })} /></Form.Item><Form.Item label="成员"><Select mode="multiple" allowClear value={channel.members} placeholder="留空表示全部根成员" options={draft.members.map((member) => ({ value: member.name, label: member.name }))} onChange={(members) => onChange({ ...draft, channels: channels.map((item, channelIndex) => channelIndex === index ? { ...item, members: members.length ? members : undefined } : item) })} /></Form.Item><Form.Item label="消息上限"><InputNumber min={1} max={100000} value={channel.messageLimit ?? 500} onChange={(messageLimit) => onChange({ ...draft, channels: channels.map((item, channelIndex) => channelIndex === index ? { ...item, messageLimit: messageLimit ?? undefined } : item) })} /></Form.Item></div>
      }))} />}
      {draft.teams && draft.teams.length > 0 && <section className="team-child-teams"><h3>子团队（只读）</h3>{draft.teams.map((team, index) => <div key={`${team.path}-${index}`}><strong>{team.name || `子团队 ${index + 1}`}</strong><span>{team.path}</span></div>)}</section>}
    </Form>}
  </Drawer>
}

function EditorHeader({ title, action }: { title: string; action: React.ReactNode }): React.JSX.Element {
  return <div className="team-editor-section-header"><strong>{title}</strong>{action}</div>
}

function MemberEditor({ member, avatarDataUrl, definitions, avatars, providers, onListModels, onImportAvatar, onChange }: {
  member: TeamDefinition['members'][number]
  avatarDataUrl?: string
  definitions: TeamSnapshot['agentDefinitions']
  avatars: string[]
  providers: RuntimeSettings['providers']
  onListModels: (provider: string) => Promise<ModelListOutput | null>
  onImportAvatar: (fileName: string, data: string) => Promise<string | null>
  onChange: (patch: Partial<TeamDefinition['members'][number]>) => void
}): React.JSX.Element {
  const profile = member.profile
  const identity = profile.identity ?? {}
  const communication = profile.communication ?? {}
  const presetKinds = profile.constraints.map((constraint) => constraint.kind).filter((kind): kind is 'noNetwork' | 'noShell' | 'readOnly' | 'reviewOnly' => kind !== 'custom')
  const customConstraints = profile.constraints.filter((constraint) => constraint.kind === 'custom').map((constraint) => constraint.instruction).join('\n')
  const patchProfile = (patch: Partial<typeof profile>): void => onChange({ profile: { ...profile, ...patch } })
  const setConstraintKinds = (kinds: Array<'noNetwork' | 'noShell' | 'readOnly' | 'reviewOnly'>): void => {
    const custom = profile.constraints.filter((constraint) => constraint.kind === 'custom')
    patchProfile({ constraints: [...kinds.map((kind) => ({ kind, enforcement: 'prompt' as const, instruction: profileConstraintInstruction(kind) })), ...custom] })
  }
  const setCustomConstraints = (value: string): void => patchProfile({
    constraints: [...profile.constraints.filter((constraint) => constraint.kind !== 'custom'), ...splitLines(value).map((instruction) => ({ kind: 'custom' as const, enforcement: 'prompt' as const, instruction }))]
  })
  return <div className="team-member-editor">
    <h3>成员身份</h3><div className="team-editor-grid">
      <Form.Item label="实例名" required><Input value={member.name} onChange={(event) => onChange({ name: event.target.value })} /></Form.Item>
      <Form.Item label="稳定成员 ID" required><Input value={member.memberId} disabled /></Form.Item>
      <Form.Item label="角色" required><Select value={member.agent} options={definitions.map((definition) => ({ value: definition.name, label: `${definition.name} · ${definition.source}` }))} onChange={(agent) => onChange({ agent })} /></Form.Item>
      <Form.Item className="team-avatar-form-item" label="头像"><div className="team-avatar-editor"><IdentityAvatar identity={member.name || member.memberId} avatar={member.avatar} avatarDataUrl={avatarDataUrl} size={64} /><AvatarPicker value={member.avatar} identity={member.name || member.memberId} allowUpload extraAvatars={avatars.filter((avatar) => avatar.startsWith('project:')).map((id) => ({ id, dataUrl: id === member.avatar ? avatarDataUrl : undefined }))} onChange={(avatar) => onChange({ avatar })} onUpload={(file) => { void readFileBase64(file).then((data) => onImportAvatar(file.name, data)).then((avatar) => { if (avatar) onChange({ avatar }) }) }} /></div></Form.Item>
      <Form.Item label="身份头衔"><Input value={identity.title ?? ''} onChange={(event) => patchProfile({ identity: { ...identity, title: event.target.value || undefined } })} /></Form.Item>
      <Form.Item label="背景"><Input.TextArea value={identity.background ?? ''} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => patchProfile({ identity: { ...identity, background: event.target.value || undefined } })} /></Form.Item>
    </div>
    <Form.Item label="性格"><Input.TextArea value={profile.personality ?? ''} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => patchProfile({ personality: event.target.value || undefined })} /></Form.Item>
    <h3>群聊发言风格</h3><div className="team-editor-grid">
      <Form.Item label="语言"><Input value={communication.language ?? 'auto'} onChange={(event) => patchProfile({ communication: { ...communication, language: event.target.value || undefined } })} /></Form.Item>
      <Form.Item label="语气"><Input value={communication.tone ?? ''} onChange={(event) => patchProfile({ communication: { ...communication, tone: event.target.value || undefined } })} /></Form.Item>
      <Form.Item label="详细程度"><Select allowClear value={communication.verbosity} options={['concise', 'balanced', 'detailed'].map((value) => ({ value, label: value }))} onChange={(verbosity) => patchProfile({ communication: { ...communication, verbosity } })} /></Form.Item>
    </div><Form.Item label="表达说明"><Input.TextArea value={communication.instructions ?? ''} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => patchProfile({ communication: { ...communication, instructions: event.target.value || undefined } })} /></Form.Item>
    <h3>模型</h3><MemberModelFields member={member} providers={providers} onListModels={onListModels} onChange={onChange} />
    <h3>限制与偏好</h3><Form.Item label="行为约束"><Select mode="multiple" allowClear value={presetKinds} options={[
      { value: 'noNetwork', label: '不要联网' }, { value: 'noShell', label: '不要调用 Shell' }, { value: 'readOnly', label: '只读操作' }, { value: 'reviewOnly', label: '仅审查' }
    ]} onChange={setConstraintKinds} /></Form.Item>
    <Form.Item label="自定义约束"><Input.TextArea value={customConstraints} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(event) => setCustomConstraints(event.target.value)} /></Form.Item>
    <Form.Item label="工作偏好"><Input.TextArea value={profile.preferences.join('\n')} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(event) => patchProfile({ preferences: splitLines(event.target.value) })} /></Form.Item>
  </div>
}

function MemberModelFields({ member, providers, onListModels, onChange }: { member: TeamDefinition['members'][number]; providers: RuntimeSettings['providers']; onListModels: (provider: string) => Promise<ModelListOutput | null>; onChange: (patch: Partial<TeamDefinition['members'][number]>) => void }): React.JSX.Element {
  const [models, setModels] = useState<string[]>(member.model ? [member.model] : [])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!member.provider) { setModels(member.model ? [member.model] : []); return }
    let active = true
    setLoading(true)
    void onListModels(member.provider).then((result) => { if (active) setModels([...new Set([...(result?.models ?? []), ...(member.model ? [member.model] : [])])]) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [member.provider])
  return <div className="team-editor-grid"><Form.Item label="Provider"><Select allowClear value={member.provider} options={providers.map((provider) => ({ value: provider.name, label: provider.name }))} onChange={(provider) => onChange({ provider, model: undefined })} /></Form.Item><Form.Item label="Model"><ModelPicker value={member.model ?? ''} models={models} loading={loading} disabled={!member.provider} onChange={(model) => onChange({ model: model || undefined })} /></Form.Item><Form.Item label="Thinking"><Select allowClear value={member.thinking} options={['off', 'low', 'medium', 'high', 'xhigh', 'max'].map((value) => ({ value, label: value }))} onChange={(thinking) => onChange({ thinking })} /></Form.Item></div>
}

function normalizeDefinition(definition: TeamDefinition): TeamDefinition {
  const taken: string[] = []
  const members = definition.members.map((member) => {
    const avatar = member.avatar ?? randomMemberAvatar(taken)
    taken.push(avatar)
    return { ...member, avatar, profile: { ...member.profile, identity: member.profile.identity ? { ...member.profile.identity } : undefined, communication: member.profile.communication ? { ...member.profile.communication } : undefined, constraints: [...member.profile.constraints], preferences: [...member.profile.preferences] } }
  })
  return { ...definition, channel: { mode: definition.channel?.mode ?? 'serial', messageLimit: definition.channel?.messageLimit ?? 500 }, channels: definition.channels?.map((channel) => ({ ...channel, members: channel.members ? [...channel.members] : undefined })), members, teams: definition.teams?.map((team) => ({ ...team })) }
}
function createDefinition(snapshot: TeamSnapshot): TeamDefinition {
  const roles = snapshot.agentDefinitions.map((definition) => definition.name)
  if (roles.length === 0) return createStarterDefinition()
  const role = (preferred: string[], fallback = ''): string => preferred.find((name) => roles.includes(name)) ?? roles[0] ?? fallback
  const members: TeamDefinition['members'] = []
  members.push(newMember('负责人', role(['planner', 'lead', 'architect']), 0, { title: '技术负责人', personality: '沉稳、善于拆解目标并协调成员', tone: '清晰、决断', preferences: ['先明确验收标准，再分配工作'] }, memberAvatars(members)))
  members.push(newMember('实现者', role(['coder', 'implementer', 'developer']), 1, { title: '实现工程师', personality: '务实、专注交付和验证', tone: '直接、具体', preferences: ['优先使用项目既有模式', '完成后运行相关验证'] }, memberAvatars(members)))
  members.push(newMember('审查者', role(['reviewer', 'critic', 'tester']), 2, { title: '质量审查者', personality: '审慎、重视风险和证据', tone: '客观、简洁', preferences: ['先报告高风险问题', '结论必须附带可复现证据'] }, memberAvatars(members)))
  return { schemaVersion: 2, teamId: 'team-project-team', name: 'project-team', leader: members[0]?.name, channel: { mode: 'serial', messageLimit: 500 }, members }
}

function createStarterDefinition(): TeamDefinition {
  const members: TeamDefinition['members'] = []
  members.push(newMember('负责人', 'team-lead', 0, { title: '技术负责人', personality: '沉稳、善于拆解目标并协调成员', tone: '清晰、决断', preferences: ['先明确验收标准，再分配工作'] }, memberAvatars(members)))
  members.push(newMember('实现者', 'team-implementer', 1, { title: '实现工程师', personality: '务实、专注交付和验证', tone: '直接、具体', preferences: ['优先使用项目既有模式', '完成后运行相关验证'] }, memberAvatars(members)))
  members.push(newMember('审查者', 'team-reviewer', 2, { title: '质量审查者', personality: '审慎、重视风险和证据', tone: '客观、简洁', preferences: ['先报告高风险问题', '结论必须附带可复现证据'] }, memberAvatars(members)))
  return { schemaVersion: 2, teamId: 'team-project-team', name: 'project-team', leader: '负责人', channel: { mode: 'serial', messageLimit: 500 }, members }
}

function starterRoles(): AgentDefinitionDraft[] {
  const role = (id: string, name: string, description: string, system: string, title: string, personality: string): AgentDefinitionDraft => ({
    id, scope: 'project', name, description, inheritSystem: true, system,
    profile: { identity: { title }, personality, communication: { language: 'auto', tone: 'professional', verbosity: 'balanced' }, constraints: [], preferences: [] }
  })
  return [
    role('team-lead', 'team-lead', 'Plans work, coordinates the team, and requests user review.', 'Lead the team. Clarify acceptance criteria, delegate explicitly, reconcile results, and request user review only when the task is ready.', 'Technical lead', 'Calm, decisive, and attentive to dependencies.'),
    role('team-implementer', 'team-implementer', 'Implements scoped changes and verifies them.', 'Implement assigned work using the project\'s established patterns. Report changed files, validation results, and any remaining risks.', 'Implementation engineer', 'Pragmatic, focused, and evidence-driven.'),
    role('team-reviewer', 'team-reviewer', 'Reviews behavior, regressions, and missing validation.', 'Review the work independently. Lead with concrete defects and risks, cite evidence, and do not claim success without verification.', 'Quality reviewer', 'Skeptical, precise, and concise.')
  ]
}
function activityToThoughts(activity: TeamActivity): ThoughtChainItemType[] {
  return activity.map((item) => ({ key: item.id, title: item.kind, description: item.summary, status: item.status === 'answered' ? 'success' : item.status === 'dropped' ? 'error' : 'loading' }))
}
function editableDefinition(value: TeamSnapshot['definition'] | undefined): TeamDefinition | null {
  if (!value || typeof value !== 'object' || !('members' in value) || !Array.isArray(value.members)) return null
  if (value.schemaVersion === 2) return value as TeamDefinition
  if (value.schemaVersion !== 1) return null
  const legacy = value as typeof value & { name: string; members: Array<Record<string, unknown>> }
  return {
    ...legacy,
    schemaVersion: 2,
    teamId: `team-${stableSlug(legacy.name)}`,
    members: legacy.members.map((member, index) => ({
      ...member,
      memberId: `member-${stableSlug(String(member.name ?? `member-${index + 1}`))}-${index + 1}`,
      name: String(member.name ?? `member-${index + 1}`),
      agent: String(member.agent ?? ''),
      profile: { constraints: [], preferences: [] }
    }))
  } as TeamDefinition
}

function newMember(name: string, agent: string, index: number, preset?: { title?: string; personality?: string; tone?: string; preferences?: string[] }, taken: string[] = []): TeamDefinition['members'][number] {
  return {
    memberId: `member-${stableSlug(name)}-${index + 1}`, name, agent, avatar: randomMemberAvatar(taken),
    profile: {
      identity: preset?.title ? { title: preset.title } : undefined,
      personality: preset?.personality,
      communication: { language: 'auto', tone: preset?.tone, verbosity: 'balanced' },
      constraints: [], preferences: preset?.preferences ?? []
    }
  }
}

function memberAvatars(members: TeamDefinition['members']): string[] {
  return members.flatMap((member) => member.avatar ? [member.avatar] : [])
}

function randomMemberAvatar(taken: string[]): string {
  const choices = availableGeometricAvatarIds(taken)
  return choices[Math.floor(Math.random() * choices.length)] ?? choices[0]
}

function stableSlug(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'default'
}

function splitLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('无法读取头像文件'))
    reader.onload = () => {
      const value = String(reader.result ?? '')
      const comma = value.indexOf(',')
      if (comma < 0) reject(new Error('头像文件编码失败'))
      else resolve(value.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

function profileConstraintInstruction(kind: 'noNetwork' | 'noShell' | 'readOnly' | 'reviewOnly'): string {
  return {
    noNetwork: 'Do not use WebFetch, WebSearch, remote MCP tools, or Shell commands that access the network. Stop and explain if the task requires network access.',
    noShell: 'Do not invoke Shell commands. Stop and explain if the task requires Shell access.',
    readOnly: 'Only inspect data and files. Do not make changes.',
    reviewOnly: 'Review the work and report findings. Do not implement changes.'
  }[kind]
}
function projectLabel(path?: string): string {
  if (!path) return '未知项目'
  const parts = path.split(/[\\/]/)
  const bingo = parts.lastIndexOf('.bingo')
  return bingo > 0 ? parts[bingo - 1] : parts.at(-2) ?? '项目'
}
function sectionKicker(state: TeamState): string {
  return state.section === 'lobby' ? '固定团队大厅' : state.section === 'tasks' ? '任务群聊' : state.section === 'roles' ? '角色库' : 'Team 房间'
}
