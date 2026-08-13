import { useEffect, useRef, useState } from 'react'
import { Conversations } from '@ant-design/x'
import { CheckSquareOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Empty, Input } from 'antd'
import type { GuiError, RuntimeInfo, SessionSummary } from '../../../../shared/contracts/ipc'

export function ConversationSidebar({ sessions, activeSession, runtime, error, busy, onCreate, onOpen, onRename, onDelete, onDeleteMany }: {
  sessions: SessionSummary[]
  activeSession: SessionSummary | null
  runtime: RuntimeInfo | null
  error: GuiError | null
  busy: boolean
  onCreate: () => void
  onOpen: (session: SessionSummary) => void
  onRename: (session: SessionSummary, name: string) => Promise<boolean>
  onDelete: (session: SessionSummary) => void
  onDeleteMany: (sessions: SessionSummary[]) => void
}): React.JSX.Element {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const renamePending = useRef(false)
  const skipRenameCommit = useRef(false)
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleSessions = normalizedQuery
    ? sessions.filter((session) => `${session.name}\n${session.preview}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
    : sessions
  useEffect(() => {
    const available = new Set(sessions.map((session) => session.id))
    setSelected((current) => new Set([...current].filter((id) => available.has(id))))
  }, [sessions])
  const toggle = (id: string): void => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const selectedSessions = sessions.filter((session) => selected.has(session.id))
  const allSelected = visibleSessions.length > 0 && visibleSessions.every((session) => selected.has(session.id))
  const startRename = (session: SessionSummary): void => {
    skipRenameCommit.current = false
    setEditingId(session.id)
    setEditingName(session.name)
  }
  const commitRename = async (): Promise<void> => {
    if (skipRenameCommit.current) { skipRenameCommit.current = false; return }
    const session = editingId ? byId.get(editingId) : undefined
    const name = editingName.trim()
    if (!session || !name || renamePending.current) return
    if (name === session.name) { setEditingId(null); return }
    renamePending.current = true
    const renamed = await onRename(session, name)
    renamePending.current = false
    if (renamed) setEditingId(null)
  }

  return (
    <div className="sidebar-content">
      <header className="sidebar-title"><div><span title={runtime?.workspacePath}>{runtime ? `工作区 · ${workspaceName(runtime.workspacePath)}` : '工作区'}</span><strong>对话</strong></div><div className="sidebar-title-actions"><small>{sessions.length}</small>{sessions.length > 0 && <Button type="text" size="small" icon={<CheckSquareOutlined />} disabled={busy} onClick={() => { setSelectionMode((current) => !current); setSelected(new Set()) }}>{selectionMode ? '完成' : '管理'}</Button>}</div></header>
      {error && <Alert type="error" showIcon message={error.msg} />}
      {sessions.length > 0 && <Input.Search className="session-search" allowClear value={query} placeholder="搜索对话" onChange={(event) => setQuery(event.target.value)} />}
      {sessions.length === 0 && !error
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有历史对话" />
        : visibleSessions.length === 0
          ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的对话" />
        : <Conversations
            rootClassName="session-conversations"
            activeKey={selectionMode ? undefined : activeSession?.id}
            items={visibleSessions.map((session) => ({
              key: session.id,
              group: sessionGroup(session.updatedAt),
              label: <span className="session-select-row">{selectionMode && <Checkbox aria-label={`选择 ${session.name}`} checked={selected.has(session.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggle(session.id)} />}{editingId === session.id
                ? <Input autoFocus size="small" value={editingName} maxLength={80} aria-label="对话名称" onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingName(event.target.value)} onPressEnter={() => void commitRename()} onKeyDown={(event) => { if (event.key === 'Escape') { skipRenameCommit.current = true; setEditingId(null) } }} onBlur={() => void commitRename()} />
                : <span className="session-label" onDoubleClick={(event) => { event.stopPropagation(); startRename(session) }}><strong>{session.name}</strong><small>{session.preview || '空对话'}</small><time dateTime={session.updatedAt}>{formatSessionTime(session.updatedAt)}</time></span>}</span>,
              disabled: !selectionMode && busy && activeSession?.id !== session.id
            }))}
            groupable
            creation={selectionMode ? undefined : { icon: <PlusOutlined />, label: '新建对话', disabled: busy, onClick: onCreate }}
            onActiveChange={(key) => { const id = String(key); if (selectionMode) toggle(id); else { const session = byId.get(id); if (session) onOpen(session) } }}
            menu={selectionMode ? undefined : (item) => ({
              items: [
                { key: 'rename', icon: <EditOutlined />, label: '重命名' },
                { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true }
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation()
                const session = byId.get(String(item.key))
                if (!session) return
                if (key === 'rename') startRename(session)
                else if (key === 'delete') onDelete(session)
              }
            })}
          />}
      {selectionMode && visibleSessions.length > 0 && <div className="session-batch-bar"><Checkbox checked={allSelected} indeterminate={visibleSessions.some((session) => selected.has(session.id)) && !allSelected} onChange={(event) => setSelected((current) => {
        const next = new Set(current)
        visibleSessions.forEach((session) => event.target.checked ? next.add(session.id) : next.delete(session.id))
        return next
      })}>全选当前结果</Checkbox><Button danger size="small" icon={<DeleteOutlined />} disabled={selectedSessions.length === 0 || busy} onClick={() => onDeleteMany(selectedSessions)}>删除 {selectedSessions.length || ''}</Button></div>}
      <footer className="sidebar-runtime">
        <span className={`runtime-dot${runtime ? ' online' : ''}`} />
        <div><strong>{runtime ? `Bingo ${runtime.bingoVersion}` : '正在连接 Bingo'}</strong><small>{runtime ? `Protocol ${runtime.protocolVersion}` : '本地运行时'}</small></div>
      </footer>
    </div>
  )
}

function formatSessionTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function sessionGroup(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '更早'
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const day = 24 * 60 * 60 * 1000
  if (date.getTime() >= start) return '今天'
  if (date.getTime() >= start - day) return '昨天'
  if (date.getTime() >= start - 7 * day) return '最近 7 天'
  return '更早'
}

function workspaceName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).at(-1) || path
}
