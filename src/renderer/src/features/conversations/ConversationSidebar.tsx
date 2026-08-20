import { useMemo, useState } from 'react'
import { Badge, Button, Input, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ConversationSummary } from '../../../../shared/contracts/appServer'
import { conversationKey, keyId, selectConversationByKey, type ConversationKey } from '../../store/appStore'

export type ConversationGroup = { key: string; label: string; conversations: ConversationSummary[] }

export function ConversationSidebar({ conversations, activeId, onSelect, onCreate, onSearch }: {
  conversations: ConversationSummary[]
  activeId: string | null
  onSelect: (conversation: ConversationSummary) => void
  onCreate?: () => void
  onSearch?: (query: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => groupConversations(conversations, query), [conversations, query])
  return (
    <div className="conversation-sidebar-v2" data-testid="conversation-sidebar-v2">
      <header>
        <strong>会话</strong>
        {onCreate && <Button type="text" size="small" icon={<PlusOutlined />} aria-label="新建对话" onClick={onCreate} />}
      </header>
      <Input.Search allowClear size="small" placeholder="搜索会话" value={query} onChange={(event) => { setQuery(event.target.value); onSearch?.(event.target.value) }} />
      <div className="conversation-groups-v2">
        {groups.map((group) => (
          <section key={group.key}>
            <h3>{group.label}</h3>
            {group.conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={`conversation-row-v2${conversation.id === activeId ? ' active' : ''}`}
                onClick={() => onSelect(conversation)}
              >
                <span className="conversation-title-v2">{conversation.title}</span>
                <span className="conversation-meta-v2">
                  {conversation.runState !== 'idle' && <Tag>{conversation.runState}</Tag>}
                  {conversation.mentions > 0 && <Badge count={conversation.mentions} size="small" />}
                  {conversation.unread > 0 && <Badge color="blue" count={conversation.unread} size="small" />}
                  {conversation.queueCount > 0 && <Badge status="processing" text={String(conversation.queueCount)} />}
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

export function groupConversations(conversations: ConversationSummary[], query = ''): ConversationGroup[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  const visible = conversations.filter((conversation) => !normalized || conversation.title.toLocaleLowerCase('zh-CN').includes(normalized))
  const groups: Array<{ key: string; label: string; kind: 'main' | 'agent' | 'room'; conversations: ConversationSummary[] }> = [
    { key: 'main', label: 'Main', kind: 'main', conversations: [] },
    { key: 'agents', label: 'Agents', kind: 'agent', conversations: [] },
    { key: 'rooms', label: 'Rooms', kind: 'room', conversations: [] }
  ]
  for (const conversation of visible) {
    const key: ConversationKey = conversationKey(conversation.kind)
    groups.find((group) => group.kind === key.kind)?.conversations.push(conversation)
  }
  for (const group of groups) group.conversations.sort((left, right) => (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0))
  return groups
}

export { keyId }
