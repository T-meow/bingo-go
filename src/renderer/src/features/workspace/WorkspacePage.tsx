import { useMemo, useState } from 'react'
import { Avatar, Button, Empty, Input, Modal, Popconfirm, Space, Table, Tabs, Tag, Tooltip } from 'antd'
import {
  ArrowRightOutlined,
  FormOutlined,
  MessageOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  StopOutlined,
  TeamOutlined
} from '@ant-design/icons'
import type { AgentResource, DeliveryResource, RoomResource, TaskResource } from '../../../../shared/contracts/appServer'
import { IdentityAvatar } from '../../components/IdentityAvatar'
import type { AppStore } from '../../store/appStore'

export type WorkspaceCallbacks = {
  onOpenRoom: (room: RoomResource) => void
  onOpenAgent: (agent: AgentResource) => void
  onMessageAgent: (agent: AgentResource) => void
  onJoinRoom: (room: RoomResource) => void
  onLeaveRoom: (room: RoomResource) => void
  onStartTeam: () => void
  onStopTeam: () => void
  onStopAgent: (agent: AgentResource) => void
  onAssign: (agent: AgentResource, task: string) => void
}

export function WorkspacePage({ state, callbacks }: { state: AppStore; callbacks: WorkspaceCallbacks }): React.JSX.Element {
  const summary = useMemo(() => ({
    running: state.agents.active.filter((agent) => agent.state === 'running').length,
    attention: state.agents.active.reduce((count, agent) => count + agent.pending + agent.unacked, 0),
    activeTasks: state.tasks.active.filter((task) => task.status === 'inProgress').length,
    unread: state.rooms.active.reduce((count, room) => count + room.unread, 0)
  }), [state.agents.active, state.rooms.active, state.tasks.active])

  return (
    <main className="workspace-page-v2" data-testid="workspace-page-v2">
      <header className="workspace-header-v2">
        <div>
          <span>TEAM WORKSPACE</span>
          <h1>团队工作台</h1>
          <small title={state.session?.cwd}>{state.session?.title ?? state.session?.cwd ?? '当前会话'}</small>
        </div>
        <Space className="workspace-primary-actions-v2">
          <Button type="primary" icon={<PlayCircleOutlined />} disabled={!state.capabilities?.teams} onClick={callbacks.onStartTeam}>启动 Team</Button>
          <Popconfirm title="停止整个 Team？" description="所有运行中的成员都会停止。" okText="停止" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={callbacks.onStopTeam}>
            <Button danger icon={<StopOutlined />} disabled={!state.capabilities?.teams}>停止 Team</Button>
          </Popconfirm>
        </Space>
      </header>

      <section className="workspace-summary-v2" aria-label="团队状态摘要">
        <SummaryMetric label="成员" value={state.agents.active.length} detail={`${summary.running} 个运行中`} />
        <SummaryMetric label="待处理" value={summary.attention} detail="Pending 与 Unacked" tone={summary.attention > 0 ? 'warning' : undefined} />
        <SummaryMetric label="进行中任务" value={summary.activeTasks} detail={`共 ${state.tasks.active.length} 个任务`} />
        <SummaryMetric label="房间未读" value={summary.unread} detail={`${state.rooms.active.length} 个房间`} tone={summary.unread > 0 ? 'info' : undefined} />
      </section>

      <Tabs
        className="workspace-tabs-v2"
        items={[
          { key: 'roster', label: `成员 ${state.agents.active.length}`, children: <RosterView agents={state.agents.active} callbacks={callbacks} /> },
          { key: 'rooms', label: `房间 ${state.rooms.active.length}`, children: <RoomsView rooms={state.rooms.active} callbacks={callbacks} /> },
          { key: 'tasks', label: `任务 ${state.tasks.active.length}`, children: <TasksView tasks={state.tasks.active} /> },
          { key: 'deliveries', label: `投递 ${state.deliveries.active.length}`, children: <DeliveriesView deliveries={state.deliveries.active} /> }
        ]}
      />
    </main>
  )
}

function SummaryMetric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: 'info' | 'warning' }): React.JSX.Element {
  return <div className={`workspace-summary-item-v2${tone ? ` is-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function RosterView({ agents, callbacks }: { agents: AgentResource[]; callbacks: WorkspaceCallbacks }): React.JSX.Element {
  const [assigning, setAssigning] = useState<AgentResource | null>(null)
  const [task, setTask] = useState('')
  const columns = [
    {
      title: '成员', key: 'member', width: 190,
      render: (_: unknown, agent: AgentResource) => <div className="resource-identity-v2"><IdentityAvatar identity={agent.name} size={34} /><span><strong>{agent.name}</strong><small>{agent.description || agent.kind}</small></span></div>
    },
    { title: '状态', dataIndex: 'state', key: 'state', width: 96, filters: ['running', 'idle', 'stopped'].map((value) => ({ text: agentStateLabel(value as AgentResource['state']), value })), onFilter: (value: boolean | React.Key, agent: AgentResource) => agent.state === value, render: (state: AgentResource['state']) => <Tag color={state === 'running' ? 'processing' : state === 'idle' ? 'success' : 'default'}>{agentStateLabel(state)}</Tag> },
    { title: '当前任务', key: 'task', ellipsis: true, responsive: ['md' as const], render: (_: unknown, agent: AgentResource) => agent.prompt || '等待任务' },
    { title: '运行配置', key: 'engine', width: 190, responsive: ['lg' as const], render: (_: unknown, agent: AgentResource) => <span className="resource-engine-v2"><strong>{agent.model}</strong><small>{agent.provider} · {agent.thinking}</small></span> },
    { title: '最近活动', key: 'activity', ellipsis: true, responsive: ['xl' as const], render: (_: unknown, agent: AgentResource) => agent.recentActivity.at(-1) ?? '暂无活动' },
    { title: '待处理', key: 'pending', width: 86, align: 'right' as const, render: (_: unknown, agent: AgentResource) => agent.pending + agent.unacked },
    {
      title: '', key: 'actions', width: 146, fixed: 'right' as const,
      render: (_: unknown, agent: AgentResource) => <Space size={2} className="resource-actions-v2">
        <Tooltip title="发消息"><Button type="text" icon={<MessageOutlined />} aria-label={`给 ${agent.name} 发消息`} onClick={() => callbacks.onMessageAgent(agent)} /></Tooltip>
        <Tooltip title="打开会话"><Button type="text" icon={<ArrowRightOutlined />} aria-label={`打开 ${agent.name} 会话`} onClick={() => callbacks.onOpenAgent(agent)} /></Tooltip>
        <Tooltip title="分配任务"><Button type="text" icon={<FormOutlined />} aria-label={`给 ${agent.name} 分配任务`} onClick={() => { setTask(''); setAssigning(agent) }} /></Tooltip>
        <Popconfirm title={`停止 ${agent.name}？`} okText="停止" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => callbacks.onStopAgent(agent)}><Tooltip title="停止成员"><Button type="text" danger icon={<PauseOutlined />} aria-label={`停止 ${agent.name}`} /></Tooltip></Popconfirm>
      </Space>
    }
  ]
  return <>
    <Table<AgentResource> className="resource-table-v2" rowKey="id" size="middle" pagination={false} dataSource={agents} columns={columns} scroll={{ x: 900 }} locale={{ emptyText: <ResourceEmpty icon={<TeamOutlined />} text="Team 尚未启动或没有成员" /> }} />
    <Modal
      open={Boolean(assigning)}
      title={`给 ${assigning?.name ?? ''} 分配任务`}
      okText="分配"
      cancelText="取消"
      okButtonProps={{ disabled: !task.trim() }}
      onCancel={() => setAssigning(null)}
      onOk={() => {
        if (!assigning || !task.trim()) return
        callbacks.onAssign(assigning, task.trim())
        setAssigning(null)
      }}
    >
      <Input.TextArea autoFocus rows={5} value={task} placeholder="描述要完成的工作" onChange={(event) => setTask(event.target.value)} />
    </Modal>
  </>
}

function RoomsView({ rooms, callbacks }: { rooms: RoomResource[]; callbacks: WorkspaceCallbacks }): React.JSX.Element {
  const columns = [
    { title: '房间', key: 'room', width: 190, render: (_: unknown, room: RoomResource) => <span className="room-name-v2"><strong>#{room.name}</strong><small>{room.topic || '未设置主题'}</small></span> },
    { title: '模式', dataIndex: 'mode', key: 'mode', width: 96, render: (mode: RoomResource['mode']) => <Tag>{mode === 'broadcast' ? '广播' : '中继'}</Tag> },
    { title: '成员', key: 'members', width: 180, responsive: ['md' as const], render: (_: unknown, room: RoomResource) => <Avatar.Group max={{ count: 4 }} size="small">{room.members.map((member) => <IdentityAvatar key={member} identity={member} size={26} />)}</Avatar.Group> },
    { title: '消息', key: 'messages', width: 110, responsive: ['lg' as const], render: (_: unknown, room: RoomResource) => `${room.messageCount} · #${room.lastSeq}` },
    { title: '提醒', key: 'attention', width: 108, render: (_: unknown, room: RoomResource) => <Space size={4}>{room.unread > 0 && <Tag color="blue">未读 {room.unread}</Tag>}{room.mentions > 0 && <Tag color="warning">@{room.mentions}</Tag>}{room.unread === 0 && room.mentions === 0 && <span>—</span>}</Space> },
    {
      title: '', key: 'actions', width: 112, fixed: 'right' as const,
      render: (_: unknown, room: RoomResource) => <Space size={2} className="resource-actions-v2">
        <Tooltip title="打开房间"><Button type="text" icon={<ArrowRightOutlined />} aria-label={`打开 ${room.name} 房间`} onClick={() => callbacks.onOpenRoom(room)} /></Tooltip>
        <Tooltip title={room.userIsMember ? '离开房间' : '加入房间'}><Button type="text" danger={room.userIsMember} icon={room.userIsMember ? <StopOutlined /> : <PlayCircleOutlined />} aria-label={room.userIsMember ? `离开 ${room.name}` : `加入 ${room.name}`} onClick={() => room.userIsMember ? callbacks.onLeaveRoom(room) : callbacks.onJoinRoom(room)} /></Tooltip>
      </Space>
    }
  ]
  return <Table<RoomResource> className="resource-table-v2" rowKey="id" size="middle" pagination={false} dataSource={rooms} columns={columns} scroll={{ x: 760 }} locale={{ emptyText: <ResourceEmpty text="蓝图没有声明房间" /> }} />
}

function TasksView({ tasks }: { tasks: TaskResource[] }): React.JSX.Element {
  return <Table<TaskResource> className="resource-table-v2" size="middle" rowKey="id" pagination={false} dataSource={tasks} scroll={{ x: 720 }} locale={{ emptyText: <ResourceEmpty text="没有持久任务" /> }} columns={[
    { title: '任务', key: 'subject', render: (_: unknown, task) => <span className="task-subject-v2"><strong>{task.subject}</strong><small>{task.description || task.activeForm || '无补充说明'}</small></span> },
    { title: '状态', dataIndex: 'status', width: 110, filters: ['pending', 'inProgress', 'completed', 'cancelled'].map((value) => ({ text: taskStateLabel(value as TaskResource['status']), value })), onFilter: (value, task) => task.status === value, render: (status: TaskResource['status']) => <Tag color={status === 'inProgress' ? 'processing' : status === 'completed' ? 'success' : status === 'cancelled' ? 'error' : 'default'}>{taskStateLabel(status)}</Tag> },
    { title: '负责人', dataIndex: 'owner', width: 140, render: (value) => value ?? '未分配' },
    { title: '依赖', key: 'dependencies', width: 150, responsive: ['md'], render: (_: unknown, task) => task.blockedBy.length > 0 ? `等待 ${task.blockedBy.length} 项` : task.blocks.length > 0 ? `阻塞 ${task.blocks.length} 项` : '—' }
  ]} />
}

function DeliveriesView({ deliveries }: { deliveries: DeliveryResource[] }): React.JSX.Element {
  return <Table<DeliveryResource> className="resource-table-v2" size="middle" rowKey="id" pagination={false} dataSource={deliveries} scroll={{ x: 700 }} locale={{ emptyText: <ResourceEmpty text="没有待处理投递" /> }} columns={[
    { title: '投递', key: 'route', render: (_: unknown, delivery) => <span className="delivery-route-v2"><strong>{delivery.from} → {delivery.to}</strong><small>{delivery.reason || (delivery.private ? '私密投递' : '团队投递')}</small></span> },
    { title: '状态', dataIndex: 'state', width: 110, filters: ['queued', 'delivered', 'read', 'answered', 'dropped'].map((value) => ({ text: deliveryStateLabel(value as DeliveryResource['state']), value })), onFilter: (value, delivery) => delivery.state === value, render: (state: DeliveryResource['state']) => <Tag color={state === 'answered' ? 'success' : state === 'dropped' ? 'error' : state === 'read' ? 'cyan' : state === 'delivered' ? 'blue' : 'default'}>{deliveryStateLabel(state)}</Tag> },
    { title: '跟进', key: 'followups', width: 110, render: (_: unknown, delivery) => `${delivery.followUps}/${delivery.maxFollowUps}` },
    { title: '更新时间', dataIndex: 'updatedAt', width: 170, responsive: ['md'], render: (value: number) => new Date(value).toLocaleString('zh-CN') }
  ]} />
}

function ResourceEmpty({ icon, text }: { icon?: React.ReactNode; text: string }): React.JSX.Element {
  return <Empty className="resource-empty-v2" image={icon ?? Empty.PRESENTED_IMAGE_SIMPLE} description={text} />
}

function agentStateLabel(state: AgentResource['state']): string { return state === 'running' ? '运行中' : state === 'idle' ? '待命' : '已停止' }
function taskStateLabel(state: TaskResource['status']): string { return state === 'inProgress' ? '进行中' : state === 'completed' ? '已完成' : state === 'cancelled' ? '已取消' : '待处理' }
function deliveryStateLabel(state: DeliveryResource['state']): string { return state === 'delivered' ? '已送达' : state === 'read' ? '已读' : state === 'answered' ? '已回复' : state === 'dropped' ? '已丢弃' : '队列中' }
