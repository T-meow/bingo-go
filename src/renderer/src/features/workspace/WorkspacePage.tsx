import { Badge, Button, Card, Descriptions, Empty, Masonry, Space, Table, Tabs, Tag, Timeline } from 'antd'
import { PauseOutlined, PlayCircleOutlined, SendOutlined, StopOutlined } from '@ant-design/icons'
import type { AgentResource, DeliveryResource, RoomResource, TaskResource } from '../../../../shared/contracts/appServer'
import type { AppStore } from '../../store/appStore'

export type WorkspaceCallbacks = {
  onOpenRoom: (room: RoomResource) => void
  onOpenAgent: (agent: AgentResource) => void
  onMessageAgent: (agent: AgentResource) => void
  onJoinRoom: (room: RoomResource) => void
  onLeaveRoom: (room: RoomResource) => void
  onStartTeam: () => void
  onStopTeam: () => void
  onAssign: (agent: AgentResource, task: string) => void
}

export function WorkspacePage({ state, callbacks }: { state: AppStore; callbacks: WorkspaceCallbacks }): React.JSX.Element {
  return (
    <main className="workspace-page-v2">
      <header className="workspace-header-v2">
        <div>
          <h1>团队工作台</h1>
          <span>{state.session?.title ?? state.session?.cwd ?? ''}</span>
        </div>
        <Space>
          <Button icon={<PlayCircleOutlined />} disabled={!state.capabilities?.teams} onClick={callbacks.onStartTeam}>启动 Team</Button>
          <Button icon={<StopOutlined />} disabled={!state.capabilities?.teams} onClick={callbacks.onStopTeam}>停止 Team</Button>
        </Space>
      </header>
      <Tabs
        items={[
          {
            key: 'roster', label: `成员 ${state.agents.active.length}`,
            children: <RosterView agents={state.agents.active} callbacks={callbacks} />
          },
          {
            key: 'rooms', label: `房间 ${state.rooms.active.length}`,
            children: <RoomsView rooms={state.rooms.active} callbacks={callbacks} />
          },
          {
            key: 'tasks', label: `任务 ${state.tasks.active.length}`,
            children: <TasksView tasks={state.tasks.active} />
          },
          {
            key: 'deliveries', label: `投递 ${state.deliveries.active.length}`,
            children: <DeliveriesView deliveries={state.deliveries.active} />
          }
        ]}
      />
    </main>
  )
}

function RosterView({ agents, callbacks }: { agents: AgentResource[]; callbacks: WorkspaceCallbacks }): React.JSX.Element {
  if (agents.length === 0) return <Empty description="Team 尚未启动或没有成员" />
  return (
    <Masonry columns={{ md: 3, sm: 2, xs: 1 }}>
      {agents.map((agent) => (
        <Card key={agent.id} size="small" title={<Space><Badge status={agent.state === 'running' ? 'processing' : agent.state === 'idle' ? 'success' : 'default'} /><span>{agent.name}</span><Tag>{agent.kind}</Tag></Space>}
          actions={[
            <SendOutlined key="send" aria-label={`给 ${agent.name} 发消息`} onClick={() => callbacks.onMessageAgent(agent)} />,
            <PlayCircleOutlined key="open" aria-label={`打开 ${agent.name} 会话`} onClick={() => callbacks.onOpenAgent(agent)} />,
            <PauseOutlined key="stop" aria-label={`停止 ${agent.name}`} onClick={() => callbacks.onAssign(agent, '')} />
          ]}>
          <Descriptions size="small" column={1} items={[
            { key: 'task', label: 'Task', children: agent.prompt || agent.description },
            { key: 'engine', label: 'Engine', children: `${agent.provider}/${agent.model} · ${agent.thinking}` },
            { key: 'pending', label: 'Pending/Unacked', children: `${agent.pending}/${agent.unacked}` }
          ]} />
          {agent.recentActivity.length > 0 && <Timeline items={agent.recentActivity.slice(-3).map((activity, index) => ({ key: index, children: activity }))} />}
        </Card>
      ))}
    </Masonry>
  )
}

function RoomsView({ rooms, callbacks }: { rooms: RoomResource[]; callbacks: WorkspaceCallbacks }): React.JSX.Element {
  if (rooms.length === 0) return <Empty description="蓝图没有声明房间" />
  return (
    <Masonry columns={{ md: 3, sm: 2, xs: 1 }}>
      {rooms.map((room) => (
        <Card key={room.id} size="small" title={<Space><span>#{room.name}</span><Tag>{room.mode}</Tag>{room.unread > 0 && <Badge count={room.unread} />}{room.mentions > 0 && <Tag color="red">@{room.mentions}</Tag>}</Space>}
          actions={[
            <span key="open" aria-label={`打开 ${room.name} 房间`} onClick={() => callbacks.onOpenRoom(room)}>打开</span>,
            <span key="join" aria-label={room.userIsMember ? `离开 ${room.name}` : `加入 ${room.name}`} onClick={() => room.userIsMember ? callbacks.onLeaveRoom(room) : callbacks.onJoinRoom(room)}>{room.userIsMember ? '离开' : '加入'}</span>
          ]}>
          <Descriptions size="small" column={1} items={[
            { key: 'members', label: 'Members', children: room.members.join(', ') },
            { key: 'messages', label: 'Messages', children: `${room.messageCount} · seq ${room.lastSeq}` }
          ]} />
        </Card>
      ))}
    </Masonry>
  )
}

function TasksView({ tasks }: { tasks: TaskResource[] }): React.JSX.Element {
  if (tasks.length === 0) return <Empty description="没有持久任务" />
  return <Table size="small" rowKey="id" dataSource={tasks} columns={[
    { title: 'Subject', dataIndex: 'subject' },
    { title: 'Status', dataIndex: 'status', render: (status) => <Tag>{status}</Tag> },
    { title: 'Owner', dataIndex: 'owner', render: (value) => value ?? '—' },
    { title: 'Blocks', dataIndex: 'blocks', render: (value: string[]) => value.length || '—' }
  ]} />
}

function DeliveriesView({ deliveries }: { deliveries: DeliveryResource[] }): React.JSX.Element {
  if (deliveries.length === 0) return <Empty description="没有待处理投递" />
  return <Timeline items={deliveries.map((delivery) => ({
    key: delivery.id,
    color: delivery.state === 'answered' ? 'green' : delivery.state === 'dropped' ? 'red' : 'blue',
    children: <span>{delivery.from} → {delivery.to} <Tag>{delivery.state}</Tag>{delivery.reason && <small> · {delivery.reason}</small>}</span>
  }))} />
}
