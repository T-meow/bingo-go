import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { App as AntApp, Alert, Button, Modal, Result, Space, Typography } from 'antd'
import type { AgentDefinitionDocument, CliEvent, PromptResponse, TeamDefinition, TeamPresetModelMapping, TeamSnapshot } from '../../shared/contracts/cli'
import { TEAM_AVATAR_READ_CAPABILITY, TEAM_LOBBY_CAPABILITY, TEAM_TASKS_CAPABILITY, TEAM_WORKSPACE_CAPABILITY, supportsTeamV2 } from '../../shared/contracts/cli'
import type {
  AppInfo, EditableSettings, GuiError, McpServerSettingsInput, ModelListOutput, ProviderSettingsInput, RendererSessionEvent,
  MessageImageAttachment, PermissionMode, RuntimeInfo, RuntimeSettings, SessionOpened, SessionSummary, SettingsSnapshot, WorkspacePreferencesV2
} from '../../shared/contracts/ipc'
import { AppShell, type AppView } from './components/AppShell'
import { ChatInspector, ChatPage } from './features/chat/ChatPage'
import {
  ATTACHMENTS_CAPABILITY, MAX_ATTACHMENTS, prepareComposerAttachment, revokeAttachmentPreview,
  type ComposerImageAttachment
} from './features/chat/attachments'
import { ConversationSidebar } from './features/chat/ConversationSidebar'
import { SettingsPage } from './features/settings/SettingsPage'
import type { SettingsSectionTransaction } from './features/settings/AppearanceSettings'
import { SettingsSidebar, type SettingsSection } from './features/settings/SettingsSidebar'
import { TeamInspector, TeamPage, type TeamActivity, type TeamCreateRequest } from './features/team/TeamPage'
import type { AgentDefinitionDraft } from './features/team/AgentDefinitionEditor'
import type { TeamTaskCreateInput } from './features/team/TeamTaskCreateDrawer'
import { TeamSidebar } from './features/team/TeamSidebar'
import { chatReducer, initialChatState, type ChatMessage } from './state/chatReducer'
import { initialTeamState, teamReducer } from './state/teamReducer'
import { useAppearance } from './theme/AppearanceProvider'
import { conversationTitle } from '../../shared/conversationTitle'
import { AvatarDataProvider } from './components/IdentityAvatar'

type Connection = { id: string; sequence: number }
type PendingSettingsNavigation = { view: AppView } | { section: SettingsSection } | { action: 'workspace' }
type EditingPrompt = {
  sourceSessionId: string
  message: ChatMessage
  savedDraft: string
  savedAttachments: ComposerImageAttachment[]
  forked: boolean
}

const SESSION_FORK_CAPABILITY = 'session.fork.v1'
const CONTINUE_PROMPT = '继续未完成的任务。先检查当前工作区和已完成的工具结果，只执行剩余步骤，不要重复已经完成或可能产生副作用的操作。'
const RECOVER_CONTINUE_PROMPT = `上一个回合因运行时异常中断。${CONTINUE_PROMPT}`

export default function App(): React.JSX.Element {
  const { message, modal } = AntApp.useApp()
  const appearance = useAppearance()
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const [teamState, teamDispatch] = useReducer(teamReducer, initialTeamState)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<ComposerImageAttachment[]>([])
  const [editingPrompt, setEditingPrompt] = useState<EditingPrompt | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [capabilities, setCapabilities] = useState<string[]>([])
  const teamV2Capability = supportsTeamV2(capabilities)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionListError, setSessionListError] = useState<GuiError | null>(null)
  const [activeSession, setActiveSession] = useState<SessionSummary | null>(null)
  const [deleteSession, setDeleteSession] = useState<SessionSummary | null>(null)
  const [sessionMutationError, setSessionMutationError] = useState<GuiError | null>(null)
  const [view, setView] = useState<AppView>('chat')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings | null>(null)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [thinkingLevel, setThinkingLevel] = useState<RuntimeSettings['thinkingLevel']>('off')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
  const [runtimeSettingsError, setRuntimeSettingsError] = useState<GuiError | null>(null)
  const [savingRuntime, setSavingRuntime] = useState(false)
  const [sessionOperation, setSessionOperation] = useState(false)
  const [workspaceOperation, setWorkspaceOperation] = useState(false)
  const [externalTerminalOperation, setExternalTerminalOperation] = useState(false)
  const [attachmentOperation, setAttachmentOperation] = useState(false)
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferencesV2 | null>(null)
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<EditableSettings | null>(null)
  const [settingsError, setSettingsError] = useState<GuiError | null>(null)
  const [settingsOperation, setSettingsOperation] = useState(false)
  const [pendingSettingsNavigation, setPendingSettingsNavigation] = useState<PendingSettingsNavigation | null>(null)
  const [settingsNavigationSaving, setSettingsNavigationSaving] = useState(false)
  const [settingsSectionTransaction, setSettingsSectionTransaction] = useState<SettingsSectionTransaction | null>(null)
  const [teamActivity, setTeamActivity] = useState<TeamActivity>([])
  const [teamError, setTeamError] = useState<GuiError | null>(null)
  const [teamOperation, setTeamOperation] = useState(false)
  const [teamCreateRequest, setTeamCreateRequest] = useState<TeamCreateRequest>(null)
  const [flowError, setFlowError] = useState<GuiError | null>(null)
  const [connected, setConnected] = useState(false)
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null)
  const connection = useRef<Connection | null>(null)
  const activeTurnId = useRef<string | null>(null)
  const autoTitleEligible = useRef(false)
  const pendingAutoTitle = useRef<{ turnId: string; title: string } | null>(null)
  const connectInFlight = useRef(false)
  const attachmentDraft = useRef<ComposerImageAttachment[]>([])
  const messagePreviewUrls = useRef(new Set<string>())
  const recoveryOperation = useRef<string | null>(null)
  const teamAvatarCache = useRef(new Map<string, Promise<string | null>>())
  const settingsDraftDirty = Boolean(settingsSnapshot && settingsDraft && JSON.stringify(settingsDraft) !== JSON.stringify(settingsSnapshot.values))
  const settingsDirty = settingsDraftDirty || Boolean(settingsSectionTransaction)

  useEffect(() => { activeTurnId.current = state.turnId }, [state.turnId])

  const commitAttachments = useCallback((next: ComposerImageAttachment[]): void => {
    attachmentDraft.current = next
    setAttachments(next)
  }, [])

  const clearAttachments = useCallback((): void => {
    attachmentDraft.current.forEach(revokeAttachmentPreview)
    commitAttachments([])
  }, [commitAttachments])

  const clearMessagePreviews = useCallback((): void => {
    messagePreviewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    messagePreviewUrls.current.clear()
  }, [])

  const resetAttachmentRegistrations = useCallback((): void => {
    commitAttachments(attachmentDraft.current.map((attachment) => ({
      ...attachment,
      status: attachment.status === 'error' ? 'error' : 'ready',
      marker: undefined,
      normalizedMediaType: undefined
    })))
  }, [commitAttachments])

  const handleTransportError = useCallback((code: string, msg: string): void => {
    connection.current = null
    activeTurnId.current = null
    pendingAutoTitle.current = null
    setConnected(false)
    resetAttachmentRegistrations()
    dispatch({ type: 'transport-error', code, msg })
  }, [resetAttachmentRegistrations])

  const runSessionOperation = useCallback(async <T,>(operation: Promise<T>): Promise<T | null> => {
    try {
      return await withTimeout(operation, 12_000)
    } catch {
      handleTransportError('CONNECTION_TIMEOUT', '12 秒内未收到 Bingo 响应，连接已失效。请重试或新建对话。')
      return null
    }
  }, [handleTransportError])

  useEffect(() => () => {
    attachmentDraft.current.forEach(revokeAttachmentPreview)
    messagePreviewUrls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const refreshSessions = useCallback(async (): Promise<void> => {
    const listed = await withTimeout(window.bingoGui.listSessions(), 12_000)
    if (listed.ok) {
      setSessions(listed.value.sessions)
      setSessionListError(listed.value.warnings.length ? { code: 'TRANSCRIPT_WARNING', msg: listed.value.warnings.join('\n'), level: 'page', recoverable: true } : null)
    } else setSessionListError(listed.error)
  }, [])

  const loadRuntimeSettings = useCallback(async (runtimeInfo: RuntimeInfo, preferred?: { provider: string; model: string; thinkingLevel: RuntimeSettings['thinkingLevel']; permissionMode: PermissionMode }): Promise<void> => {
    setRuntimeSettingsError(null)
    const loaded = await withTimeout(window.bingoGui.readRuntimeSettings({ workspacePath: runtimeInfo.workspacePath }), 12_000)
    if (!loaded.ok) { setRuntimeSettingsError(loaded.error); return }
    const provider = preferred?.provider ?? loaded.value.provider
    const model = preferred?.model ?? loaded.value.model
    const thinking = preferred?.thinkingLevel ?? loaded.value.thinkingLevel
    const permission = preferred?.permissionMode ?? loaded.value.permissionMode
    setRuntimeSettings(loaded.value)
    setSelectedProvider(provider)
    setSelectedModel(model)
    setThinkingLevel(thinking)
    setPermissionMode(permission)
    const listed = await withTimeout(window.bingoGui.listModels({ workspacePath: runtimeInfo.workspacePath, provider }), 12_000)
    if (listed.ok) {
      const available = uniqueModels(listed.value.models, model)
      setModels(available)
      if (!model) setSelectedModel(available[0] ?? '')
      setRuntimeSettingsError(listed.value.warning ?? null)
    }
    else {
      setModels(uniqueModels([], model))
      setRuntimeSettingsError(listed.error)
    }
  }, [])

  const acceptOpenedSession = useCallback((opened: SessionOpened, summary?: SessionSummary): void => {
    connection.current = { id: opened.connectionId, sequence: 0 }
    setRuntime(opened.runtime)
    setWorkspacePreferences(opened.workspacePreferences)
    setCapabilities(opened.metadata.capabilities ?? [])
    setSelectedProvider(opened.metadata.provider)
    setSelectedModel(opened.metadata.model)
    setThinkingLevel(opened.metadata.thinkingLevel)
    setPermissionMode(permissionModeValue(opened.metadata.permissionMode))
    autoTitleEligible.current = opened.autoTitleEligible
    pendingAutoTitle.current = null
    setActiveSession(summary ? { ...summary, workspacePath: opened.metadata.cwd } : {
      id: opened.metadata.sessionId,
      name: opened.metadata.displayName,
      preview: '',
      updatedAt: new Date().toISOString(),
      messageCount: opened.history.length,
      workspacePath: opened.runtime.workspacePath,
      parentSessionId: opened.metadata.parentSessionId,
      forkReason: opened.metadata.forkReason
    })
    dispatch({ type: 'restore', history: opened.history, contextUsage: opened.contextUsage })
    setSelectedToolId(opened.history.flatMap((item) => item.type === 'tool' ? [item.value.id] : []).at(-1) ?? null)
    teamDispatch({ type: 'reset' })
    setTeamActivity([])
    setConnected(true)
  }, [])

  const resetConversation = useCallback((): void => {
    connection.current = null
    activeTurnId.current = null
    autoTitleEligible.current = false
    pendingAutoTitle.current = null
    setActiveSession(null)
    setConnected(false)
    setDraft('')
    editingPrompt?.savedAttachments.forEach(revokeAttachmentPreview)
    setEditingPrompt(null)
    setSelectedToolId(null)
    clearAttachments()
    clearMessagePreviews()
    dispatch({ type: 'restore', history: [] })
    teamDispatch({ type: 'reset' })
    setTeamActivity([])
    setTeamCreateRequest(null)
  }, [clearAttachments, clearMessagePreviews, editingPrompt])

  const ensureSession = useCallback(async (): Promise<Connection | null> => {
    if (connection.current) return connection.current
    setSessionOperation(true)
    setRuntimeSettingsError(null)
    try {
      const opened = await window.bingoGui.openSession({ sessionId: null })
      if (!opened.ok) {
        setRuntimeSettingsError(opened.error)
        return null
      }
      acceptOpenedSession(opened.value)
      await refreshSessions()
      return connection.current
    } finally {
      setSessionOperation(false)
    }
  }, [acceptOpenedSession, refreshSessions])

  const connect = useCallback(async (): Promise<void> => {
    if (connectInFlight.current) return
    connectInFlight.current = true
    setFlowError(null)
    try {
      const [info, probe, workspaces] = await Promise.all([
        withTimeout(window.bingoGui.getAppInfo(), 12_000),
        withTimeout(window.bingoGui.probeRuntime(), 12_000),
        withTimeout(window.bingoGui.getWorkspaces(), 12_000)
      ])
      if (info.ok) setAppInfo(info.value)
      if (workspaces.ok) setWorkspacePreferences(workspaces.value)
      if (!probe.ok) { setFlowError(probe.error); return }
      setRuntime(probe.value)
      setCapabilities(probe.value.capabilities ?? [])
      await Promise.all([refreshSessions(), loadRuntimeSettings(probe.value)])
    } catch {
      setFlowError({ code: 'CONNECTION_TIMEOUT', msg: '12 秒内未能连接 Bingo，请检查二进制和工作区后重试。', level: 'flow', recoverable: true, action: 'retry' })
    } finally {
      connectInFlight.current = false
    }
  }, [loadRuntimeSettings, refreshSessions])

  useEffect(() => {
    const unsubscribe = window.bingoGui.onSessionEvent((event: RendererSessionEvent) => {
      const current = connection.current
      if (!current || event.connectionId !== current.id || event.sequence !== current.sequence + 1) return
      if ('turnId' in event.payload && event.payload.turnId && activeTurnId.current && event.payload.turnId !== activeTurnId.current) return
      current.sequence = event.sequence
      if (event.payload.type === 'transport.error') {
        handleTransportError(event.payload.error.code, event.payload.error.msg)
        return
      }
      const payload = event.payload as CliEvent
      if (payload.type === 'turn.started' && payload.turnId === activeTurnId.current && autoTitleEligible.current) {
        const pending = pendingAutoTitle.current
        pendingAutoTitle.current = null
        autoTitleEligible.current = false
        if (pending?.turnId === payload.turnId) {
          setActiveSession((active) => active ? { ...active, name: pending.title } : active)
          setSessions((items) => items.map((item) => item.id === payload.sessionId ? { ...item, name: pending.title } : item))
        }
      }
      if (payload.type === 'team.snapshot' || payload.type === 'team.updated' || payload.type === 'team.avatar.imported' || payload.type === 'team.preset.imported' || payload.type === 'team.member.configured' || payload.type === 'agent.updated' || payload.type === 'channel.updated') {
        teamDispatch({ type: 'snapshot', snapshot: payload.snapshot })
        return
      }
      if (payload.type === 'channel.message') {
        teamDispatch({ type: 'channel-message', channel: payload.channel, message: payload.message })
        return
      }
      if (payload.type === 'team.tasks.snapshot') {
        teamDispatch({ type: 'tasks', branch: payload.branch, tasks: payload.tasks })
        return
      }
      if (payload.type === 'team.lobby.snapshot') {
        teamDispatch({ type: 'lobby', lobby: payload.lobby })
        return
      }
      if (payload.type === 'team.lobby.message') {
        teamDispatch({ type: 'lobby-message', message: payload.message })
        return
      }
      if (payload.type === 'team.task.updated') {
        teamDispatch({ type: 'task-summary', task: payload.task })
        if (payload.detail) teamDispatch({ type: 'task-detail', task: payload.detail })
        return
      }
      if (payload.type === 'team.task.message') {
        teamDispatch({ type: 'task-message', taskId: payload.taskId, message: payload.message })
        return
      }
      if (payload.type === 'team.member.updated') {
        teamDispatch({ type: 'member', member: payload.member, runtime: { status: payload.status, taskId: payload.taskId } })
        return
      }
      if (payload.type === 'tool.ready') setSelectedToolId(payload.toolCallId)
      if (payload.type === 'turn.completed' || payload.type === 'turn.cancelled' || (payload.type === 'error' && payload.scope === 'turn')) {
        activeTurnId.current = null
      }
      dispatch({ type: 'event', event: payload })
    })
    void connect()
    return unsubscribe
  }, [connect, handleTransportError])

  const openSession = async (summary: SessionSummary): Promise<void> => {
    if (state.turnId || sessionOperation || attachmentOperation || editingPrompt || activeSession?.id === summary.id) return
    setSessionOperation(true)
    setFlowError(null)
    let opened = summary.workspacePath
      ? await window.bingoGui.openSession({ sessionId: summary.id })
      : await openSessionWithWorkspaceBinding(summary, false)
    if (!opened.ok && opened.error.code === 'SESSION_WORKSPACE_UNAVAILABLE') opened = await openSessionWithWorkspaceBinding(summary, true)
    setSessionOperation(false)
    if (!opened.ok) {
      if (opened.error.code !== 'OPERATION_CANCELED') setRuntimeSettingsError(opened.error)
      return
    }
    setDraft('')
    clearAttachments()
    clearMessagePreviews()
    acceptOpenedSession(opened.value, summary)
    await loadRuntimeSettings(opened.value.runtime, { provider: opened.value.metadata.provider, model: opened.value.metadata.model, thinkingLevel: opened.value.metadata.thinkingLevel, permissionMode: permissionModeValue(opened.value.metadata.permissionMode) })
    await refreshSessions()
    if (opened.value.warnings?.length) void message.warning(opened.value.warnings.join('\n'))
  }

  const openSessionWithWorkspaceBinding = async (summary: SessionSummary, relocating: boolean): ReturnType<typeof window.bingoGui.openSession> => {
    const currentPath = workspacePreferences?.currentPath ?? runtime?.workspacePath
    if (!currentPath) return window.bingoGui.openSession({ sessionId: summary.id, chooseWorkspace: true, bindWorkspace: true })
    const choice = await new Promise<'current' | 'other'>((resolve) => modal.confirm({
      title: relocating ? '项目路径不可用' : '为对话选择项目',
      content: relocating
        ? `原项目路径无法打开：${summary.workspacePath ?? '未知路径'}。请选择新的项目位置。`
        : '该旧对话尚未关联项目。请选择当前项目，或从磁盘选择其他项目。',
      okText: `使用当前项目 · ${workspaceName(currentPath)}`,
      cancelText: '选择其他目录',
      closable: false,
      mask: { closable: false },
      keyboard: false,
      onOk: () => resolve('current'),
      onCancel: () => resolve('other')
    }))
    return choice === 'current'
      ? window.bingoGui.openSession({ sessionId: summary.id, workspacePath: currentPath, bindWorkspace: true })
      : window.bingoGui.openSession({ sessionId: summary.id, chooseWorkspace: true, bindWorkspace: true })
  }

  const newConversation = async (): Promise<void> => {
    if (state.turnId || sessionOperation || attachmentOperation || editingPrompt) return
    const active = connection.current
    resetConversation()
    if (!active) return
    setSessionOperation(true)
    await window.bingoGui.closeSession({ connectionId: active.id })
    setSessionOperation(false)
  }

  const renameConversation = async (session: SessionSummary, name: string): Promise<boolean> => {
    if (!name.trim() || editingPrompt) return false
    setSessionMutationError(null)
    const result = await window.bingoGui.renameSession({ sessionId: session.id, name: name.trim() })
    if (!result.ok) {
      setSessionMutationError(result.error)
      void message.error(result.error.msg)
      return false
    }
    setSessions((current) => current.map((item) => item.id === result.value.previousId ? result.value.session : item))
    if (activeSession?.id === result.value.previousId) {
      autoTitleEligible.current = false
      pendingAutoTitle.current = null
      setActiveSession(result.value.session)
    }
    void message.success('对话已重命名')
    return true
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteSession || editingPrompt) return
    setSessionMutationError(null)
    setSessionOperation(true)
    const result = await window.bingoGui.deleteSession({ sessionId: deleteSession.id })
    setSessionOperation(false)
    if (!result.ok) { setSessionMutationError(result.error); return }
    const deletedActive = activeSession?.id === result.value.deletedId
    setSessions((current) => current.filter((item) => item.id !== result.value.deletedId))
    setDeleteSession(null)
    void message.success('对话已删除')
    if (deletedActive) resetConversation()
  }

  const deleteConversations = (targets: SessionSummary[]): void => {
    if (targets.length === 0 || state.turnId || sessionOperation || editingPrompt) return
    modal.confirm({
      title: `删除选中的 ${targets.length} 个对话？`,
      content: '这会永久删除对应的 Bingo transcripts，操作无法撤销。',
      okText: `删除 ${targets.length} 个对话`,
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const activeId = activeSession?.id
        const ordered = [...targets].sort((left, right) => Number(left.id === activeId) - Number(right.id === activeId))
        const deleted = new Set<string>()
        setSessionOperation(true)
        try {
          for (const target of ordered) {
            const result = await window.bingoGui.deleteSession({ sessionId: target.id })
            if (!result.ok) throw new Error(result.error.msg)
            deleted.add(result.value.deletedId)
          }
        } catch (error) {
          if (activeId && deleted.has(activeId)) resetConversation()
          await refreshSessions()
          void message.error(error instanceof Error ? error.message : '批量删除失败')
          throw error
        } finally {
          setSessionOperation(false)
        }
        setSessions((current) => current.filter((item) => !deleted.has(item.id)))
        if (activeId && deleted.has(activeId)) resetConversation()
        void message.success(`已删除 ${deleted.size} 个对话`)
      }
    })
  }

  const changeProvider = async (provider: string): Promise<void> => {
    if (!runtime) return
    setSelectedProvider(provider)
    setSelectedModel('')
    setModels([])
    setRuntimeSettingsError(null)
    const result = await window.bingoGui.listModels({ workspacePath: runtime.workspacePath, provider })
    if (!result.ok) { setRuntimeSettingsError(result.error); return }
    setModels(uniqueModels(result.value.models))
    setSelectedModel(result.value.models[0] ?? '')
    setRuntimeSettingsError(result.value.warning ?? null)
  }

  const saveRuntime = async (nextPermissionMode = permissionMode, preserveProfileDraft = false): Promise<void> => {
    if (!runtime || !runtimeSettings) return
    const provider = preserveProfileDraft ? runtimeSettings.provider : selectedProvider
    const model = (preserveProfileDraft ? runtimeSettings.model : selectedModel).trim()
    const nextThinkingLevel = preserveProfileDraft ? runtimeSettings.thinkingLevel : thinkingLevel
    if (!provider || !model) return
    setSavingRuntime(true)
    setRuntimeSettingsError(null)
    const result = await window.bingoGui.saveRuntimeSettings({ workspacePath: runtime.workspacePath, provider, model, thinkingLevel: nextThinkingLevel, permissionMode: nextPermissionMode })
    setSavingRuntime(false)
    if (!result.ok) { setRuntimeSettingsError(result.error); return }
    setRuntimeSettings(result.value.settings)
    setPermissionMode(result.value.settings.permissionMode)
    if (!preserveProfileDraft) {
      setSelectedModel(model)
      setModels((current) => uniqueModels(current, model))
    }
    if (result.value.connectionId) {
      connection.current = { id: result.value.connectionId, sequence: 0 }
      dispatch({ type: 'context', contextUsage: result.value.contextUsage ?? null })
      setConnected(true)
      resetAttachmentRegistrations()
    }
    void message.success('运行配置已应用')
  }

  const changePermissionMode = async (next: PermissionMode): Promise<void> => {
    if (next === permissionMode) return
    if (next === 'bypassPermissions') {
      const confirmed = await new Promise<boolean>((resolve) => modal.confirm({
        title: '启用完全访问？',
        content: 'Bingo 将绕过大部分工具审批，可访问网络和工作区文件；敏感路径及显式 Ask 规则仍可能要求确认。',
        okText: '启用完全访问',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      }))
      if (!confirmed) return
    }
    await saveRuntime(next, true)
  }

  const addAttachments = async (files: File[]): Promise<void> => {
    if (attachmentOperation || state.turnId || sessionOperation) return
    if (!capabilities.includes(ATTACHMENTS_CAPABILITY)) {
      void message.warning('当前 Bingo 版本不支持图片附件')
      return
    }
    const provider = runtimeSettings?.providers.find((item) => item.name === selectedProvider)
    if (!provider?.supportsImages) {
      void message.warning('当前 Provider 不支持图片，请先切换 Provider')
      return
    }
    const available = Math.max(0, MAX_ATTACHMENTS - attachmentDraft.current.length)
    if (available === 0) {
      void message.warning(`每条消息最多添加 ${MAX_ATTACHMENTS} 张图片`)
      return
    }
    if (files.length > available) void message.warning(`本次只添加前 ${available} 张图片`)
    setAttachmentOperation(true)
    try {
      const results = await Promise.allSettled(files.slice(0, available).map(prepareComposerAttachment))
      const prepared = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : '图片读取失败'] : [])
      const remaining = Math.max(0, MAX_ATTACHMENTS - attachmentDraft.current.length)
      const accepted = prepared.slice(0, remaining)
      prepared.slice(remaining).forEach(revokeAttachmentPreview)
      if (accepted.length > 0) commitAttachments([...attachmentDraft.current, ...accepted])
      if (errors.length > 0) void message.error(errors.join('\n'))
    } finally {
      setAttachmentOperation(false)
    }
  }

  const removeAttachment = (id: string): void => {
    const target = attachmentDraft.current.find((attachment) => attachment.id === id)
    if (target) revokeAttachmentPreview(target)
    commitAttachments(attachmentDraft.current.filter((attachment) => attachment.id !== id))
  }

  const restoreComposerAttachments = (items: MessageImageAttachment[] | undefined): ComposerImageAttachment[] => (items ?? []).flatMap((attachment) => {
    const data = attachment.data ?? dataUrlBase64(attachment.dataUrl)
    if (!data) return []
    return [{
      id: crypto.randomUUID(),
      name: attachment.name ?? '历史图片',
      mediaType: attachment.mediaType,
      size: Math.floor(data.length * 0.75),
      data,
      previewUrl: attachment.dataUrl,
      status: 'ready' as const
    }]
  })

  const beginEditPrompt = async (target: ChatMessage): Promise<void> => {
    if (!activeSession || state.turnId || sessionOperation || attachmentOperation || editingPrompt || !capabilities.includes(SESSION_FORK_CAPABILITY) || !target.editable) return
    const replace = draft.trim() || attachmentDraft.current.length > 0
      ? await new Promise<boolean>((resolve) => modal.confirm({
          title: '替换当前草稿？',
          content: '编辑期间会暂存当前文字和附件；取消编辑时会恢复。',
          okText: '开始编辑',
          cancelText: '保留草稿',
          onOk: () => resolve(true),
          onCancel: () => resolve(false)
        }))
      : true
    if (!replace) return
    const restored = restoreComposerAttachments(target.attachments)
    setEditingPrompt({ sourceSessionId: activeSession.id, message: target, savedDraft: draft, savedAttachments: attachmentDraft.current, forked: false })
    setDraft(target.markdown)
    commitAttachments(restored)
  }

  const cancelEditPrompt = (): void => {
    if (!editingPrompt) return
    attachmentDraft.current.forEach(revokeAttachmentPreview)
    setDraft(editingPrompt.savedDraft)
    commitAttachments(editingPrompt.savedAttachments)
    setEditingPrompt(null)
  }

  const forkForEdit = async (): Promise<Connection | null> => {
    if (!editingPrompt) return connection.current
    if (editingPrompt.forked) return connection.current
    setSessionOperation(true)
    try {
      const result = await window.bingoGui.forkSession({
        sourceSessionId: editingPrompt.sourceSessionId,
        reason: 'edit-last-prompt',
        ...(editingPrompt.message.turnId && editingPrompt.message.revision
          ? { sourceTurnId: editingPrompt.message.turnId, sourceRevision: editingPrompt.message.revision }
          : {})
      })
      if (!result.ok) {
        void message.error(result.error.msg)
        return null
      }
      acceptOpenedSession(result.value)
      resetAttachmentRegistrations()
      setEditingPrompt((current) => current ? { ...current, forked: true } : current)
      await refreshSessions()
      if (result.value.warnings?.length) void message.warning(result.value.warnings.join('\n'))
      return connection.current
    } finally {
      setSessionOperation(false)
    }
  }

  const copyMessage = async (target: ChatMessage): Promise<void> => {
    if (!target.markdown) return
    try {
      const result = await window.bingoGui.writeClipboardText({ text: target.markdown })
      if (!result.ok) throw new Error(result.error.msg)
      void message.success('已复制消息')
    } catch {
      void message.error('复制失败，请检查剪贴板权限')
    }
  }

  const submitWithComposer = async (value: string, initialAttachments: ComposerImageAttachment[], options: { edit?: boolean; preserveComposer?: boolean } = {}): Promise<boolean> => {
    let working = initialAttachments
    if ((!value && working.length === 0) || state.turnId || sessionOperation || attachmentOperation || !runtimeSettings) return false
    if (working.length > 0) {
      if (!capabilities.includes(ATTACHMENTS_CAPABILITY)) {
        void message.error('当前 Bingo 版本不支持图片附件，请移除图片后重试')
        return false
      }
      const provider = runtimeSettings.providers.find((item) => item.name === selectedProvider)
      if (!provider?.supportsImages) {
        void message.error('当前 Provider 不支持图片，请切换到支持图片的 Provider')
        return false
      }
      if (working.some((attachment) => attachment.status === 'preparing' || attachment.status === 'uploading')) return false
    }
    const active = options.edit ? await forkForEdit() : connection.current ?? await ensureSession()
    if (!active) return false
    if (working.length > 0) {
      setAttachmentOperation(true)
      for (const attachment of working) {
        if (attachment.marker) continue
        working = working.map((item) => item.id === attachment.id ? { ...item, status: 'uploading' } : item)
        commitAttachments(working)
        const registered = await window.bingoGui.addAttachment({ connectionId: active.id, attachmentId: attachment.id, data: attachment.data })
        if (!registered.ok) {
          working = working.map((item) => item.id === attachment.id ? { ...item, status: 'error', error: registered.error.msg } : item)
          commitAttachments(working)
          setAttachmentOperation(false)
          void message.error(registered.error.msg)
          return false
        }
        working = working.map((item) => item.id === attachment.id ? {
          ...item,
          status: 'uploaded',
          marker: registered.value.marker,
          normalizedMediaType: registered.value.mediaType,
          error: undefined
        } : item)
        commitAttachments(working)
      }
      setAttachmentOperation(false)
    }
    const wirePrompt = [value, ...working.flatMap((attachment) => attachment.marker ? [attachment.marker] : [])].filter(Boolean).join('\n\n')
    if (!wirePrompt) return false
    const turnId = crypto.randomUUID()
    const title = autoTitleEligible.current ? conversationTitle({ text: value, hasAttachments: working.length > 0 }) : undefined
    if (title) pendingAutoTitle.current = { turnId, title }
    activeTurnId.current = turnId
    dispatch({
      type: 'submit',
      turnId,
      prompt: value,
      attachments: working.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        mediaType: attachment.mediaType,
        dataUrl: attachment.previewUrl
      }))
    })
    const result = await runSessionOperation(window.bingoGui.sendTurn({ connectionId: active.id, turnId, prompt: wirePrompt, ...(title ? { autoTitle: title } : {}) }))
    if (!result) {
      if (pendingAutoTitle.current?.turnId === turnId) pendingAutoTitle.current = null
      return false
    }
    if (!result.ok) {
      activeTurnId.current = null
      if (pendingAutoTitle.current?.turnId === turnId) pendingAutoTitle.current = null
      if (result.error.code === 'CONNECTION_STALE') handleTransportError(result.error.code, result.error.msg)
      else dispatch({ type: 'submit-failed', turnId, code: result.error.code, msg: result.error.msg })
      return false
    }
    if (!options.preserveComposer) {
      setDraft('')
      working.forEach((attachment) => messagePreviewUrls.current.add(attachment.previewUrl))
      commitAttachments([])
    }
    if (options.edit && editingPrompt) {
      editingPrompt.savedAttachments.forEach(revokeAttachmentPreview)
      setEditingPrompt(null)
    }
    return true
  }

  const submit = async (messageText?: string): Promise<void> => {
    const value = (messageText ?? draft).trim()
    await submitWithComposer(value, attachmentDraft.current, { edit: Boolean(editingPrompt) })
  }

  const continueTask = async (): Promise<void> => {
    const recovery = state.recovery
    if (!recovery || state.turnId || sessionOperation || attachmentOperation || editingPrompt || recoveryOperation.current) return
    recoveryOperation.current = recovery.turnId
    try {
      if (recovery.kind === 'transport-crash') {
        if (!activeSession || !capabilities.includes(SESSION_FORK_CAPABILITY)) return
        setSessionOperation(true)
        const result = await window.bingoGui.forkSession({ sourceSessionId: activeSession.id, reason: 'recover-interrupted' })
        setSessionOperation(false)
        if (!result.ok) { void message.error(result.error.msg); return }
        acceptOpenedSession(result.value)
        resetAttachmentRegistrations()
        await refreshSessions()
        if (result.value.warnings?.length) void message.warning(result.value.warnings.join('\n'))
        await submitWithComposer(RECOVER_CONTINUE_PROMPT, [], { preserveComposer: true })
        return
      }
      await submitWithComposer(CONTINUE_PROMPT, [], { preserveComposer: true })
    } finally {
      recoveryOperation.current = null
      setSessionOperation(false)
    }
  }

  const cancel = async (): Promise<void> => {
    const active = connection.current
    if (!active || !state.turnId) return
    const result = await runSessionOperation(window.bingoGui.cancelTurn({ connectionId: active.id, turnId: state.turnId }))
    if (!result) return
    if (!result.ok) {
      if (result.error.code === 'CONNECTION_STALE') handleTransportError(result.error.code, result.error.msg)
      else dispatch({ type: 'transport-error', code: result.error.code, msg: result.error.msg })
    }
  }

  const respond = async (response: PromptResponse): Promise<void> => {
    const active = connection.current
    const prompt = state.prompts[0]
    if (!active || !prompt) return
    const result = await runSessionOperation(window.bingoGui.respondToPrompt({ connectionId: active.id, turnId: prompt.turnId, promptId: prompt.promptId, response }))
    if (!result) return
    if (!result.ok) {
      if (result.error.code === 'CONNECTION_STALE') handleTransportError(result.error.code, result.error.msg)
      else dispatch({ type: 'transport-error', code: result.error.code, msg: result.error.msg })
    }
  }

  const loadSettings = async (): Promise<void> => {
    if (!runtime) return
    setSettingsError(null)
    const result = await window.bingoGui.readSettings({ workspacePath: runtime.workspacePath })
    if (!result.ok) { setSettingsError(result.error); return }
    setSettingsSnapshot(result.value)
    setSettingsDraft(result.value.values)
  }

  const applySettingsResult = (result: { connectionId?: string; contextUsage?: SessionOpened['contextUsage']; snapshot: SettingsSnapshot }): void => {
    setSettingsSnapshot(result.snapshot)
    setSettingsDraft(result.snapshot.values)
    setRuntimeSettings({ providers: result.snapshot.providers, provider: result.snapshot.values.provider, model: result.snapshot.values.model, thinkingLevel: result.snapshot.values.thinkingLevel, permissionMode: result.snapshot.values.permissionMode, theme: result.snapshot.values.theme })
    setSelectedProvider(result.snapshot.values.provider)
    setSelectedModel(result.snapshot.values.model)
    setPermissionMode(result.snapshot.values.permissionMode)
    setModels((current) => uniqueModels(current, result.snapshot.values.model))
    if (result.connectionId) {
      connection.current = { id: result.connectionId, sequence: 0 }
      dispatch({ type: 'context', contextUsage: result.contextUsage ?? null })
      setConnected(true)
      resetAttachmentRegistrations()
    }
  }

  const saveSettings = async (): Promise<boolean> => {
    if (!runtime || !settingsSnapshot || !settingsDraft) return false
    const dangerousPermission = settingsDraft.permissionMode === 'dontAsk' || settingsDraft.permissionMode === 'bypassPermissions'
    if (dangerousPermission && settingsDraft.permissionMode !== settingsSnapshot.values.permissionMode) {
      const confirmed = await new Promise<boolean>((resolve) => modal.confirm({
        title: '确认高风险权限模式',
        content: `${settingsDraft.permissionMode} 会减少或绕过部分交互确认。该选择只写入 Bingo 用户设置。`,
        okText: '确认保存',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      }))
      if (!confirmed) return false
    }
    setSettingsOperation(true)
    setSettingsError(null)
    const result = await window.bingoGui.saveSettings({ workspacePath: runtime.workspacePath, baseRevision: settingsSnapshot.revision, values: settingsDraft })
    setSettingsOperation(false)
    if (!result.ok) { setSettingsError(result.error); return false }
    applySettingsResult(result.value)
    return true
  }

  const upsertProvider = async (provider: ProviderSettingsInput): Promise<boolean> => {
    if (!runtime || !settingsSnapshot) return false
    setSettingsOperation(true)
    setSettingsError(null)
    const result = await window.bingoGui.upsertProvider({ workspacePath: runtime.workspacePath, baseRevision: settingsSnapshot.revision, provider })
    setSettingsOperation(false)
    if (!result.ok) { setSettingsError(result.error); return false }
    applySettingsResult(result.value)
    return true
  }

  const removeProvider = async (name: string, fallback?: { provider: string; model: string }): Promise<boolean> => {
    if (!runtime || !settingsSnapshot) return false
    setSettingsOperation(true)
    setSettingsError(null)
    const result = await window.bingoGui.removeProvider({ workspacePath: runtime.workspacePath, baseRevision: settingsSnapshot.revision, name, fallback })
    setSettingsOperation(false)
    if (!result.ok) { setSettingsError(result.error); return false }
    applySettingsResult(result.value)
    return true
  }

  const upsertMcp = async (server: McpServerSettingsInput): Promise<boolean> => {
    if (!runtime || !settingsSnapshot) return false
    setSettingsOperation(true)
    setSettingsError(null)
    const result = await window.bingoGui.upsertMcpServer({ workspacePath: runtime.workspacePath, baseRevision: settingsSnapshot.revision, server })
    setSettingsOperation(false)
    if (!result.ok) { setSettingsError(result.error); return false }
    applySettingsResult(result.value)
    return true
  }

  const removeMcp = async (name: string): Promise<boolean> => {
    if (!runtime || !settingsSnapshot) return false
    setSettingsOperation(true)
    setSettingsError(null)
    const result = await window.bingoGui.removeMcpServer({ workspacePath: runtime.workspacePath, baseRevision: settingsSnapshot.revision, name })
    setSettingsOperation(false)
    if (!result.ok) { setSettingsError(result.error); return false }
    applySettingsResult(result.value)
    return true
  }

  const listModels = useCallback(async (provider: string): Promise<ModelListOutput | null> => {
    if (!runtime) return null
    setSettingsError(null)
    const result = await window.bingoGui.listModels({ workspacePath: runtime.workspacePath, provider })
    if (!result.ok) { setSettingsError(result.error); return null }
    setSettingsError(result.value.warning ?? null)
    return { ...result.value, models: uniqueModels(result.value.models) }
  }, [runtime])

  const acceptTeamSnapshot = (snapshot: TeamSnapshot): void => { teamDispatch({ type: 'snapshot', snapshot }) }

  const teamUnavailable = (): GuiError => ({ code: 'CAPABILITY_UNAVAILABLE', msg: `当前 Bingo 版本未提供 ${TEAM_WORKSPACE_CAPABILITY}；Chat 仍可正常使用。`, level: 'page', recoverable: true })
  const loadTeam = async (): Promise<void> => {
    if (!capabilities.includes(TEAM_WORKSPACE_CAPABILITY)) { setTeamError(teamUnavailable()); return }
    const active = connection.current ?? await ensureSession()
    if (!active) return
    setTeamOperation(true)
    setTeamError(null)
    const taskCapability = capabilities.includes(TEAM_TASKS_CAPABILITY)
    if (!teamV2Capability) teamDispatch({ type: 'section', section: 'rooms' })
    const lobbyCapability = capabilities.includes(TEAM_LOBBY_CAPABILITY)
    const [result, taskResult, definitionResult, lobbyResult] = await Promise.all([
      window.bingoGui.readTeam({ connectionId: active.id }),
      taskCapability ? window.bingoGui.listTeamTasks({ connectionId: active.id }) : Promise.resolve(null),
      taskCapability ? window.bingoGui.listAgentDefinitions({ connectionId: active.id }) : Promise.resolve(null),
      lobbyCapability ? window.bingoGui.getTeamLobby({ connectionId: active.id, limit: 100 }) : Promise.resolve(null)
    ])
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return }
    acceptTeamSnapshot(result.value)
    if (taskResult) {
      if (taskResult.ok) teamDispatch({ type: 'tasks', branch: taskResult.value.branch, tasks: taskResult.value.tasks })
      else setTeamError(taskResult.error)
    }
    if (definitionResult) {
      if (definitionResult.ok) teamDispatch({ type: 'definitions', definitions: definitionResult.value })
      else setTeamError(definitionResult.error)
    }
    if (lobbyResult) {
      if (lobbyResult.ok) teamDispatch({ type: 'lobby', lobby: lobbyResult.value })
      else setTeamError(lobbyResult.error)
    }
  }

  const runTeam = async (operation: (connectionId: string) => ReturnType<typeof window.bingoGui.readTeam>, success?: string): Promise<boolean> => {
    const active = connection.current
    if (!active) return false
    setTeamOperation(true)
    setTeamError(null)
    const result = await operation(active.id)
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return false }
    acceptTeamSnapshot(result.value)
    if (success) void message.success(success)
    return true
  }

  const validateTeam = async (): Promise<void> => {
    const active = connection.current
    if (!active) return
    setTeamOperation(true)
    const result = await window.bingoGui.validateTeam({ connectionId: active.id })
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return }
    if (result.value.valid) void message.success(result.value.msg)
    else void message.warning(result.value.msg)
  }

  const saveTeam = async (definition: TeamDefinition): Promise<boolean> => {
    if (!teamState.snapshot) return false
    return runTeam((connectionId) => window.bingoGui.saveTeam({ connectionId, baseRevision: teamState.snapshot!.revision, definition }), 'Team 蓝图已保存')
  }
  const messageMember = (member: string, text: string): Promise<boolean> => runTeam((connectionId) => window.bingoGui.messageTeamMember({ connectionId, member, message: text }), '消息已发送')
  const postChannel = (channel: string, text: string): Promise<boolean> => runTeam((connectionId) => window.bingoGui.postTeamChannel({ connectionId, channel, text }))
  const postLobby = (text: string, targets: string[]): Promise<boolean> => runTaskOperation(
    (connectionId) => window.bingoGui.postTeamLobby({ connectionId, text, targets }),
    (lobby) => teamDispatch({ type: 'lobby', lobby })
  )
  const importTeamAvatar = async (fileName: string, data: string): Promise<string | null> => {
    const active = connection.current
    if (!active) return null
    setTeamOperation(true)
    setTeamError(null)
    const result = await window.bingoGui.importTeamAvatar({ connectionId: active.id, fileName, data })
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return null }
    acceptTeamSnapshot(result.value.snapshot)
    return result.value.avatar
  }
  const chooseTeamPreset = async (): Promise<{ data: string; preview: import('../../shared/contracts/cli').TeamPresetPreview } | null> => {
    const active = connection.current
    if (!active) return null
    setTeamOperation(true)
    setTeamError(null)
    const result = await window.bingoGui.chooseTeamPreset({ connectionId: active.id })
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return null }
    return result.value.canceled ? null : { data: result.value.data, preview: result.value.preview }
  }
  const importTeamPreset = async (data: string, resolutions: Record<string, 'update' | 'keep'>, modelMappings: Record<string, TeamPresetModelMapping>): Promise<boolean> => {
    const active = connection.current
    if (!active || !teamState.snapshot) return false
    setTeamOperation(true)
    setTeamError(null)
    const result = await window.bingoGui.importTeamPreset({ connectionId: active.id, data, baseRevision: teamState.snapshot.revision, resolutions, modelMappings })
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return false }
    acceptTeamSnapshot(result.value.snapshot)
    await loadAgentDefinitions()
    void message.success('Team 预设已导入')
    return true
  }
  const exportTeamPreset = async (): Promise<boolean> => {
    const active = connection.current
    if (!active) return false
    setTeamOperation(true)
    setTeamError(null)
    const result = await window.bingoGui.exportTeamPreset({ connectionId: active.id })
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return false }
    if (!result.value.canceled) void message.success('Team 预设已导出')
    return !result.value.canceled
  }
  const promoteTemporaryMember = (member: string): Promise<boolean> => runTaskOperation(
    (connectionId) => window.bingoGui.promoteTeamMember({ connectionId, member, baseRevision: teamState.snapshot?.revision ?? '' }),
    (result) => acceptTeamSnapshot(result.snapshot),
    '临时成员已固定'
  )
  const readActivity = async (member: string): Promise<void> => {
    const active = connection.current
    if (!active) return
    setTeamOperation(true)
    const result = await window.bingoGui.readTeamActivity({ connectionId: active.id, member })
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return }
    setTeamActivity(result.value.activity)
  }

  const runTaskOperation = async <T,>(operation: (connectionId: string) => Promise<{ ok: true; value: T } | { ok: false; error: GuiError }>, accept: (value: T) => void, success?: string): Promise<boolean> => {
    const active = connection.current
    if (!active) return false
    setTeamOperation(true)
    setTeamError(null)
    const result = await operation(active.id)
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return false }
    accept(result.value)
    if (success) void message.success(success)
    return true
  }

  const loadTeamTask = async (taskId: string, beforeSeq?: number): Promise<void> => {
    await runTaskOperation(
      (connectionId) => window.bingoGui.getTeamTask({ connectionId, taskId, beforeSeq, limit: 100 }),
      (task) => teamDispatch({ type: 'task-detail', task })
    )
  }
  const createTeamTask = (input: TeamTaskCreateInput): Promise<boolean> => runTaskOperation(
    (connectionId) => window.bingoGui.createTeamTask({ connectionId, ...input }),
    (task) => { teamDispatch({ type: 'task-detail', task }); teamDispatch({ type: 'select', selection: { kind: 'task', id: task.id } }) },
    '团队任务已开始'
  )
  const postTeamTask = (taskId: string, text: string): Promise<boolean> => runTaskOperation(
    (connectionId) => window.bingoGui.postTeamTask({ connectionId, taskId, text }),
    (task) => teamDispatch({ type: 'task-summary', task })
  )
  const pauseTeamTask = (taskId: string): Promise<boolean> => runTaskOperation(
    (connectionId) => window.bingoGui.pauseTeamTask({ connectionId, taskId }),
    (task) => teamDispatch({ type: 'task-summary', task }),
    '已请求暂停，当前回合结束后生效'
  )
  const resumeTeamTask = (taskId: string, resumeMessage?: string): Promise<boolean> => runTaskOperation(
    (connectionId) => window.bingoGui.resumeTeamTask({ connectionId, taskId, message: resumeMessage }),
    (task) => teamDispatch({ type: 'task-summary', task }),
    '任务已恢复'
  )
  const completeTeamTask = (taskId: string): Promise<boolean> => runTaskOperation(
    (connectionId) => window.bingoGui.completeTeamTask({ connectionId, taskId }),
    (task) => teamDispatch({ type: 'task-summary', task }),
    '任务已完成'
  )
  const cancelTeamTask = (taskId: string): Promise<boolean> => runTaskOperation(
    (connectionId) => window.bingoGui.cancelTeamTask({ connectionId, taskId }),
    (task) => teamDispatch({ type: 'task-summary', task }),
    '任务已取消'
  )
  const loadAgentDefinitions = async (): Promise<void> => {
    await runTaskOperation(
      (connectionId) => window.bingoGui.listAgentDefinitions({ connectionId }),
      (definitions) => teamDispatch({ type: 'definitions', definitions })
    )
  }
  const saveAgentDefinition = (role: AgentDefinitionDraft): Promise<boolean> => runTaskOperation(
    (connectionId) => window.bingoGui.saveAgentDefinition({
      connectionId,
      scope: role.scope,
      id: role.id,
      baseRevision: role.baseRevision,
      definition: { name: role.name, description: role.description, model: role.model, provider: role.provider, thinking: role.thinking, inheritSystem: role.inheritSystem, system: role.system, profile: role.profile }
    }),
    (definition) => {
      teamDispatch({ type: 'definition-upsert', definition })
      teamDispatch({ type: 'select', selection: { kind: 'role', id: definition.id, scope: definition.source } })
    },
    '角色已保存'
  )
  const archiveAgentDefinition = (definition: AgentDefinitionDocument): Promise<boolean> => runTaskOperation(
    (connectionId) => window.bingoGui.archiveAgentDefinition({ connectionId, scope: definition.source, id: definition.id, baseRevision: definition.revision }),
    () => teamDispatch({ type: 'definition-remove', scope: definition.source, id: definition.id }),
    '角色已归档'
  )

  const commitView = (next: AppView): void => {
    setView(next)
    if (next === 'settings') void loadSettings()
    if (next === 'team') void loadTeam()
  }

  const changeView = (next: AppView): void => {
    if (next === view) return
    if (view === 'settings' && settingsDirty) {
      setPendingSettingsNavigation({ view: next })
      return
    }
    commitView(next)
  }

  useEffect(() => window.bingoGui.onNotificationActivated((activation) => {
    if (connection.current?.id !== activation.connectionId || view === 'chat') return
    if (view === 'settings' && settingsDirty) {
      setPendingSettingsNavigation({ view: 'chat' })
      return
    }
    setView('chat')
  }), [settingsDirty, view])

  const changeSettingsSection = (next: SettingsSection): void => {
    if (next === settingsSection) return
    if (settingsDirty) {
      setPendingSettingsNavigation({ section: next })
      return
    }
    setSettingsSection(next)
  }

  const openGameSettings = (): void => {
    if (view === 'settings' && settingsDirty) {
      setPendingSettingsNavigation({ section: 'games' })
      return
    }
    setSettingsSection('games')
    commitView('settings')
  }

  const continueSettingsNavigation = (target: PendingSettingsNavigation): void => {
    setPendingSettingsNavigation(null)
    if ('view' in target) commitView(target.view)
    else if ('section' in target) setSettingsSection(target.section)
    else void selectWorkspace()
  }

  const discardAndContinueSettingsNavigation = (): void => {
    if (!pendingSettingsNavigation) return
    const target = pendingSettingsNavigation
    if (settingsSectionTransaction) settingsSectionTransaction.discard()
    else {
      if (!settingsSnapshot) return
      setSettingsDraft(settingsSnapshot.values)
    }
    continueSettingsNavigation(target)
  }

  const saveAndContinueSettingsNavigation = async (): Promise<void> => {
    if (!pendingSettingsNavigation || settingsNavigationSaving) return
    const target = pendingSettingsNavigation
    setSettingsNavigationSaving(true)
    try {
      const saved = settingsSectionTransaction ? await settingsSectionTransaction.save() : await saveSettings()
      if (saved) {
        void message.success('设置已保存')
        continueSettingsNavigation(target)
      }
    } finally {
      setSettingsNavigationSaving(false)
    }
  }

  const requestWorkspaceSelection = (): void => {
    if (view === 'settings' && settingsDirty) {
      setPendingSettingsNavigation({ action: 'workspace' })
      return
    }
    void selectWorkspace()
  }

  const selectWorkspace = async (path?: string): Promise<void> => {
    if (state.turnId || sessionOperation || settingsOperation || teamOperation || workspaceOperation || externalTerminalOperation || attachmentOperation || editingPrompt) return
    setWorkspaceOperation(true)
    try {
      const result = await withTimeout(window.bingoGui.selectWorkspace(path ? { path } : {}), 120_000)
      if (!result.ok) {
        void message.error(result.error.msg)
        return
      }
      setWorkspacePreferences(result.value.preferences)
      if (result.value.canceled) return
      setRuntime(result.value.runtime)
      setCapabilities(result.value.runtime.capabilities ?? [])
      setFlowError(null)
      if (result.value.changed) {
        resetConversation()
        setView('chat')
        setRuntimeSettings(null)
        setSelectedProvider('')
        setSelectedModel('')
        setPermissionMode('default')
        setModels([])
        setSettingsSnapshot(null)
        setSettingsDraft(null)
        setSettingsError(null)
        setTeamError(null)
        setDraft('')
      }
      await loadRuntimeSettings(result.value.runtime)
      if (view === 'settings') {
        const settingsResult = await window.bingoGui.readSettings({ workspacePath: result.value.runtime.workspacePath })
        if (settingsResult.ok) {
          setSettingsSnapshot(settingsResult.value)
          setSettingsDraft(settingsResult.value.values)
        } else setSettingsError(settingsResult.error)
      }
      void message.success(result.value.changed ? '工作区已切换' : '工作区保持不变')
    } catch {
      void message.error('选择工作区超时，请重试')
    } finally {
      setWorkspaceOperation(false)
    }
  }

  const openExternalTerminal = async (): Promise<void> => {
    if (!runtime || externalTerminalOperation || workspaceOperation) return
    setExternalTerminalOperation(true)
    try {
      const result = await withTimeout(window.bingoGui.openExternalTerminal(), 12_000)
      if (!result.ok) {
        void message.error(result.error.msg)
        return
      }
      void message.success(`已在 ${result.value.terminalName} 中打开工作区`)
    } catch {
      void message.error('打开外部终端超时，请重试')
    } finally {
      setExternalTerminalOperation(false)
    }
  }

  const resolveTeamAvatar = useCallback((avatar: string): Promise<string | null> => {
    const active = connection.current
    if (!active || !avatar.startsWith('project:') || !capabilities.includes(TEAM_AVATAR_READ_CAPABILITY)) return Promise.resolve(null)
    const key = `${active.id}:${avatar}`
    const cached = teamAvatarCache.current.get(key)
    if (cached) return cached
    const request = window.bingoGui.getTeamAvatar({ connectionId: active.id, avatar }).then((result) => {
      if (result.ok) return result.value.dataUrl
      teamAvatarCache.current.delete(key)
      return null
    }).catch(() => {
      teamAvatarCache.current.delete(key)
      return null
    })
    teamAvatarCache.current.set(key, request)
    return request
  }, [capabilities])

  if (flowError) return <Result status="error" title="无法连接 Bingo" subTitle={`${flowError.code} · ${flowError.msg}`} extra={<Space><Button type="primary" onClick={() => void connect()}>重试</Button><Button loading={workspaceOperation} onClick={() => void selectWorkspace()}>选择工作区</Button></Space>} />

  const sidebar = view === 'chat'
    ? <ConversationSidebar sessions={sessions} activeSession={activeSession} runtime={runtime} workspacePreferences={workspacePreferences} error={sessionListError} busy={Boolean(state.turnId) || sessionOperation || workspaceOperation || attachmentOperation || Boolean(editingPrompt)} onCreate={() => void newConversation()} onOpen={(session) => void openSession(session)} onRename={renameConversation} onDelete={(session) => { if (!editingPrompt) { setDeleteSession(session); setSessionMutationError(null) } }} onDeleteMany={deleteConversations} />
    : view === 'settings'
      ? <SettingsSidebar active={settingsSection} dirty={settingsDirty ? settingsSection : null} onChange={changeSettingsSection} />
      : <TeamSidebar state={teamState} teamV2Capability={teamV2Capability} onSectionChange={(section) => teamDispatch({ type: 'section', section })} onSelect={(selection) => { teamDispatch({ type: 'select', selection }); setTeamActivity([]); if (selection.kind === 'member') void readActivity(selection.id) }} onCreate={() => setTeamCreateRequest(teamState.section === 'tasks' ? 'task' : teamState.section === 'roles' ? 'role' : 'blueprint')} />
  const inspector = view === 'chat'
    ? <ChatInspector tools={state.tools} selectedToolId={selectedToolId} contextUsage={state.contextUsage} contextCapability={capabilities.includes('session.context.v1')} provider={selectedProvider} model={selectedModel} onSelectTool={setSelectedToolId} />
    : view === 'team'
      ? <TeamInspector state={teamState} activity={teamActivity} operationBusy={teamOperation} onRefreshChannel={(channel) => void runTeam((connectionId) => window.bingoGui.readTeamChannel({ connectionId, channel }))} onReadActivity={(member) => void readActivity(member)} onStopMember={(member) => void runTeam((connectionId) => window.bingoGui.stopTeamMember({ connectionId, member }), '成员已停止')} onRemoveMember={(member) => void runTeam((connectionId) => window.bingoGui.removeTeamMember({ connectionId, member }), '运行实例已移除')} onRestartMember={(member) => void runTeam((connectionId) => window.bingoGui.restartTeamMember({ connectionId, member }), '成员已重启')} onMarkUseful={(member) => void runTeam((connectionId) => window.bingoGui.markTeamMemberUseful({ connectionId, member }), '已标记为有用')} onPromoteMember={(member) => void promoteTemporaryMember(member)} />
      : undefined

  return <AvatarDataProvider resolve={resolveTeamAvatar}>
    <AppShell view={view} onViewChange={changeView} sidebar={sidebar} inspector={inspector} inspectorCollapsed={appearance.values.inspectorCollapsed} onInspectorCollapsedChange={(collapsed) => { void appearance.save({ ...appearance.values, inspectorCollapsed: collapsed }) }} workspacePath={runtime?.workspacePath} workspaceBusy={workspaceOperation} workspaceDisabled={Boolean(state.turnId) || sessionOperation || settingsOperation || teamOperation || externalTerminalOperation || attachmentOperation || Boolean(editingPrompt)} onSelectWorkspace={requestWorkspaceSelection} terminalBusy={externalTerminalOperation} terminalDisabled={!runtime || workspaceOperation} onOpenExternalTerminal={() => void openExternalTerminal()} onOpenGameSettings={openGameSettings}>
      {view === 'chat' && <ChatPage state={state} activeSession={activeSession} ready={Boolean(runtime && runtimeSettings)} connected={connected} sessionOperation={sessionOperation || workspaceOperation || attachmentOperation} runtimeSettings={runtimeSettings} selectedProvider={selectedProvider} selectedModel={selectedModel} models={models} thinkingLevel={thinkingLevel} permissionMode={permissionMode} settingsError={runtimeSettingsError} savingRuntime={savingRuntime} draft={draft} attachments={attachments} attachmentCapability={capabilities.includes(ATTACHMENTS_CAPABILITY)} forkCapability={capabilities.includes(SESSION_FORK_CAPABILITY)} editing={Boolean(editingPrompt)} workspacePreferences={workspacePreferences} workspaceBusy={workspaceOperation} selectedToolId={selectedToolId} onSelectTool={setSelectedToolId} onDraftChange={setDraft} onAddAttachments={(files) => void addAttachments(files)} onRemoveAttachment={removeAttachment} onWorkspaceChange={(path) => void selectWorkspace(path)} onProviderChange={(provider) => void changeProvider(provider)} onModelChange={setSelectedModel} onThinkingChange={setThinkingLevel} onPermissionModeChange={(mode) => void changePermissionMode(mode)} onSaveRuntime={() => void saveRuntime()} onSubmit={(value) => void submit(value)} onCancel={() => void cancel()} onRespond={(response) => void respond(response)} onCopyMessage={(target) => void copyMessage(target)} onEditMessage={(target) => void beginEditPrompt(target)} onCancelEdit={cancelEditPrompt} onContinue={() => void continueTask()} />}
      {view === 'settings' && <SettingsPage section={settingsSection} snapshot={settingsSnapshot} draft={settingsDraft} error={settingsError} runtime={runtime} appInfo={appInfo} busy={settingsOperation || sessionOperation || workspaceOperation || Boolean(state.turnId)} onChange={setSettingsDraft} onSave={saveSettings} onDiscard={() => { if (settingsSnapshot) setSettingsDraft(settingsSnapshot.values) }} onSectionTransactionChange={setSettingsSectionTransaction} onGoTeam={() => changeView('team')} onUpsertProvider={upsertProvider} onRemoveProvider={removeProvider} onUpsertMcp={upsertMcp} onRemoveMcp={removeMcp} onListModels={listModels} />}
      {view === 'team' && <TeamPage state={teamState} error={teamError} operationBusy={teamOperation || workspaceOperation} turnBusy={Boolean(state.turnId)} activity={teamActivity} taskCapability={capabilities.includes(TEAM_TASKS_CAPABILITY)} teamV2Capability={teamV2Capability} createRequest={teamCreateRequest} providers={runtimeSettings?.providers ?? []} onCreateRequestHandled={() => setTeamCreateRequest(null)} onRefresh={() => void loadTeam()} onValidate={() => void validateTeam()} onSave={saveTeam} onStart={() => void runTeam((connectionId) => window.bingoGui.startTeam({ connectionId }), 'Team 已启动')} onStop={() => void runTeam((connectionId) => window.bingoGui.stopTeam({ connectionId }), 'Team 已停止')} onMessage={messageMember} onPost={postChannel} onPostLobby={postLobby} onImportAvatar={importTeamAvatar} onChoosePreset={chooseTeamPreset} onImportPreset={importTeamPreset} onExportPreset={exportTeamPreset} onLoadTask={(taskId, beforeSeq) => void loadTeamTask(taskId, beforeSeq)} onCreateTask={createTeamTask} onPostTask={postTeamTask} onPauseTask={(taskId) => void pauseTeamTask(taskId)} onResumeTask={resumeTeamTask} onCompleteTask={(taskId) => void completeTeamTask(taskId)} onCancelTask={(taskId) => void cancelTeamTask(taskId)} onReloadDefinitions={() => void loadAgentDefinitions()} onListModels={listModels} onSaveDefinition={saveAgentDefinition} onArchiveDefinition={archiveAgentDefinition} />}
    </AppShell>
    <Modal open={Boolean(deleteSession)} title={`删除“${deleteSession?.name ?? ''}”？`} okText="删除对话" cancelText="取消" confirmLoading={sessionOperation} okButtonProps={{ danger: true }} onOk={() => void confirmDelete()} onCancel={() => setDeleteSession(null)}><Typography.Paragraph>这会永久删除 Bingo transcript，操作无法撤销。</Typography.Paragraph>{sessionMutationError && <Alert type="error" showIcon message={sessionMutationError.msg} />}</Modal>
    <Modal open={Boolean(pendingSettingsNavigation)} title="保存设置更改？" closable={!settingsOperation && !settingsNavigationSaving} maskClosable={false} keyboard={!settingsOperation && !settingsNavigationSaving} onCancel={() => setPendingSettingsNavigation(null)} footer={<Space><Button disabled={settingsOperation || settingsNavigationSaving} onClick={() => setPendingSettingsNavigation(null)}>继续编辑</Button><Button disabled={settingsOperation || settingsNavigationSaving} onClick={discardAndContinueSettingsNavigation}>放弃更改</Button><Button type="primary" loading={settingsOperation || settingsNavigationSaving} onClick={() => void saveAndContinueSettingsNavigation()}>保存并继续</Button></Space>}>
      <Typography.Paragraph>“{settingsSectionLabel(settingsSection)}”中的更改尚未保存。请选择如何继续。</Typography.Paragraph>
    </Modal>
  </AvatarDataProvider>
}

function settingsSectionLabel(section: SettingsSection): string {
  return { profile: '个人资料', general: '常规与运行', providers: 'API 供应商', permissions: '权限', team: 'Team 与协作', mcp: 'MCP', appearance: '外观', notifications: '通知', games: '小游戏', advanced: '高级', about: '关于' }[section]
}

function uniqueModels(models: string[], current = ''): string[] {
  return [...new Set([...models, current].map((model) => model.trim()).filter(Boolean))]
}

function permissionModeValue(value: string): PermissionMode {
  return value === 'acceptEdits' || value === 'plan' || value === 'dontAsk' || value === 'bypassPermissions' ? value : 'default'
}

function dataUrlBase64(value: string): string | null {
  const match = /^data:[^;,]+;base64,(.+)$/i.exec(value)
  return match?.[1] ?? null
}

function workspaceName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).at(-1) || path
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${milliseconds}ms`)), milliseconds)
    void promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error: unknown) => { clearTimeout(timer); reject(error) }
    )
  })
}
