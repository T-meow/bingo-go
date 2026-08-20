import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, App, Spin } from 'antd'
import type {
  ActionInfo,
  AppServerNotification,
  Catalog,
  ConfigSnapshot,
  ConversationReadResult,
  ConversationSummary,
  Interaction,
  InteractionDecision,
  ProviderInfo,
  SessionLocator,
  SessionSnapshot
} from '../../shared/contracts/appServer'
import type { AppServerRendererEvent } from '../../shared/contracts/appServerIpc'
import { AppShellV2, type AppViewV2 } from './components/AppShellV2'
import { CommandPalette } from './components/CommandPalette'
import { ConversationCanvas } from './features/conversations/ConversationCanvas'
import { ConversationSidebar } from './features/conversations/ConversationSidebar'
import { AppServerSettingsView } from './features/settings/AppServerSettingsView'
import { WorkspacePage, type WorkspaceCallbacks } from './features/workspace/WorkspacePage'
import { useAppStore } from './store/useAppStore'
import { selectConversationItems, selectConversationTranscript, selectInteractionFor, selectMainConversation } from './store/appStore'

type Connection = { connected: boolean; error: string | null }

export default function AppV2(): React.JSX.Element {
  const { message } = App.useApp()
  const [store, dispatch] = useAppStore()
  const [connection, setConnection] = useState<Connection>({ connected: false, error: null })
  const [view, setView] = useState<AppViewV2>('conversations')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [shellMode, setShellMode] = useState(false)
  const [running, setRunning] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [config, setConfig] = useState<ConfigSnapshot | null>(null)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [models, setModels] = useState<string[]>([])
  const [actions, setActions] = useState<ActionInfo[]>([])
  const [commandOpen, setCommandOpen] = useState(false)
  const [catalog, setCatalog] = useState<Catalog | null>(null)

  const mainConversation = useMemo(() => selectMainConversation(store), [store])
  const selectedConversation = useMemo(() => selectedId ? store.conversations.get(selectedId) ?? mainConversation : mainConversation, [selectedId, store.conversations, mainConversation])
  const transcript = useMemo(() => selectedConversation ? selectConversationTranscript(store, selectedConversation.id) : null, [store, selectedConversation])
  const items = useMemo(() => selectedConversation ? selectConversationItems(store, selectedConversation.id) : [], [store, selectedConversation])
  const interactions = useMemo(() => selectedConversation ? selectInteractionFor(store, selectedConversation.id) : [], [store, selectedConversation])
  const turn = selectedConversation?.activeTurnId ? store.turns.get(selectedConversation.activeTurnId) ?? null : null

  const connect = useCallback(async (): Promise<void> => {
    setConnection({ connected: false, error: null })
    const probed = await window.bingoApp.probe(window.location.pathname || process.cwd())
    if (!probed.ok) { setConnection({ connected: false, error: probed.error.msg }); return }
    const opened = await window.bingoApp.connect(probed.value.workspacePath)
    if (!opened.ok) { setConnection({ connected: false, error: opened.error.msg }); return }
    dispatch({ type: 'session-snapshot', snapshot: opened.value })
    setConnection({ connected: true, error: null })
  }, [dispatch])

  const resume = useCallback(async (locator: SessionLocator): Promise<void> => {
    const result = await window.bingoApp.resume(locator)
    if (!result.ok) { setConnection({ connected: true, error: result.error.msg }); return }
    dispatch({ type: 'session-snapshot', snapshot: result.value })
  }, [dispatch])

  useEffect(() => {
    void connect()
    return window.bingoApp.onEvent((event: AppServerRendererEvent) => handleRendererEvent(event))
  }, [connect])

  function handleRendererEvent(event: AppServerRendererEvent): void {
    if (event.kind === 'snapshot') dispatch({ type: 'session-snapshot', snapshot: event.snapshot })
    else if (event.kind === 'notification') dispatch({ type: 'notification', notification: event.notification })
    else if (event.kind === 'desync') dispatch({ type: 'desynchronized' })
    else if (event.kind === 'exit') setConnection((current) => ({ ...current, error: event.error ?? 'bingo app-server exited' }))
  }

  const selectConversation = useCallback(async (conversation: ConversationSummary): Promise<void> => {
    setSelectedId(conversation.id)
    setView('conversations')
    const result = await window.bingoApp.readConversation({ conversationId: conversation.id })
    if (result.ok) dispatch({ type: 'conversation-snapshot', conversationId: conversation.id, snapshot: result.value.snapshot })
  }, [dispatch])

  const submit = useCallback(async (text: string): Promise<void> => {
    if (!selectedConversation) return
    const result = await window.bingoApp.composerSubmit(selectedConversation.id, text, shellMode ? 'shell' : 'normal', [])
    if (!result.ok) message.error(result.error.msg)
    else setDraft('')
  }, [message, selectedConversation, shellMode])

  const respond = useCallback(async (interaction: Interaction, decision: InteractionDecision, activation: 'pointer' | 'keyboard'): Promise<void> => {
    const result = await window.bingoApp.respond(interaction.id, decision, activation)
    if (!result.ok) message.error(result.error.msg)
  }, [message])

  const interrupt = useCallback(async (): Promise<void> => {
    if (!selectedConversation?.activeTurnId) return
    const result = await window.bingoApp.interrupt({ conversationId: selectedConversation.id, turnId: selectedConversation.activeTurnId })
    if (!result.ok) message.error(result.error.msg)
  }, [message, selectedConversation])

  const loadCatalog = useCallback(async (): Promise<void> => {
    const [providersResult, actionsResult, configResult] = await Promise.all([
      window.bingoApp.readCatalog('providers'),
      window.bingoApp.listActions(),
      window.bingoApp.readConfig()
    ])
    if (providersResult.ok) {
      const value = providersResult.value.catalog
      if (value.catalog === 'providers') setProviders(value.items)
    }
    if (actionsResult.ok) setActions(actionsResult.value.actions)
    if (configResult.ok) setConfig(configResult.value.config)
  }, [])

  useEffect(() => {
    if (connection.connected) void loadCatalog()
  }, [connection.connected, loadCatalog])

  const runAction = useCallback(async (action: ActionInfo): Promise<void> => {
    if (!selectedConversation) return
    const result = await window.bingoApp.executeAction({ originConversationId: selectedConversation.id, precondition: null, action: action as never })
    if (!result.ok) message.error(result.error.msg)
  }, [message, selectedConversation])

  const callbacks: WorkspaceCallbacks = {
    onOpenRoom: (room) => { const conversation = room.conversationId ? store.conversations.get(room.conversationId) : null; if (conversation) void selectConversation(conversation) },
    onOpenAgent: (agent) => { const conversation = agent.conversationId ? store.conversations.get(agent.conversationId) : null; if (conversation) void selectConversation(conversation) },
    onMessageAgent: () => undefined,
    onJoinRoom: (room) => void runAction({ id: 'room.join', family: 'room', label: 'Join', description: '', available: true, arguments: [] } as ActionInfo),
    onLeaveRoom: () => undefined,
    onStartTeam: () => void runAction({ id: 'team.start', family: 'team', label: 'Start team', description: '', available: true, arguments: [] } as ActionInfo),
    onStopTeam: () => void runAction({ id: 'team.stop', family: 'team', label: 'Stop team', description: '', available: true, arguments: [] } as ActionInfo),
    onAssign: () => undefined
  }

  if (!connection.connected) {
    return <div className="app-loading-v2"><Spin size="large" /><span>正在连接 bingo app-server…</span>{connection.error && <Alert type="error" showIcon message={connection.error} />}</div>
  }

  return (
    <AppShellV2
      view={view}
      onViewChange={setView}
      sidebar={<ConversationSidebar conversations={[...store.conversations.values()]} activeId={selectedConversation?.id ?? null} onSelect={(conversation) => void selectConversation(conversation)} />}
      inspector={<InspectorV2 conversation={selectedConversation} />}
      inspectorCollapsed={inspectorCollapsed}
      onInspectorCollapsedChange={setInspectorCollapsed}
    >
      {view === 'conversations' && selectedConversation && (
        <ConversationCanvas
          conversation={selectedConversation}
          items={items}
          interactions={interactions}
          turn={turn}
          queue={transcript?.queue ?? []}
          contextUsage={transcript?.contextUsage ?? null}
          turnUsage={null}
          composer={{
            value: draft, onChange: setDraft, loading: running, onSubmit: (text) => { void submit(text) }, onCancel: () => { void interrupt() },
            shellMode, onShellModeChange: setShellMode, onReclaimTail: () => { if (selectedConversation) void window.bingoApp.queueReclaimTail({ conversationId: selectedConversation.id }) },
            attachments: []
          }}
          onRespond={(interaction, decision, activation) => void respond(interaction, decision, activation)}
        />
      )}
      {view === 'workspace' && <WorkspacePage state={store} callbacks={callbacks} />}
      {view === 'settings' && <AppServerSettingsView config={config} providers={providers} models={models} mcpServers={config?.mcpServers ?? []} actions={actions}
        onModelSelect={(model) => { if (selectedConversation) void runAction({ id: 'model.select', family: 'model', label: 'Select model', description: '', available: true, arguments: [] } as ActionInfo) }}
        onProviderSelect={() => undefined} onThinkingSelect={() => undefined} onPermissionMode={() => undefined} onTheme={() => undefined} onAction={(action) => void runAction(action)} />}
      <CommandPalette open={commandOpen} actions={actions} onClose={() => setCommandOpen(false)} onExecute={(action) => void runAction(action)} />
    </AppShellV2>
  )
}

function InspectorV2({ conversation }: { conversation: ConversationSummary | null }): React.JSX.Element {
  if (!conversation) return <span>无会话</span>
  return <div className="inspector-v2"><strong>{conversation.title}</strong><span>{conversation.runState} · unread {conversation.unread} · queue {conversation.queueCount}</span></div>
}
