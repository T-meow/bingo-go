import { useMemo, useState } from 'react'
import { Badge, Button, Input, Select, Tooltip } from 'antd'
import { CrownOutlined, NumberOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons'
import type { ConversationSummary, SessionListEntry, SessionLocator } from '../../../../shared/contracts/appServer'
import { conversationKey, keyId, type ConversationKey } from '../../store/appStore'

export type ConversationGroup = { key: string; label: string; conversations: ConversationSummary[] }

export function ConversationSidebar({ conversations, activeId, sessions = [], currentLocator, onSelect, onCreate, onResume, onSearch }: {
  conversations: ConversationSummary[]
  activeId: string | null
  sessions?: SessionListEntry[]
  currentLocator?: SessionLocator | null
  onSelect: (conversation: ConversationSummary) => void
  onCreate?: () => void
  onResume?: (session: SessionListEntry) => void
  onSearch?: (query: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => groupConversations(conversations, query), [conversations, query])
  return (
    <div className="conversation-sidebar-v2" data-testid="conversation-sidebar-v2">
      <header className="conversation-sidebar-header-v2">
        <div>
          <span>BINGO GO</span>
          <strong>任务会话</strong>
        </div>
        {onCreate && <Tooltip title="新建任务"><Button type="text" icon={<PlusOutlined />} aria-label="新建任务" onClick={onCreate} /></Tooltip>}
      </header>
      {onResume && sessions.length > 0 && <label className="session-switcher-v2">
        <span>当前任务</span>
        <Select
          showSearch
          aria-label="切换历史任务"
          value={currentLocator ? locatorKey(currentLocator) : undefined}
          options={sessions.map((session) => ({ value: locatorKey(session.locator), label: session.title }))}
          optionFilterProp="label"
          onChange={(value) => {
            const session = sessions.find((item) => locatorKey(item.locator) === value)
            if (session) onResume(session)
          }}
        />
      </label>}
      <Input.Search className="conversation-search-v2" allowClear placeholder="搜索任务或 Agent" value={query} onChange={(event) => { setQuery(event.target.value); onSearch?.(event.target.value) }} />
      <div className="conversation-groups-v2">
        {groups.map((group) => (
          <section key={group.key}>
            <h3><span>{group.label}</span><small>{group.conversations.length}</small></h3>
            {group.conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={`conversation-row-v2${conversation.id === activeId ? ' active' : ''}`}
                onClick={() => onSelect(conversation)}
              >
                <span className="conversation-kind-icon-v2">
                  {conversationIcon(conversation)}
                  <i className={`conversation-state-dot-v2 is-${conversation.runState}`} />
                </span>
                <span className="conversation-copy-v2">
                  <span className="conversation-title-v2">{conversation.title}</span>
                  <small>{conversationSubtitle(conversation)}</small>
                </span>
                <span className="conversation-meta-v2">
                  {conversation.pendingInteractions > 0 && <Badge className="conversation-attention-v2" count={conversation.pendingInteractions} size="small" />}
                  {conversation.mentions > 0 && <Badge className="conversation-mention-v2" count={`@${conversation.mentions}`} />}
                  {conversation.unread > 0 && <Badge color="var(--rei-accent)" count={conversation.unread} size="small" />}
                  {conversation.queueCount > 0 && <span className="conversation-queue-v2">+{conversation.queueCount}</span>}
                </span>
              </button>
            ))}
            {group.conversations.length === 0 && <small className="conversation-empty-v2">暂无会话</small>}
          </section>
        ))}
      </div>
    </div>
  )
}

function locatorKey(locator: SessionLocator): string {
  if (locator.type === 'latest') return 'latest'
  if (locator.type === 'stem') return `stem:${locator.stem}`
  return `path:${locator.path}`
}

export function groupConversations(conversations: ConversationSummary[], query = ''): ConversationGroup[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  const visible = conversations.filter((conversation) => !normalized || conversation.title.toLocaleLowerCase('zh-CN').includes(normalized))
  const groups: Array<{ key: string; label: string; kind: 'main' | 'agent' | 'room'; conversations: ConversationSummary[] }> = [
    { key: 'main', label: '主任务', kind: 'main', conversations: [] },
    { key: 'agents', label: '子 Agent', kind: 'agent', conversations: [] },
    { key: 'rooms', label: '协作房间', kind: 'room', conversations: [] }
  ]
  for (const conversation of visible) {
    const key: ConversationKey = conversationKey(conversation.kind)
    groups.find((group) => group.kind === key.kind)?.conversations.push(conversation)
  }
  for (const group of groups) group.conversations.sort((left, right) => (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0))
  return groups
}

function conversationIcon(conversation: ConversationSummary): React.ReactNode {
  if (conversation.kind.type === 'main') return <CrownOutlined />
  if (conversation.kind.type === 'agent') return <RobotOutlined />
  return <NumberOutlined />
}

function conversationSubtitle(conversation: ConversationSummary): string {
  const activity = formatActivity(conversation.lastActivityAt)
  if (conversation.runState === 'running') return activity ? `执行中 · ${activity}` : '执行中'
  if (conversation.runState === 'stopped') return activity ? `已停止 · ${activity}` : '已停止'
  if (conversation.kind.type === 'room') return activity ? `房间 · ${activity}` : '协作房间'
  if (conversation.kind.type === 'agent') return activity ? `Agent · ${activity}` : '子 Agent'
  return activity || '主 Agent'
}

function formatActivity(timestamp?: number | null): string {
  if (!timestamp) return ''
  const elapsed = Math.max(0, Date.now() - timestamp)
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`
  return `${Math.floor(elapsed / 86_400_000)} 天前`
}

export { keyId }
