import { useEffect, useRef, useState } from 'react'
import { Conversations } from '@ant-design/x'
import { CheckSquareOutlined, DeleteOutlined, EditOutlined, FolderOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Empty, Input } from 'antd'
import type { GuiError, RuntimeInfo, SessionSummary, WorkspacePreferencesV2 } from '../../../../shared/contracts/ipc'

type SessionProjectGroup = {
  key: string
  kind: 'current' | 'recent' | 'other' | 'unclassified'
  path: string | null
  sessions: SessionSummary[]
}

export function ConversationSidebar({ sessions, activeSession, runtime, workspacePreferences, error, busy, onCreate, onOpen, onRename, onDelete, onDeleteMany }: {
  sessions: SessionSummary[]
  activeSession: SessionSummary | null
  runtime: RuntimeInfo | null
  workspacePreferences: WorkspacePreferencesV2 | null
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
  const visibleSessions = sessions.filter((session) => sessionMatchesSearch(session, normalizedQuery))
  const projectGroups = groupSessionsByProject(visibleSessions, workspacePreferences ?? (runtime ? { schemaVersion: 2, currentPath: runtime.workspacePath, recentPaths: [runtime.workspacePath] } : null))
  const groupByKey = new Map(projectGroups.map((group) => [group.key, group]))
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  useEffect(() => {
    const available = new Set(sessions.map((session) => session.id))
    setSelected((current) => new Set([...current].filter((id) => available.has(id))))
  }, [sessions])
  useEffect(() => {
    const defaults = projectGroups.filter((group) => group.kind === 'current' || group.kind === 'unclassified').map((group) => group.key)
    setExpandedGroups((current) => [...new Set([...current.filter((key) => projectGroups.some((group) => group.key === key)), ...defaults])])
  }, [sessions, workspacePreferences?.currentPath])
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
            items={projectGroups.flatMap((group) => group.sessions.map((session) => ({
              key: session.id,
              group: group.key,
              label: <span className="session-select-row">{selectionMode && <Checkbox aria-label={`选择 ${session.name}`} checked={selected.has(session.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggle(session.id)} />}{editingId === session.id
                ? <Input autoFocus size="small" value={editingName} maxLength={80} aria-label="对话名称" onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingName(event.target.value)} onPressEnter={() => void commitRename()} onKeyDown={(event) => { if (event.key === 'Escape') { skipRenameCommit.current = true; setEditingId(null) } }} onBlur={() => void commitRename()} />
                : <span className="session-label" onDoubleClick={(event) => { event.stopPropagation(); startRename(session) }}>
                    <span className="session-name-row"><strong>{session.name}</strong>{session.parentSessionId && <span className="session-branch-badge" title={`来源：${session.parentSessionId}`}>分支</span>}</span>
                    <small>{session.preview || '空对话'}</small>
                    {session.parentSessionId && <small className="session-fork-source" title={session.parentSessionId}>来源 · {session.parentSessionId}</small>}
                    <time dateTime={session.updatedAt}>{formatSessionTime(session.updatedAt)}</time>
                  </span>}</span>,
              disabled: !selectionMode && busy && activeSession?.id !== session.id
            })))}
            groupable={{
              collapsible: true,
              expandedKeys: normalizedQuery ? projectGroups.map((group) => group.key) : expandedGroups,
              onExpand: setExpandedGroups,
              label: (key) => {
                const group = groupByKey.get(key)
                if (!group) return key
                return <span className="session-project-group">
                  {group.kind === 'unclassified' ? <WarningOutlined /> : <FolderOutlined />}
                  <span><strong>{projectGroupTitle(group)}</strong><small title={group.path ?? undefined}>{group.path ?? '打开前需选择项目'}</small></span>
                  <i>{group.sessions.length}</i>
                </span>
              }
            }}
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

export function sessionMatchesSearch(session: SessionSummary, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  const path = session.workspacePath ?? ''
  return `${session.name}\n${session.preview}\n${workspaceName(path)}\n${path}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
}

export function groupSessionsByProject(sessions: SessionSummary[], preferences: WorkspacePreferencesV2 | null): SessionProjectGroup[] {
  const sorted = [...sessions].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  const grouped = new Map<string, { path: string; sessions: SessionSummary[] }>()
  const unclassified: SessionSummary[] = []
  for (const session of sorted) {
    if (!session.workspacePath) {
      unclassified.push(session)
      continue
    }
    const key = comparableWorkspacePath(session.workspacePath)
    const group = grouped.get(key) ?? { path: session.workspacePath, sessions: [] }
    group.sessions.push(session)
    grouped.set(key, group)
  }

  const result: SessionProjectGroup[] = []
  const take = (path: string, kind: SessionProjectGroup['kind']): void => {
    const key = comparableWorkspacePath(path)
    const group = grouped.get(key)
    if (!group) return
    result.push({ key: workspaceGroupKey(key), kind, path: group.path, sessions: group.sessions })
    grouped.delete(key)
  }
  if (preferences) {
    take(preferences.currentPath, 'current')
    preferences.recentPaths.filter((path) => comparableWorkspacePath(path) !== comparableWorkspacePath(preferences.currentPath)).forEach((path) => take(path, 'recent'))
  }
  ;[...grouped.entries()]
    .sort((left, right) => Date.parse(right[1].sessions[0]?.updatedAt ?? '') - Date.parse(left[1].sessions[0]?.updatedAt ?? ''))
    .forEach(([key, group]) => result.push({ key: workspaceGroupKey(key), kind: 'other', path: group.path, sessions: group.sessions }))
  if (unclassified.length > 0) result.push({ key: 'workspace:unclassified', kind: 'unclassified', path: null, sessions: unclassified })
  return result
}

function workspaceName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).at(-1) || path
}

function comparableWorkspacePath(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  return /^[a-z]:[\\/]/i.test(normalized) || normalized.startsWith('\\\\') ? normalized.toLocaleLowerCase('en-US') : normalized
}

function workspaceGroupKey(path: string): string {
  return `workspace:${path}`
}

function projectGroupTitle(group: SessionProjectGroup): string {
  if (group.kind === 'unclassified') return '未归类'
  const name = workspaceName(group.path ?? '')
  if (group.kind === 'current') return `当前项目 · ${name}`
  if (group.kind === 'recent') return `最近项目 · ${name}`
  return `其他项目 · ${name}`
}
