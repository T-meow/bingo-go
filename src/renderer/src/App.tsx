import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { App as AntApp, Alert, Button, Modal, Result, Space, Typography } from 'antd'
import type { CliEvent, PromptResponse, TeamDefinition, TeamSnapshot } from '../../shared/contracts/cli'
import type {
  AppInfo, EditableSettings, GuiError, McpServerSettingsInput, ModelListOutput, ProviderSettingsInput, RendererSessionEvent,
  RuntimeInfo, RuntimeSettings, SessionOpened, SessionSummary, SettingsSnapshot, WorkspacePreferencesV2
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
import { TeamInspector, TeamPage, type TeamActivity } from './features/team/TeamPage'
import { TeamSidebar, type TeamSelection } from './features/team/TeamSidebar'
import { chatReducer, initialChatState } from './state/chatReducer'
import { useAppearance } from './theme/AppearanceProvider'

type Connection = { id: string; sequence: number }
type PendingSettingsNavigation = { view: AppView } | { section: SettingsSection } | { action: 'workspace' }

export default function App(): React.JSX.Element {
  const { message, modal } = AntApp.useApp()
  const appearance = useAppearance()
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<ComposerImageAttachment[]>([])
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [capabilities, setCapabilities] = useState<string[]>([])
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
  const [teamSnapshot, setTeamSnapshot] = useState<TeamSnapshot | null>(null)
  const [teamSelection, setTeamSelection] = useState<TeamSelection | null>(null)
  const [teamActivity, setTeamActivity] = useState<TeamActivity>([])
  const [teamError, setTeamError] = useState<GuiError | null>(null)
  const [teamOperation, setTeamOperation] = useState(false)
  const [flowError, setFlowError] = useState<GuiError | null>(null)
  const [connected, setConnected] = useState(false)
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null)
  const connection = useRef<Connection | null>(null)
  const activeTurnId = useRef<string | null>(null)
  const connectInFlight = useRef(false)
  const attachmentDraft = useRef<ComposerImageAttachment[]>([])
  const messagePreviewUrls = useRef(new Set<string>())
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

  const loadRuntimeSettings = useCallback(async (runtimeInfo: RuntimeInfo, preferred?: { provider: string; model: string; thinkingLevel: RuntimeSettings['thinkingLevel'] }): Promise<void> => {
    setRuntimeSettingsError(null)
    const loaded = await withTimeout(window.bingoGui.readRuntimeSettings({ workspacePath: runtimeInfo.workspacePath }), 12_000)
    if (!loaded.ok) { setRuntimeSettingsError(loaded.error); return }
    const provider = preferred?.provider ?? loaded.value.provider
    const model = preferred?.model ?? loaded.value.model
    const thinking = preferred?.thinkingLevel ?? loaded.value.thinkingLevel
    setRuntimeSettings(loaded.value)
    setSelectedProvider(provider)
    setSelectedModel(model)
    setThinkingLevel(thinking)
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
    setCapabilities(opened.metadata.capabilities ?? [])
    setActiveSession(summary ?? {
      id: opened.metadata.sessionId,
      name: opened.metadata.displayName,
      preview: '',
      updatedAt: new Date().toISOString(),
      messageCount: opened.history.length
    })
    dispatch({ type: 'restore', history: opened.history })
    setSelectedToolId(opened.history.flatMap((item) => item.type === 'tool' ? [item.value.id] : []).at(-1) ?? null)
    setTeamSnapshot(null)
    setTeamSelection(null)
    setTeamActivity([])
    setConnected(true)
  }, [])

  const resetConversation = useCallback((): void => {
    connection.current = null
    activeTurnId.current = null
    setActiveSession(null)
    setConnected(false)
    setDraft('')
    setSelectedToolId(null)
    clearAttachments()
    clearMessagePreviews()
    dispatch({ type: 'restore', history: [] })
    setTeamSnapshot(null)
    setTeamSelection(null)
    setTeamActivity([])
  }, [clearAttachments, clearMessagePreviews])

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
      if (payload.type === 'team.snapshot' || payload.type === 'team.updated' || payload.type === 'agent.updated' || payload.type === 'channel.updated') {
        setTeamSnapshot(payload.snapshot)
        return
      }
      if (payload.type === 'channel.message') {
        setTeamSnapshot((currentSnapshot) => currentSnapshot ? {
          ...currentSnapshot,
          channels: currentSnapshot.channels.map((channel) => channel.name === payload.channel && !channel.messages.some((item) => item.seq === payload.message.seq)
            ? { ...channel, seq: Math.max(channel.seq, payload.message.seq), messages: [...channel.messages, payload.message] }
            : channel)
        } : currentSnapshot)
        return
      }
      if (payload.type === 'tool.ready') setSelectedToolId(payload.toolCallId)
      dispatch({ type: 'event', event: payload })
    })
    void connect()
    return unsubscribe
  }, [connect, handleTransportError])

  const openSession = async (summary: SessionSummary): Promise<void> => {
    if (state.turnId || sessionOperation || attachmentOperation || activeSession?.id === summary.id) return
    setSessionOperation(true)
    connection.current = null
    setConnected(false)
    setFlowError(null)
    const opened = await window.bingoGui.openSession({ sessionId: summary.id })
    setSessionOperation(false)
    if (!opened.ok) { setRuntimeSettingsError(opened.error); return }
    setDraft('')
    clearAttachments()
    clearMessagePreviews()
    acceptOpenedSession(opened.value, summary)
    if (runtime) await loadRuntimeSettings(runtime, { provider: opened.value.metadata.provider, model: opened.value.metadata.model, thinkingLevel: opened.value.metadata.thinkingLevel })
  }

  const newConversation = async (): Promise<void> => {
    if (state.turnId || sessionOperation || attachmentOperation) return
    const active = connection.current
    resetConversation()
    if (!active) return
    setSessionOperation(true)
    await window.bingoGui.closeSession({ connectionId: active.id })
    setSessionOperation(false)
  }

  const renameConversation = async (session: SessionSummary, name: string): Promise<boolean> => {
    if (!name.trim()) return false
    setSessionMutationError(null)
    const result = await window.bingoGui.renameSession({ sessionId: session.id, name: name.trim() })
    if (!result.ok) {
      setSessionMutationError(result.error)
      void message.error(result.error.msg)
      return false
    }
    setSessions((current) => current.map((item) => item.id === result.value.previousId ? result.value.session : item))
    if (activeSession?.id === result.value.previousId) setActiveSession(result.value.session)
    void message.success('对话已重命名')
    return true
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteSession) return
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
    if (targets.length === 0 || state.turnId || sessionOperation) return
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

  const saveRuntime = async (): Promise<void> => {
    if (!runtime || !selectedProvider || !selectedModel) return
    setSavingRuntime(true)
    setRuntimeSettingsError(null)
    const model = selectedModel.trim()
    const result = await window.bingoGui.saveRuntimeSettings({ workspacePath: runtime.workspacePath, provider: selectedProvider, model, thinkingLevel })
    setSavingRuntime(false)
    if (!result.ok) { setRuntimeSettingsError(result.error); return }
    setRuntimeSettings(result.value.settings)
    setSelectedModel(model)
    setModels((current) => uniqueModels(current, model))
    if (result.value.connectionId) {
      connection.current = { id: result.value.connectionId, sequence: 0 }
      setConnected(true)
      resetAttachmentRegistrations()
    }
    void message.success('运行配置已应用')
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

  const submit = async (messageText?: string): Promise<void> => {
    const value = (messageText ?? draft).trim()
    let working = attachmentDraft.current
    if ((!value && working.length === 0) || state.turnId || sessionOperation || attachmentOperation || !runtimeSettings) return
    if (working.length > 0) {
      if (!capabilities.includes(ATTACHMENTS_CAPABILITY)) {
        void message.error('当前 Bingo 版本不支持图片附件，请移除图片后重试')
        return
      }
      const provider = runtimeSettings.providers.find((item) => item.name === selectedProvider)
      if (!provider?.supportsImages) {
        void message.error('当前 Provider 不支持图片，请切换到支持图片的 Provider')
        return
      }
      if (working.some((attachment) => attachment.status === 'preparing' || attachment.status === 'uploading')) return
    }
    const active = connection.current ?? await ensureSession()
    if (!active) return
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
          return
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
    if (!wirePrompt) return
    const turnId = crypto.randomUUID()
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
    const result = await runSessionOperation(window.bingoGui.sendTurn({ connectionId: active.id, turnId, prompt: wirePrompt }))
    if (!result) return
    if (!result.ok) {
      activeTurnId.current = null
      if (result.error.code === 'CONNECTION_STALE') handleTransportError(result.error.code, result.error.msg)
      else dispatch({ type: 'submit-failed', turnId, code: result.error.code, msg: result.error.msg })
      return
    }
    setDraft('')
    working.forEach((attachment) => messagePreviewUrls.current.add(attachment.previewUrl))
    commitAttachments([])
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

  const applySettingsResult = (result: { connectionId?: string; snapshot: SettingsSnapshot }): void => {
    setSettingsSnapshot(result.snapshot)
    setSettingsDraft(result.snapshot.values)
    setRuntimeSettings({ providers: result.snapshot.providers, provider: result.snapshot.values.provider, model: result.snapshot.values.model, thinkingLevel: result.snapshot.values.thinkingLevel, theme: result.snapshot.values.theme })
    setSelectedProvider(result.snapshot.values.provider)
    setSelectedModel(result.snapshot.values.model)
    setModels((current) => uniqueModels(current, result.snapshot.values.model))
    if (result.connectionId) {
      connection.current = { id: result.connectionId, sequence: 0 }
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

  const acceptTeamSnapshot = (snapshot: TeamSnapshot): void => {
    setTeamSnapshot(snapshot)
    setTeamSelection((current) => {
      if (current?.kind === 'channel' && snapshot.channels.some((item) => item.name === current.id)) return current
      if (current?.kind === 'member' && snapshot.members.some((item) => item.name === current.id)) return current
      if (snapshot.channels[0]) return { kind: 'channel', id: snapshot.channels[0].name }
      if (snapshot.members[0]) return { kind: 'member', id: snapshot.members[0].name }
      return null
    })
  }

  const teamUnavailable = (): GuiError => ({ code: 'CAPABILITY_UNAVAILABLE', msg: '当前 Bingo 版本未提供 team.workspace.v1；Chat 仍可正常使用。', level: 'page', recoverable: true })
  const loadTeam = async (): Promise<void> => {
    if (!capabilities.includes('team.workspace.v1')) { setTeamError(teamUnavailable()); return }
    const active = connection.current ?? await ensureSession()
    if (!active) return
    setTeamOperation(true)
    setTeamError(null)
    const result = await window.bingoGui.readTeam({ connectionId: active.id })
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return }
    acceptTeamSnapshot(result.value)
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
    if (!teamSnapshot) return false
    return runTeam((connectionId) => window.bingoGui.saveTeam({ connectionId, baseRevision: teamSnapshot.revision, definition }), 'Team 蓝图已保存')
  }
  const messageMember = (member: string, text: string): Promise<boolean> => runTeam((connectionId) => window.bingoGui.messageTeamMember({ connectionId, member, message: text }), '消息已发送')
  const postChannel = (channel: string, text: string): Promise<boolean> => runTeam((connectionId) => window.bingoGui.postTeamChannel({ connectionId, channel, text }))
  const readActivity = async (member: string): Promise<void> => {
    const active = connection.current
    if (!active) return
    setTeamOperation(true)
    const result = await window.bingoGui.readTeamActivity({ connectionId: active.id, member })
    setTeamOperation(false)
    if (!result.ok) { setTeamError(result.error); return }
    setTeamActivity(result.value.activity)
  }

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

  const changeSettingsSection = (next: SettingsSection): void => {
    if (next === settingsSection) return
    if (settingsDirty) {
      setPendingSettingsNavigation({ section: next })
      return
    }
    setSettingsSection(next)
  }

  const continueSettingsNavigation = (target: PendingSettingsNavigation): void => {
    setPendingSettingsNavigation(null)
    if ('view' in target) commitView(target.view)
    else if ('section' in target) setSettingsSection(target.section)
    else void selectWorkspace()
  }

  const discardAndContinueSettingsNavigation = (): void => {
    if (!pendingSettingsNavigation || !settingsSnapshot) return
    const target = pendingSettingsNavigation
    if (settingsSectionTransaction) settingsSectionTransaction.discard()
    else setSettingsDraft(settingsSnapshot.values)
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
    if (state.turnId || sessionOperation || settingsOperation || teamOperation || workspaceOperation || externalTerminalOperation || attachmentOperation) return
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

  if (flowError) return <Result status="error" title="无法连接 Bingo" subTitle={`${flowError.code} · ${flowError.msg}`} extra={<Space><Button type="primary" onClick={() => void connect()}>重试</Button><Button loading={workspaceOperation} onClick={() => void selectWorkspace()}>选择工作区</Button></Space>} />

  const sidebar = view === 'chat'
    ? <ConversationSidebar sessions={sessions} activeSession={activeSession} runtime={runtime} error={sessionListError} busy={Boolean(state.turnId) || sessionOperation || workspaceOperation || attachmentOperation} onCreate={() => void newConversation()} onOpen={(session) => void openSession(session)} onRename={renameConversation} onDelete={(session) => { setDeleteSession(session); setSessionMutationError(null) }} onDeleteMany={deleteConversations} />
    : view === 'settings'
      ? <SettingsSidebar active={settingsSection} dirty={settingsDirty ? settingsSection : null} onChange={changeSettingsSection} />
      : <TeamSidebar snapshot={teamSnapshot} selection={teamSelection} onSelect={(selection) => { setTeamSelection(selection); setTeamActivity([]); if (selection.kind === 'member') void readActivity(selection.id) }} />
  const inspector = view === 'chat'
    ? <ChatInspector tools={state.tools} selectedToolId={selectedToolId} onSelectTool={setSelectedToolId} />
    : view === 'team'
      ? <TeamInspector snapshot={teamSnapshot} selection={teamSelection} activity={teamActivity} operationBusy={teamOperation} onRefreshChannel={(channel) => void runTeam((connectionId) => window.bingoGui.readTeamChannel({ connectionId, channel }))} onReadActivity={(member) => void readActivity(member)} onStopMember={(member) => void runTeam((connectionId) => window.bingoGui.stopTeamMember({ connectionId, member }), '成员已停止')} onRemoveMember={(member) => void runTeam((connectionId) => window.bingoGui.removeTeamMember({ connectionId, member }), '运行实例已移除')} />
      : undefined

  return <>
    <AppShell view={view} onViewChange={changeView} sidebar={sidebar} inspector={inspector} inspectorCollapsed={appearance.values.inspectorCollapsed} onInspectorCollapsedChange={(collapsed) => { void appearance.save({ ...appearance.values, inspectorCollapsed: collapsed }) }} workspacePath={runtime?.workspacePath} workspaceBusy={workspaceOperation} workspaceDisabled={Boolean(state.turnId) || sessionOperation || settingsOperation || teamOperation || externalTerminalOperation || attachmentOperation} onSelectWorkspace={requestWorkspaceSelection} terminalBusy={externalTerminalOperation} terminalDisabled={!runtime || workspaceOperation} onOpenExternalTerminal={() => void openExternalTerminal()}>
      {view === 'chat' && <ChatPage state={state} activeSession={activeSession} ready={Boolean(runtime && runtimeSettings)} connected={connected} sessionOperation={sessionOperation || workspaceOperation || attachmentOperation} runtimeSettings={runtimeSettings} selectedProvider={selectedProvider} selectedModel={selectedModel} models={models} thinkingLevel={thinkingLevel} settingsError={runtimeSettingsError} savingRuntime={savingRuntime} draft={draft} attachments={attachments} attachmentCapability={capabilities.includes(ATTACHMENTS_CAPABILITY)} workspacePreferences={workspacePreferences} workspaceBusy={workspaceOperation} selectedToolId={selectedToolId} onSelectTool={setSelectedToolId} onDraftChange={setDraft} onAddAttachments={(files) => void addAttachments(files)} onRemoveAttachment={removeAttachment} onWorkspaceChange={(path) => void selectWorkspace(path)} onProviderChange={(provider) => void changeProvider(provider)} onModelChange={setSelectedModel} onThinkingChange={setThinkingLevel} onSaveRuntime={() => void saveRuntime()} onSubmit={(value) => void submit(value)} onCancel={() => void cancel()} onRespond={(response) => void respond(response)} />}
      {view === 'settings' && <SettingsPage section={settingsSection} snapshot={settingsSnapshot} draft={settingsDraft} error={settingsError} runtime={runtime} appInfo={appInfo} busy={settingsOperation || sessionOperation || workspaceOperation || Boolean(state.turnId)} onChange={setSettingsDraft} onSave={saveSettings} onDiscard={() => { if (settingsSnapshot) setSettingsDraft(settingsSnapshot.values) }} onSectionTransactionChange={setSettingsSectionTransaction} onGoTeam={() => changeView('team')} onUpsertProvider={upsertProvider} onRemoveProvider={removeProvider} onUpsertMcp={upsertMcp} onRemoveMcp={removeMcp} onListModels={listModels} />}
      {view === 'team' && <TeamPage snapshot={teamSnapshot} selection={teamSelection} error={teamError} operationBusy={teamOperation || workspaceOperation} turnBusy={Boolean(state.turnId)} activity={teamActivity} onRefresh={() => void loadTeam()} onValidate={() => void validateTeam()} onSave={saveTeam} onStart={() => void runTeam((connectionId) => window.bingoGui.startTeam({ connectionId }), 'Team 已启动')} onStop={() => void runTeam((connectionId) => window.bingoGui.stopTeam({ connectionId }), 'Team 已停止')} onMessage={messageMember} onPost={postChannel} />}
    </AppShell>
    <Modal open={Boolean(deleteSession)} title={`删除“${deleteSession?.name ?? ''}”？`} okText="删除对话" cancelText="取消" confirmLoading={sessionOperation} okButtonProps={{ danger: true }} onOk={() => void confirmDelete()} onCancel={() => setDeleteSession(null)}><Typography.Paragraph>这会永久删除 Bingo transcript，操作无法撤销。</Typography.Paragraph>{sessionMutationError && <Alert type="error" showIcon message={sessionMutationError.msg} />}</Modal>
    <Modal open={Boolean(pendingSettingsNavigation)} title="保存设置更改？" closable={!settingsOperation && !settingsNavigationSaving} maskClosable={false} keyboard={!settingsOperation && !settingsNavigationSaving} onCancel={() => setPendingSettingsNavigation(null)} footer={<Space><Button disabled={settingsOperation || settingsNavigationSaving} onClick={() => setPendingSettingsNavigation(null)}>继续编辑</Button><Button disabled={settingsOperation || settingsNavigationSaving} onClick={discardAndContinueSettingsNavigation}>放弃更改</Button><Button type="primary" loading={settingsOperation || settingsNavigationSaving} onClick={() => void saveAndContinueSettingsNavigation()}>保存并继续</Button></Space>}>
      <Typography.Paragraph>“{settingsSectionLabel(settingsSection)}”中的更改尚未保存。请选择如何继续。</Typography.Paragraph>
    </Modal>
  </>
}

function settingsSectionLabel(section: SettingsSection): string {
  return { general: '常规与运行', providers: 'API 供应商', permissions: '权限', team: 'Team 与协作', mcp: 'MCP', appearance: '外观', advanced: '高级', about: '关于' }[section]
}

function uniqueModels(models: string[], current = ''): string[] {
  return [...new Set([...models, current].map((model) => model.trim()).filter(Boolean))]
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
