import { useEffect, useState } from 'react'
import { Conversations } from '@ant-design/x'
import { CheckSquareOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Empty } from 'antd'
import type { GuiError, RuntimeInfo, SessionSummary } from '../../../../shared/contracts/ipc'

export function ConversationSidebar({ sessions, activeSession, runtime, error, busy, onCreate, onOpen, onRename, onDelete, onDeleteMany }: {
  sessions: SessionSummary[]
  activeSession: SessionSummary | null
  runtime: RuntimeInfo | null
  error: GuiError | null
  busy: boolean
  onCreate: () => void
  onOpen: (session: SessionSummary) => void
  onRename: (session: SessionSummary) => void
  onDelete: (session: SessionSummary) => void
  onDeleteMany: (sessions: SessionSummary[]) => void
}): React.JSX.Element {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const byId = new Map(sessions.map((session) => [session.id, session]))
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
  const allSelected = sessions.length > 0 && selected.size === sessions.length

  return (
    <div className="sidebar-content">
      <header className="sidebar-title"><div><span title={runtime?.workspacePath}>{runtime ? `工作区 · ${workspaceName(runtime.workspacePath)}` : '工作区'}</span><strong>对话</strong></div><div className="sidebar-title-actions"><small>{sessions.length}</small>{sessions.length > 0 && <Button type="text" size="small" icon={<CheckSquareOutlined />} disabled={busy} onClick={() => { setSelectionMode((current) => !current); setSelected(new Set()) }}>{selectionMode ? '完成' : '管理'}</Button>}</div></header>
      {error && <Alert type="error" showIcon message={error.msg} />}
      {sessions.length === 0 && !error
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有历史对话" />
        : <Conversations
            rootClassName="session-conversations"
            activeKey={selectionMode ? undefined : activeSession?.id}
            items={sessions.map((session) => ({
              key: session.id,
              group: sessionGroup(session.updatedAt),
              label: <span className="session-select-row">{selectionMode && <Checkbox aria-label={`选择 ${session.name}`} checked={selected.has(session.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggle(session.id)} />}<span className="session-label"><strong>{session.name}</strong><small>{session.preview || '空对话'}</small><time dateTime={session.updatedAt}>{formatSessionTime(session.updatedAt)}</time></span></span>,
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
                if (key === 'rename') onRename(session)
                else if (key === 'delete') onDelete(session)
              }
            })}
          />}
      {selectionMode && sessions.length > 0 && <div className="session-batch-bar"><Checkbox checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={(event) => setSelected(event.target.checked ? new Set(sessions.map((session) => session.id)) : new Set())}>全选</Checkbox><Button danger size="small" icon={<DeleteOutlined />} disabled={selectedSessions.length === 0 || busy} onClick={() => onDeleteMany(selectedSessions)}>删除 {selectedSessions.length || ''}</Button></div>}
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
