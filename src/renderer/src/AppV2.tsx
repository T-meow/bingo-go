import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, App, Button, Empty, Spin } from 'antd'
import type {
  Action,
  ActionInfo,
  ConversationSummary,
  Interaction,
  InteractionDecision,
  ModelInfo,
  ProviderInfo,
  SessionListEntry,
  SessionSnapshot,
  ThinkingLevel
} from '../../shared/contracts/appServer'
import type { AppServerRendererEvent } from '../../shared/contracts/appServerIpc'
import { AppShellV2, type AppViewV2 } from './components/AppShellV2'
import { CommandPalette } from './components/CommandPalette'
import { GameCenter } from './components/GameCenter'
import { ConversationCanvas } from './features/conversations/ConversationCanvas'
import { ConversationSidebar } from './features/conversations/ConversationSidebar'
import { materializeAction, type ActionArgumentValues } from './features/actions/materializeAction'
import { AgentInspector } from './features/conversations/AgentInspector'
import { AppServerSettingsView, type SettingsSectionId } from './features/settings/AppServerSettingsView'
import type { SettingsSectionTransaction } from './features/settings/AppearanceSettings'
import { WorkspacePage, type WorkspaceCallbacks } from './features/workspace/WorkspacePage'
import { useAppStore } from './store/useAppStore'
import { selectConversationItems, selectConversationTranscript, selectInteractionFor, selectMainConversation } from './store/appStore'

type Connection = { connected: boolean; loading: boolean; error: string | null }

export default function AppV2(): React.JSX.Element {
  const { message, modal } = App.useApp()
  const [store, dispatch] = useAppStore()
  const [connection, setConnection] = useState<Connection>({ connected: false, loading: true, error: null })
  const [workspacePath, setWorkspacePath] = useState('')
  const [sessions, setSessions] = useState<SessionListEntry[]>([])
  const [view, setView] = useState<AppViewV2>('conversations')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [shellMode, setShellMode] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [models, setModels] = useState<string[]>([])
  const [actions, setActions] = useState<ActionInfo[]>([])
  const [commandOpen, setCommandOpen] = useState(false)
  const [gameCenterOpen, setGameCenterOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('runtime')
  const [settingsTransaction, setSettingsTransaction] = useState<SettingsSectionTransaction | null>(null)

  const mainConversation = useMemo(() => selectMainConversation(store), [store])
  const selectedConversation = useMemo(
    () => selectedId ? store.conversations.get(selectedId) ?? mainConversation : mainConversation,
    [selectedId, store.conversations, mainConversation]
  )
  const transcript = useMemo(
    () => selectedConversation ? selectConversationTranscript(store, selectedConversation.id) : null,
    [store, selectedConversation]
  )
  const items = useMemo(
    () => selectedConversation ? selectConversationItems(store, selectedConversation.id) : [],
    [store, selectedConversation]
  )
  const interactions = useMemo(
    () => selectedConversation ? selectInteractionFor(store, selectedConversation.id) : [],
    [store, selectedConversation]
  )
  const selectedAgent = useMemo(
    () => selectedConversation?.kind.type === 'agent' ? store.agents.byId.get(selectedConversation.kind.agentId) ?? null : null,
    [selectedConversation, store.agents.byId]
  )
  const turn = selectedConversation?.activeTurnId ? store.turns.get(selectedConversation.activeTurnId) ?? null : null
  const running = selectedConversation?.runState === 'running' || turn?.status === 'running'

  useEffect(() => {
    if (selectedConversation?.kind.type !== 'main' && shellMode) setShellMode(false)
  }, [selectedConversation?.kind.type, shellMode])

  const hydrateSnapshot = useCallback(async (snapshot: SessionSnapshot): Promise<void> => {
    dispatch({ type: 'session-snapshot', snapshot })
    setWorkspacePath(snapshot.session.cwd)
    const main = snapshot.conversations.active.find((conversation) => conversation.kind.type === 'main')
      ?? snapshot.conversations.active[0]
    setSelectedId(main?.id ?? null)
    if (!main) return
    const result = await window.bingoApp.readConversation({ conversationId: main.id })
    if (result.ok) dispatch({ type: 'conversation-snapshot', conversationId: main.id, snapshot: result.value.snapshot })
  }, [dispatch])

  const loadSessions = useCallback(async (): Promise<void> => {
    const result = await window.bingoApp.listSessions()
    if (result.ok) setSessions(result.value.sessions.items)
  }, [])

  const connect = useCallback(async (requestedPath?: string): Promise<void> => {
    setConnection({ connected: false, loading: true, error: null })
    let workspace = requestedPath
    if (!workspace) {
      const preferences = await window.bingoGui.getWorkspaces()
      if (!preferences.ok) {
        setConnection({ connected: false, loading: false, error: preferences.error.msg })
        return
      }
      workspace = preferences.value.currentPath
    }
    const probed = await window.bingoApp.probe(workspace)
    if (!probed.ok) {
      setWorkspacePath(workspace)
      setConnection({ connected: false, loading: false, error: probed.error.msg })
      return
    }
    const opened = await window.bingoApp.connect(probed.value.workspacePath)
    if (!opened.ok) {
      setWorkspacePath(probed.value.workspacePath)
      setConnection({ connected: false, loading: false, error: opened.error.msg })
      return
    }
    await hydrateSnapshot(opened.value)
    setConnection({ connected: true, loading: false, error: null })
    await loadSessions()
  }, [hydrateSnapshot, loadSessions])

  const handleRendererEvent = useCallback((event: AppServerRendererEvent): void => {
    if (event.kind === 'snapshot') dispatch({ type: 'session-snapshot', snapshot: event.snapshot })
    else if (event.kind === 'notification') dispatch({ type: 'notification', notification: event.notification })
    else if (event.kind === 'desync') dispatch({ type: 'desynchronized' })
    else if (event.kind === 'exit' && (event.error || (event.exitCode !== null && event.exitCode !== 0))) {
      setConnection((current) => ({ ...current, loading: false, error: event.error ?? `bingo app-server exited (${event.exitCode})` }))
    }
  }, [dispatch])

  useEffect(() => {
    const unsubscribe = window.bingoApp.onEvent(handleRendererEvent)
    void connect()
    return unsubscribe
  }, [connect, handleRendererEvent])

  useEffect(() => window.bingoGui.onNotificationActivated((activation) => {
    if (activation.sessionId !== store.session?.id || !activation.conversationId) return
    const conversation = store.conversations.get(activation.conversationId)
    if (conversation) {
      setView('conversations')
      setSelectedId(conversation.id)
    }
  }), [store.conversations, store.session?.id])

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])

  const selectConversation = useCallback(async (conversation: ConversationSummary): Promise<void> => {
    setSelectedId(conversation.id)
    setView('conversations')
    const result = await window.bingoApp.readConversation({ conversationId: conversation.id })
    if (!result.ok) {
      void message.error(result.error.msg)
      return
    }
    dispatch({ type: 'conversation-snapshot', conversationId: conversation.id, snapshot: result.value.snapshot })
  }, [dispatch, message])

  const resume = useCallback(async (entry: SessionListEntry): Promise<void> => {
    if (running) {
      void message.warning('请先停止当前回合，再切换会话。')
      return
    }
    setConnection((current) => ({ ...current, loading: true, error: null }))
    if (entry.cwd && entry.cwd !== workspacePath) {
      const selected = await window.bingoGui.selectWorkspace({ path: entry.cwd })
      if (!selected.ok || selected.value.canceled) {
        setConnection((current) => ({ ...current, loading: false, error: selected.ok ? '工作区切换已取消。' : selected.error.msg }))
        return
      }
      setWorkspacePath(selected.value.preferences.currentPath)
    }
    const result = await window.bingoApp.resume(entry.locator)
    if (!result.ok) {
      setConnection((current) => ({ ...current, loading: false, error: result.error.msg }))
      return
    }
    await hydrateSnapshot(result.value)
    setConnection({ connected: true, loading: false, error: null })
    await loadSessions()
  }, [hydrateSnapshot, loadSessions, message, running, workspacePath])

  const chooseWorkspace = useCallback(async (): Promise<void> => {
    if (running) {
      void message.warning('请先停止当前回合，再切换工作区。')
      return
    }
    const result = await window.bingoGui.selectWorkspace()
    if (!result.ok) {
      void message.error(result.error.msg)
      return
    }
    if (result.value.canceled) return
    setWorkspacePath(result.value.preferences.currentPath)
    if (result.value.changed || !connection.connected) await connect(result.value.preferences.currentPath)
  }, [connect, connection.connected, message, running])

  const submit = useCallback(async (text: string): Promise<void> => {
    if (!selectedConversation) return
    const result = selectedConversation.kind.type === 'main'
      ? await window.bingoApp.composerSubmit(selectedConversation.id, text, shellMode ? 'shell' : 'normal', [])
      : await window.bingoApp.sendProse(selectedConversation.id, text, [])
    if (!result.ok) void message.error(result.error.msg)
    else setDraft('')
  }, [message, selectedConversation, shellMode])

  const respond = useCallback(async (interaction: Interaction, decision: InteractionDecision, activation: 'pointer' | 'keyboard'): Promise<void> => {
    const result = await window.bingoApp.respond(interaction.id, decision, activation)
    if (!result.ok) void message.error(result.error.msg)
  }, [message])

  const interrupt = useCallback(async (): Promise<void> => {
    if (!selectedConversation?.activeTurnId) return
    const result = await window.bingoApp.interrupt({ conversationId: selectedConversation.id, turnId: selectedConversation.activeTurnId })
    if (!result.ok) void message.error(result.error.msg)
  }, [message, selectedConversation])

  const loadCatalog = useCallback(async (): Promise<void> => {
    const provider = store.config?.provider
    const [providersResult, modelsResult, actionsResult] = await Promise.all([
      window.bingoApp.readCatalog('providers'),
      provider ? window.bingoApp.readCatalog('models', provider) : Promise.resolve(null),
      window.bingoApp.listActions()
    ])
    if (providersResult.ok && providersResult.value.catalog.catalog === 'providers') {
      setProviders(providersResult.value.catalog.items)
    }
    if (modelsResult?.ok && modelsResult.value.catalog.catalog === 'models') {
      setModels((modelsResult.value.catalog.items as ModelInfo[]).map((model) => model.id))
    }
    if (actionsResult.ok) setActions(actionsResult.value.actions)
  }, [store.config?.provider])

  useEffect(() => {
    if (connection.connected) void loadCatalog()
  }, [connection.connected, loadCatalog])

  const runAction = useCallback(async (action: Action): Promise<boolean> => {
    if (!selectedConversation) return false
    const result = await window.bingoApp.executeAction({
      originConversationId: selectedConversation.id,
      precondition: null,
      action
    })
    if (!result.ok) {
      void message.error(result.error.msg)
      return false
    }
    return true
  }, [message, selectedConversation])

  const runCatalogAction = useCallback((info: ActionInfo, values: ActionArgumentValues): void => {
    try {
      void runAction(materializeAction(info, values))
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error))
    }
  }, [message, runAction])

  const restartAfterDefinitionWrite = useCallback(async (): Promise<void> => {
    const result = await window.bingoApp.restartAfterDefinitionWrite()
    if (!result.ok) {
      void message.error(result.error.msg)
      return
    }
    await hydrateSnapshot(result.value)
    setConnection({ connected: true, loading: false, error: null })
    await loadSessions()
    void message.success('定义已保存，app-server 已重新载入。')
  }, [hydrateSnapshot, loadSessions, message])

  const confirmSettingsExit = useCallback((next: () => void): void => {
    if (!settingsTransaction) {
      next()
      return
    }
    modal.confirm({
      title: '放弃未保存的设置？',
      content: '当前分区有尚未保存的更改。',
      okText: '放弃更改',
      cancelText: '继续编辑',
      okButtonProps: { danger: true },
      onOk: () => {
        settingsTransaction.discard()
        setSettingsTransaction(null)
        next()
      }
    })
  }, [modal, settingsTransaction])

  const changeView = useCallback((nextView: AppViewV2): void => {
    if (nextView === view) return
    if (view === 'settings') confirmSettingsExit(() => setView(nextView))
    else setView(nextView)
  }, [confirmSettingsExit, view])

  const changeSettingsSection = useCallback((section: SettingsSectionId): void => {
    if (section === settingsSection) return
    confirmSettingsExit(() => setSettingsSection(section))
  }, [confirmSettingsExit, settingsSection])

  const openGameSettings = useCallback((): void => {
    const open = (): void => {
      setGameCenterOpen(false)
      setSettingsSection('games')
      setView('settings')
    }
    if (view === 'settings') confirmSettingsExit(open)
    else open()
  }, [confirmSettingsExit, view])

  const openAgent = (conversationId?: string | null): void => {
    const conversation = conversationId ? store.conversations.get(conversationId) : null
    if (conversation) void selectConversation(conversation)
  }
  const callbacks: WorkspaceCallbacks = {
    onOpenRoom: (room) => openAgent(room.conversationId),
    onOpenAgent: (agent) => openAgent(agent.conversationId),
    onMessageAgent: (agent) => openAgent(agent.conversationId),
    onJoinRoom: (room) => { void runAction({ type: 'roomJoin', room: room.name }) },
    onLeaveRoom: (room) => { void runAction({ type: 'roomLeave', room: room.name }) },
    onStartTeam: () => { void runAction({ type: 'teamStart', members: null }) },
    onStopTeam: () => { void runAction({ type: 'teamStop', member: null }) },
    onStopAgent: (agent) => { void runAction({ type: 'teamStop', member: agent.name }) },
    onAssign: (agent, task) => { void runAction({ type: 'teamAssign', member: agent.name, task }) }
  }

  if (!connection.connected) {
    return <div className="app-loading-v2">
      {connection.loading && <Spin size="large" />}
      <span>{connection.loading ? '正在连接 bingo app-server…' : '无法连接当前工作区'}</span>
      {connection.error && <Alert type="error" showIcon title={connection.error} action={<Button onClick={() => void chooseWorkspace()}>选择工作区</Button>} />}
    </div>
  }

  return (
    <AppShellV2
      view={view}
      onViewChange={changeView}
      workspacePath={workspacePath}
      onSelectWorkspace={() => { void chooseWorkspace() }}
      onOpenCommands={() => setCommandOpen(true)}
      onOpenGames={() => setGameCenterOpen(true)}
      sidebar={view === 'conversations' ? <ConversationSidebar
        conversations={[...store.conversations.values()]}
        activeId={selectedConversation?.id ?? null}
        sessions={sessions}
        currentLocator={store.session?.locator ?? null}
        onSelect={(conversation) => { void selectConversation(conversation) }}
        onCreate={() => { void connect(workspacePath) }}
        onResume={(entry) => { void resume(entry) }}
      /> : undefined}
      inspector={view === 'conversations' ? <AgentInspector
        conversation={selectedConversation}
        agent={selectedAgent}
        session={store.session}
        config={store.config}
        items={items}
        contextUsage={transcript?.contextUsage ?? null}
        turnUsage={turn?.usage ?? null}
        interactionCount={interactions.length}
        queueCount={transcript?.queue.length ?? selectedConversation?.queueCount ?? 0}
      /> : undefined}
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
          composer={{
            value: draft,
            onChange: setDraft,
            loading: running,
            onSubmit: (text) => { void submit(text) },
            onCancel: () => { void interrupt() },
            shellMode,
            onShellModeChange: setShellMode,
            allowShell: selectedConversation.kind.type === 'main' && Boolean(store.capabilities?.shell),
            runtime: selectedConversation.kind.type === 'main' && store.config ? {
              config: store.config,
              providers,
              models,
              onProviderSelect: (provider) => { void runAction({ type: 'providerSelect', provider }) },
              onModelSelect: (model) => { void runAction({ type: 'modelSelect', model }) },
              onThinkingSelect: (level) => { void runAction({ type: 'thinkingSelect', level }) },
              onPermissionMode: (mode) => { void runAction({ type: 'permissionModeSet', mode }) }
            } : undefined,
            onReclaimTail: () => { if (selectedConversation) void window.bingoApp.queueReclaimTail({ conversationId: selectedConversation.id }) },
            attachments: []
          }}
          onRespond={(interaction, decision, activation) => { void respond(interaction, decision, activation) }}
        />
      )}
      {view === 'conversations' && !selectedConversation && <Empty description="当前会话没有对话" />}
      {view === 'workspace' && <WorkspacePage state={store} callbacks={callbacks} />}
      {view === 'settings' && <AppServerSettingsView
        activeSection={settingsSection}
        onSectionChange={changeSettingsSection}
        onTransactionChange={setSettingsTransaction}
        workspacePath={workspacePath}
        config={store.config}
        providers={providers}
        models={models}
        mcpServers={store.config?.mcpServers ?? []}
        onModelSelect={(model) => { void runAction({ type: 'modelSelect', model }) }}
        onProviderSelect={(provider) => { void runAction({ type: 'providerSelect', provider }) }}
        onThinkingSelect={(level) => { void runAction({ type: 'thinkingSelect', level: level as ThinkingLevel }) }}
        onPermissionMode={(mode) => { void runAction({ type: 'permissionModeSet', mode: mode as 'default' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk' | 'plan' }) }}
        onTheme={(theme) => { void runAction({ type: 'themeSet', theme }) }}
        onDefinitionsChanged={restartAfterDefinitionWrite}
      />}
      <CommandPalette open={commandOpen} actions={actions} onClose={() => setCommandOpen(false)} onExecute={runCatalogAction} />
      <GameCenter open={gameCenterOpen} onClose={() => setGameCenterOpen(false)} onOpenSettings={openGameSettings} />
    </AppShellV2>
  )
}
