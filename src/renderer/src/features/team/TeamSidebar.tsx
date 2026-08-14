import { Conversations } from '@ant-design/x'
import { CommentOutlined, NumberOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Empty, Segmented, Skeleton, Tag, Tooltip } from 'antd'
import type { TeamDefinition, TeamSnapshot, TeamTaskStatus } from '../../../../shared/contracts/cli'
import type { TeamSection, TeamSelection, TeamState } from '../../state/teamReducer'
import { IdentityAvatar } from '../../components/IdentityAvatar'

export type { TeamSelection } from '../../state/teamReducer'

export function TeamSidebar({ state, teamV2Capability, onSectionChange, onSelect, onCreate }: {
  state: TeamState
  teamV2Capability: boolean
  onSectionChange: (section: TeamSection) => void
  onSelect: (selection: TeamSelection) => void
  onCreate: () => void
}): React.JSX.Element {
  const snapshot = state.snapshot
  if (!snapshot) return <div className="sidebar-content"><header className="sidebar-title"><div><span>协作</span><strong>Team</strong></div></header><Skeleton className="sidebar-skeleton" active paragraph={{ rows: 6 }} title={false} /></div>

  const items = state.section === 'lobby'
    ? lobbyItems(state)
    : state.section === 'tasks'
    ? state.tasks.map((task) => ({
      key: `task:${task.id}`,
      group: taskGroup(task.status),
      icon: (() => { const leader = task.participants.find((member) => member.name === task.leader) ?? task.participants[0]; return leader ? <IdentityAvatar identity={leader.name} avatar={leader.avatar} size={24} /> : <span className={`team-task-dot ${task.status}`} /> })(),
      label: <span className="team-nav-label"><strong>{task.title}</strong><small>{statusLabel(task.status)} · {task.participants.length} 人 · {formatUpdated(task.updatedAt)}</small></span>
    }))
    : state.section === 'roles'
      ? state.definitions.map((definition) => ({
        key: `role:${definition.source}:${definition.id}`,
        group: definition.source === 'project' ? '项目角色' : '用户角色',
        icon: <UserOutlined />,
        label: <span className="team-nav-label"><strong>{definition.name}</strong><small>{definition.id}{definition.overridden ? ' · 已被覆盖' : ''}</small></span>
      }))
      : roomItems(state)
  const activeKey = selectionKey(state.selection)
  const empty = state.section === 'lobby' ? '团队大厅尚未就绪' : state.section === 'tasks' ? '还没有团队任务' : state.section === 'roles' ? '还没有角色定义' : '尚无频道或成员'

  return <div className="sidebar-content team-sidebar">
    <header className="sidebar-title">
      <div><span>协作</span><strong>{isTeamDefinition(snapshot.definition) ? snapshot.definition.name : 'Team'}</strong></div>
      <Tooltip title={state.section === 'tasks' ? '新建任务' : state.section === 'roles' ? '新建角色' : '编辑蓝图'}>
        <Button type="text" icon={<PlusOutlined />} aria-label={state.section === 'tasks' ? '新建任务' : state.section === 'roles' ? '新建角色' : '编辑蓝图'} disabled={!teamV2Capability} onClick={onCreate} />
      </Tooltip>
    </header>
    <Segmented<TeamSection>
      block
      value={state.section}
      options={[
        { value: 'lobby', label: '大厅', disabled: !teamV2Capability },
        { value: 'tasks', label: '任务', disabled: !teamV2Capability },
        { value: 'rooms', label: '房间' },
        { value: 'roles', label: '角色', disabled: !teamV2Capability }
      ]}
      onChange={onSectionChange}
    />
    <section className="team-nav-section">{items.length
      ? <Conversations rootClassName="team-conversations" activeKey={activeKey} items={items} groupable onActiveChange={(key) => {
        const selection = parseSelection(String(key))
        if (selection) onSelect(selection)
      }} />
      : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />}</section>
    <footer className="sidebar-runtime"><span className={`runtime-dot${snapshot.available ? ' online' : ''}`} /><div><strong>{snapshot.branch}</strong><small>{snapshot.path}</small></div><Tag color={snapshot.validation ? 'error' : 'success'}>{snapshot.validation ? '需修复' : '就绪'}</Tag></footer>
  </div>
}

function roomItems(state: TeamState): Array<{ key: string; group: string; icon: React.ReactNode; label: React.ReactNode }> {
  const channels = (state.snapshot?.channels ?? []).map((channel) => ({
    key: `channel:${channel.name}`,
    group: '频道',
    icon: <NumberOutlined />,
    label: <span className="team-nav-label"><strong>{channel.name}</strong><small>{channel.seq} 条消息</small></span>
  }))
  const members = (state.snapshot?.members ?? []).filter((member) => member.kind !== 'hire').map((member) => ({
    key: `member:${member.name}`,
    group: '成员',
    icon: <span className="team-sidebar-avatar"><IdentityAvatar identity={member.name} avatar={member.avatar} avatarDataUrl={member.avatarDataUrl} size={26} /><i className={`team-member-state ${member.status === 'busy' ? 'running' : member.status === 'standby' ? 'idle' : member.status === 'failed' ? 'stopped' : 'offline'}`} /></span>,
    label: <span className="team-nav-label"><strong>{member.name}</strong><small>{member.agent}</small></span>
  }))
  return [...channels, ...members]
}

function lobbyItems(state: TeamState): Array<{ key: string; group: string; icon: React.ReactNode; label: React.ReactNode }> {
  const lobby = state.lobby ? [{
    key: `lobby:${state.lobby.id}`, group: '团队大厅', icon: <CommentOutlined />,
    label: <span className="team-nav-label"><strong>团队大厅</strong><small>{state.lobby.messages.length} 条消息</small></span>
  }] : []
  const temporary = (state.snapshot?.members ?? []).filter((member) => member.kind === 'hire').map((member) => ({
    key: `member:${member.name}`, group: '临时成员', icon: <span className="team-sidebar-avatar"><IdentityAvatar identity={member.name} avatar={member.avatar} avatarDataUrl={member.avatarDataUrl} size={26} /><i className={`team-member-state ${member.status === 'busy' ? 'running' : 'offline'}`} /></span>,
    label: <span className="team-nav-label"><strong>{member.name}{member.recommended && <Tag color="success">推荐固定</Tag>}</strong><small>{member.agent} · 临时</small></span>
  }))
  return [...lobby, ...temporary]
}

function selectionKey(selection: TeamSelection | null): string | undefined {
  if (!selection) return undefined
  if (selection.kind === 'role') return `role:${selection.scope}:${selection.id}`
  return `${selection.kind}:${selection.id}`
}

function parseSelection(value: string): TeamSelection | null {
  const [kind, ...rest] = value.split(':')
  if ((kind === 'lobby' || kind === 'channel' || kind === 'member' || kind === 'task') && rest.length) return { kind, id: rest.join(':') }
  if (kind === 'role' && (rest[0] === 'project' || rest[0] === 'user') && rest.length > 1) return { kind, scope: rest[0], id: rest.slice(1).join(':') }
  return null
}

function taskGroup(status: TeamTaskStatus): string {
  if (status === 'running' || status === 'pausing') return '进行中'
  if (status === 'awaiting_review') return '待验收'
  if (status === 'paused') return '已暂停'
  return '已完成'
}

function statusLabel(status: TeamTaskStatus): string {
  return { running: '运行中', pausing: '正在暂停', paused: '已暂停', awaiting_review: '待验收', completed: '已完成', cancelled: '已取消' }[status]
}

function formatUpdated(value: number): string {
  return new Date(value * 1_000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function isTeamDefinition(value: TeamSnapshot['definition']): value is TeamDefinition {
  return Boolean(value && value.schemaVersion === 2 && typeof (value as TeamDefinition).name === 'string' && Array.isArray((value as TeamDefinition).members))
}
