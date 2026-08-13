import { Conversations } from '@ant-design/x'
import { NumberOutlined, UserOutlined } from '@ant-design/icons'
import { Badge, Empty, Skeleton, Tag } from 'antd'
import type { TeamDefinition, TeamSnapshot } from '../../../../shared/contracts/cli'

export type TeamSelection = { kind: 'channel' | 'member'; id: string }

export function TeamSidebar({ snapshot, selection, onSelect }: {
  snapshot: TeamSnapshot | null
  selection: TeamSelection | null
  onSelect: (selection: TeamSelection) => void
}): React.JSX.Element {
  if (!snapshot) return <div className="sidebar-content"><header className="sidebar-title"><div><span>协作</span><strong>Team</strong></div></header><Skeleton className="sidebar-skeleton" active paragraph={{ rows: 6 }} title={false} /></div>
  const channelItems = snapshot.channels.map((channel) => ({
    key: `channel:${channel.name}`,
    group: '频道',
    icon: <NumberOutlined />,
    label: <span className="team-nav-label"><strong>{channel.name}</strong><small>{channel.seq} 条消息</small></span>
  }))
  const memberItems = snapshot.members.map((member) => ({
    key: `member:${member.name}`,
    group: '成员',
    icon: <Badge status={member.status === 'busy' ? 'processing' : member.status === 'standby' ? 'success' : member.status === 'failed' ? 'error' : 'default'}><UserOutlined /></Badge>,
    label: <span className="team-nav-label"><strong>{member.name}</strong><small>{member.agent}</small></span>
  }))
  const activeKey = selection ? `${selection.kind}:${selection.id}` : undefined
  const select = (key: React.Key): void => {
    const [kind, ...rest] = String(key).split(':')
    if ((kind === 'channel' || kind === 'member') && rest.length) onSelect({ kind, id: rest.join(':') })
  }
  return <div className="sidebar-content team-sidebar">
    <header className="sidebar-title"><div><span>协作</span><strong>{isTeamDefinition(snapshot.definition) ? snapshot.definition.name : 'Team'}</strong></div><Tag color={snapshot.validation ? 'error' : 'success'}>{snapshot.validation ? '需修复' : '就绪'}</Tag></header>
    <section className="team-nav-section">{channelItems.length || memberItems.length
      ? <Conversations rootClassName="team-conversations" activeKey={activeKey} items={[...channelItems, ...memberItems]} groupable onActiveChange={select} />
      : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无频道或成员" />}</section>
    <footer className="sidebar-runtime"><span className={`runtime-dot${snapshot.available ? ' online' : ''}`} /><div><strong>{snapshot.branch}</strong><small>{snapshot.path}</small></div></footer>
  </div>
}

function isTeamDefinition(value: TeamSnapshot['definition']): value is TeamDefinition {
  return Boolean(value && value.schemaVersion === 1 && typeof value.name === 'string' && Array.isArray(value.members))
}
