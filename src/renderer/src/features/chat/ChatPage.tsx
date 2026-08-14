import { useEffect, useRef, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import { Attachments, Bubble, Prompts, Sender, ThoughtChain, Welcome, type BubbleItemType, type ThoughtChainItemType } from '@ant-design/x'
import { AppstoreOutlined, CheckCircleOutlined, CheckOutlined, CloseOutlined, CopyOutlined, DownOutlined, EditOutlined, FolderOpenOutlined, PaperClipOutlined, PlayCircleOutlined, RobotOutlined, SafetyCertificateOutlined, SendOutlined, ToolOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons'
import { Alert, Avatar, Button, Image, Input, Modal, Popover, Progress, Select, Space, Tag, Tooltip, Typography, Upload } from 'antd'
import type { ContextUsage, PromptResponse } from '../../../../shared/contracts/cli'
import type { GuiError, MessageImageAttachment, PermissionMode, RuntimeSettings, SessionSummary, WorkspacePreferencesV2 } from '../../../../shared/contracts/ipc'
import { ModelPicker } from '../../components/ModelPicker'
import type { ChatMessage, ChatState, ChatTimelineItem, PromptRequest, ToolActivity } from '../../state/chatReducer'
import { IMAGE_ACCEPT, MAX_ATTACHMENTS, type ComposerImageAttachment } from './attachments'

type MessageAction = {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void
}

function MessageActions({ actions }: { actions: MessageAction[] }): React.JSX.Element {
  return <div className="message-actions" role="group" aria-label="消息操作">
    {actions.map((action) => <Tooltip key={action.key} title={action.label}>
      <Button type="text" size="small" icon={action.icon} aria-label={action.label} onClick={action.onClick} />
    </Tooltip>)}
  </div>
}

export function ChatPage({ state, activeSession, ready, connected, sessionOperation, runtimeSettings, selectedProvider, selectedModel, models, thinkingLevel, permissionMode, settingsError, savingRuntime, draft, attachments, attachmentCapability, forkCapability, editing, workspacePreferences, workspaceBusy, selectedToolId, onSelectTool, onDraftChange, onAddAttachments, onRemoveAttachment, onWorkspaceChange, onProviderChange, onModelChange, onThinkingChange, onPermissionModeChange, onSaveRuntime, onSubmit, onCancel, onRespond, onCopyMessage, onEditMessage, onCancelEdit, onContinue }: {
  state: ChatState
  activeSession: SessionSummary | null
  ready: boolean
  connected: boolean
  sessionOperation: boolean
  runtimeSettings: RuntimeSettings | null
  selectedProvider: string
  selectedModel: string
  models: string[]
  thinkingLevel: RuntimeSettings['thinkingLevel']
  permissionMode: PermissionMode
  settingsError: GuiError | null
  savingRuntime: boolean
  draft: string
  attachments: ComposerImageAttachment[]
  attachmentCapability: boolean
  forkCapability: boolean
  editing: boolean
  workspacePreferences: WorkspacePreferencesV2 | null
  workspaceBusy: boolean
  selectedToolId: string | null
  onSelectTool: (toolId: string) => void
  onDraftChange: (value: string) => void
  onAddAttachments: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onWorkspaceChange: (path?: string) => void
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void
  onThinkingChange: (level: RuntimeSettings['thinkingLevel']) => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onSaveRuntime: () => void
  onSubmit: (message?: string) => void
  onCancel: () => void
  onRespond: (response: PromptResponse) => void
  onCopyMessage: (message: ChatMessage) => void
  onEditMessage: (message: ChatMessage) => void
  onCancelEdit: () => void
  onContinue: () => void
}): React.JSX.Element {
  const attachmentsRef = useRef<React.ComponentRef<typeof Attachments>>(null)
  const chatScrollRef = useRef<HTMLElement>(null)
  const followOutputRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false)
  const prompt = state.prompts[0]
  const bubbleItems = conversationItems(state.timeline).map((item): BubbleItemType => {
    if (item.role === 'user') {
      const actions: MessageAction[] = []
      if (item.message.markdown) actions.push({ key: 'copy', label: '复制', icon: <CopyOutlined />, onClick: () => onCopyMessage(item.message) })
      if (forkCapability && item.message.editable && !state.turnId && !sessionOperation) actions.push({ key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => onEditMessage(item.message) })
      if (!editing && state.recovery?.turnId === item.message.turnId && (state.recovery.kind !== 'transport-crash' || forkCapability)) actions.push({ key: 'continue', label: state.recovery.kind === 'transport-crash' ? '恢复并继续' : '继续任务', icon: <PlayCircleOutlined />, onClick: onContinue })
      return {
      key: item.key,
      role: 'user',
      content: <MessageContent markdown={item.message.markdown} attachments={item.message.attachments} />,
      footer: actions.length > 0 ? <MessageActions actions={actions} /> : undefined
      }
    }
    const messages = item.blocks.flatMap((block) => block.type === 'message' ? [block.value] : [])
    const markdown = messages.map((message) => message.markdown).filter(Boolean).join('\n\n')
    const streaming = messages.some((message) => message.status === 'streaming') || item.blocks.some((block) => block.type === 'tool' && block.value.status === 'running')
    const interrupted = messages.some((message) => message.status === 'interrupted')
    return {
      key: item.key,
      role: 'ai',
      content: <AssistantTurn blocks={item.blocks} selectedToolId={selectedToolId} onSelectTool={onSelectTool} />,
      streaming,
      status: interrupted ? 'abort' : streaming ? 'updating' : 'success',
      footer: markdown ? <MessageActions actions={[{ key: 'copy', label: '复制', icon: <CopyOutlined />, onClick: () => onCopyMessage({ id: item.key, turnId: null, role: 'assistant', markdown }) }]} /> : undefined
    }
  })
  const provider = runtimeSettings?.providers.find((item) => item.name === selectedProvider)
  const runtimeDirty = Boolean(runtimeSettings && (selectedProvider !== runtimeSettings.provider || selectedModel !== runtimeSettings.model || thinkingLevel !== runtimeSettings.thinkingLevel))
  const controlsDisabled = Boolean(state.turnId) || sessionOperation
  const runtimeControlsDisabled = controlsDisabled || editing
  const providerSupportsImages = Boolean(provider?.supportsImages)
  const canSubmit = Boolean(draft.trim() || attachments.length) && ready && !sessionOperation
  const attachmentItems = attachments.map((attachment) => ({
    uid: attachment.id,
    name: attachment.name,
    type: attachment.mediaType,
    size: attachment.size,
    status: attachment.status === 'error' ? 'error' as const : attachment.status === 'uploading' ? 'uploading' as const : 'done' as const,
    percent: attachment.status === 'uploading' ? 50 : 100,
    thumbUrl: attachment.previewUrl,
    url: attachment.previewUrl,
    cardType: 'image' as const,
    description: attachment.error ?? (attachment.status === 'uploaded' ? '已登记' : undefined)
  }))
  useEffect(() => {
    const preventFileNavigation = (event: DragEvent): void => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    document.addEventListener('dragover', preventFileNavigation)
    document.addEventListener('drop', preventFileNavigation)
    return () => {
      document.removeEventListener('dragover', preventFileNavigation)
      document.removeEventListener('drop', preventFileNavigation)
    }
  }, [])
  useEffect(() => {
    const scroll = chatScrollRef.current
    if (scroll && followOutputRef.current) {
      scroll.scrollTop = scroll.scrollHeight
      setShowScrollButton(false)
    }
  }, [state.timeline, state.error])
  const scrollToLatest = (): void => {
    const scroll = chatScrollRef.current
    if (!scroll) return
    followOutputRef.current = true
    setShowScrollButton(false)
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' })
  }
  return (
    <main className={`chat-page${state.timeline.length === 0 && !state.turnId ? ' is-empty' : ''}`} data-qa-state={state.turnId ? 'loading' : state.messages.length ? 'chat' : 'empty'}>
      <header className="page-toolbar chat-toolbar">
        <div className="page-heading"><span>本地对话</span><h1>{activeSession?.name ?? '新对话'}</h1></div>
      </header>
      {settingsError && <Alert className="page-alert" type="error" showIcon message={settingsError.code} description={settingsError.msg} />}
      <section ref={chatScrollRef} className="chat-scroll" aria-live="polite" onScroll={(event) => {
        const scroll = event.currentTarget
        followOutputRef.current = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80
        setShowScrollButton(!followOutputRef.current)
      }}>
        {state.timeline.length === 0 && !state.turnId && <EmptyChat onPrompt={(value) => { onDraftChange(value) }} />}
        {state.timeline.length > 0 && <Bubble.List rootClassName="message-list" items={bubbleItems} role={bubbleRoles} />}
        {state.turnId && !state.messages.some((message) => message.role === 'assistant' && message.markdown) && !state.tools.some((tool) => tool.turnId === state.turnId) && <DelayedThinking />}
        {state.error && <Alert className="inline-error" type="error" showIcon message={state.error.code} description={state.error.msg} />}
      </section>
      {showScrollButton && <Tooltip title="回到最新消息"><Button className="scroll-latest" shape="circle" icon={<DownOutlined />} aria-label="回到最新消息" onClick={scrollToLatest} /></Tooltip>}
      <footer className="sender-zone">
        {editing && <div className="composer-editing-bar"><span><EditOutlined /> 正在编辑并创建分支</span><Button type="text" size="small" icon={<CloseOutlined />} aria-label="取消编辑" onClick={onCancelEdit} /></div>}
        {attachmentCapability && attachments.length > 0 && <Attachments
          className="composer-attachments"
          items={attachmentItems}
          accept={IMAGE_ACCEPT}
          multiple
          maxCount={MAX_ATTACHMENTS}
          disabled={controlsDisabled}
          beforeUpload={() => Upload.LIST_IGNORE}
          onRemove={(file) => { onRemoveAttachment(file.uid); return true }}
        />}
        {attachmentCapability && <Attachments
          ref={attachmentsRef}
          accept={IMAGE_ACCEPT}
          multiple
          maxCount={MAX_ATTACHMENTS}
          disabled={controlsDisabled || !providerSupportsImages}
          getDropContainer={getSenderDropContainer}
          beforeUpload={(file, fileList) => {
            if (file === fileList[0]) onAddAttachments([...fileList])
            return Upload.LIST_IGNORE
          }}
        ><span className="attachment-upload-anchor" /></Attachments>}
        <Sender
          value={draft}
          loading={Boolean(state.turnId)}
          disabled={!ready || sessionOperation}
          placeholder={editing ? '修改提示词后发送，将创建新分支' : ready ? '给 Bingo 发送消息' : '正在读取 Bingo 配置'}
          autoSize={{ minRows: 2, maxRows: 7 }}
          onChange={onDraftChange}
          onSubmit={(message) => { followOutputRef.current = true; onSubmit(message) }}
          onCancel={onCancel}
          onPasteFile={(files) => {
            if (attachmentCapability && providerSupportsImages) onAddAttachments([...files])
          }}
          prefix={attachmentCapability && <Tooltip title={providerSupportsImages ? '添加图片' : '当前 Provider 不支持图片'}>
            <Button type="text" icon={<PaperClipOutlined />} aria-label="添加图片" disabled={controlsDisabled || !providerSupportsImages || attachments.length >= MAX_ATTACHMENTS} onClick={() => attachmentsRef.current?.select({ accept: IMAGE_ACCEPT, multiple: true })} />
          </Tooltip>}
          suffix={(_actionNode, { components: { LoadingButton, SendButton } }) => <Space size={6}>
            {provider && <Tag color={provider.credentialConfigured ? 'success' : 'warning'}>{provider.name}</Tag>}
            {state.turnId ? <LoadingButton aria-label="停止生成" /> : <SendButton aria-label="发送消息" disabled={!canSubmit} />}
          </Space>}
        />
        <div className="sender-toolbar">
          {runtimeSettings && <Space size={4} wrap className="runtime-controls">
            {workspacePreferences && <Select
              aria-label="工作区"
              className="composer-workspace-picker"
              size="small"
              variant="borderless"
              value={workspacePreferences.currentPath}
              suffixIcon={<FolderOpenOutlined />}
              popupMatchSelectWidth={360}
              disabled={runtimeControlsDisabled || workspaceBusy}
              options={workspaceOptions(workspacePreferences)}
              onChange={(value) => onWorkspaceChange(value === CHOOSE_WORKSPACE ? undefined : value)}
            />}
            <Popover placement="topLeft" trigger="click" content={<div className="runtime-profile-popover">
              <label><span>Provider</span><Select aria-label="Provider" value={selectedProvider} popupMatchSelectWidth={false} disabled={runtimeControlsDisabled} options={runtimeSettings.providers.map((item) => ({ value: item.name, label: `${item.name}${item.credentialConfigured ? '' : ' · 未配置'}` }))} onChange={onProviderChange} /></label>
              <label><span>Model</span><ModelPicker ariaLabel="Model" value={selectedModel} models={models} disabled={runtimeControlsDisabled} onChange={onModelChange} /></label>
              <label><span>Thinking</span><Select aria-label="Thinking level" value={thinkingLevel} popupMatchSelectWidth={false} disabled={runtimeControlsDisabled} options={thinkingOptions} onChange={onThinkingChange} /></label>
              <Button block type="primary" icon={<CheckOutlined />} loading={savingRuntime} disabled={!runtimeDirty || !selectedModel.trim() || runtimeControlsDisabled || savingRuntime} onClick={onSaveRuntime}>应用会话配置</Button>
            </div>}>
              <Button className="runtime-profile-button" type={runtimeDirty ? 'primary' : 'text'} size="small" icon={<RobotOutlined />} disabled={runtimeControlsDisabled || savingRuntime}>{selectedModel || selectedProvider || '选择模型'} · {thinkingLevel}</Button>
            </Popover>
            <Popover
              placement="topLeft"
              trigger="click"
              open={permissionMenuOpen}
              onOpenChange={setPermissionMenuOpen}
              content={<PermissionModeMenu value={permissionMode} onChange={(mode) => { setPermissionMenuOpen(false); onPermissionModeChange(mode) }} />}
            >
              <Button className="permission-mode-button" type="text" size="small" icon={<SafetyCertificateOutlined />} loading={savingRuntime} disabled={runtimeControlsDisabled || savingRuntime} aria-label={`权限审批：${permissionModeLabel(permissionMode)}`}>{permissionModeLabel(permissionMode)}</Button>
            </Popover>
          </Space>}
          <Typography.Text type="secondary" className="sender-status">{editing ? '原对话保持不变' : state.turnId ? 'Bingo 正在处理，可随时停止' : sessionOperation ? '正在准备对话' : connected ? '会话已连接' : ready ? '首次发送时创建对话' : '等待运行时'}</Typography.Text>
        </div>
      </footer>
      {prompt && <PromptDialog prompt={prompt} onRespond={onRespond} />}
    </main>
  )
}

const CHOOSE_WORKSPACE = '__choose_other_workspace__'

const bubbleRoles = {
  user: { placement: 'end' as const, variant: 'filled' as const, shape: 'corner' as const, avatar: <Avatar icon={<UserOutlined />} /> },
  ai: {
    placement: 'start' as const, variant: 'borderless' as const, avatar: <Avatar className="bingo-avatar" icon={<RobotOutlined />} />
  }
}

type ConversationItem =
  | { role: 'user'; key: string; message: ChatMessage }
  | { role: 'ai'; key: string; blocks: ChatTimelineItem[] }

function conversationItems(timeline: ChatTimelineItem[]): ConversationItem[] {
  const items: ConversationItem[] = []
  for (const item of timeline) {
    if (item.type === 'message' && item.value.role === 'user') {
      items.push({ role: 'user', key: item.value.id, message: item.value })
      continue
    }
    const last = items.at(-1)
    if (last?.role === 'ai') last.blocks.push(item)
    else items.push({ role: 'ai', key: `assistant-turn-${item.value.id}`, blocks: [item] })
  }
  return items
}

function AssistantTurn({ blocks, selectedToolId, onSelectTool }: { blocks: ChatTimelineItem[]; selectedToolId: string | null; onSelectTool: (toolId: string) => void }): React.JSX.Element {
  const groups: Array<{ type: 'messages'; items: ChatMessage[] } | { type: 'tools'; items: ToolActivity[] }> = []
  blocks.forEach((block) => {
    const type = block.type === 'message' ? 'messages' : 'tools'
    const last = groups.at(-1)
    if (last?.type === type) {
      if (last.type === 'messages' && block.type === 'message') last.items.push(block.value)
      if (last.type === 'tools' && block.type === 'tool') last.items.push(block.value)
    } else if (block.type === 'message') groups.push({ type: 'messages', items: [block.value] })
    else groups.push({ type: 'tools', items: [block.value] })
  })
  return <div className="assistant-turn">{groups.map((group, index) => group.type === 'messages'
    ? <div key={`messages-${index}`} className="assistant-message-segments">{group.items.map((message) => <AssistantMessage key={message.id} markdown={message.markdown} attachments={message.attachments} />)}</div>
    : <ToolActivityGroup key={`tools-${group.items[0].id}`} tools={group.items} selectedToolId={selectedToolId} onSelectTool={onSelectTool} />
  )}</div>
}

function ToolActivityGroup({ tools, selectedToolId, onSelectTool }: { tools: ToolActivity[]; selectedToolId: string | null; onSelectTool: (toolId: string) => void }): React.JSX.Element {
  const running = tools.filter((tool) => tool.status === 'running').length
  return <details className="message-tool-chain">
    <summary className="message-tool-summary">
      <span className="section-kicker"><ToolOutlined /> {running ? `${running} 项工具正在运行` : `${tools.length} 项工具活动`}</span>
      <DownOutlined className="message-tool-expand-icon" aria-hidden />
    </summary>
    <div className="message-tool-chain-body">
      <ThoughtChain items={toolsToThoughts(tools, onSelectTool, selectedToolId)} />
    </div>
  </details>
}

function workspaceOptions(preferences: WorkspacePreferencesV2): Array<{ value: string; label: string }> {
  const recent = preferences.recentPaths.map((path) => ({ value: path, label: path }))
  return [...recent, { value: CHOOSE_WORKSPACE, label: '选择其他文件夹…' }]
}

function getSenderDropContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.sender-zone')
}

function MessageContent({ markdown, attachments }: { markdown: string; attachments?: MessageImageAttachment[] }): React.JSX.Element {
  return <div className="user-message-content">
    {markdown && <div className="user-message-text">{markdown}</div>}
    {attachments && attachments.length > 0 && <MessageAttachments attachments={attachments} />}
  </div>
}

function MessageAttachments({ attachments }: { attachments: MessageImageAttachment[] }): React.JSX.Element {
  return <Image.PreviewGroup>
    <div className="message-attachment-grid">
      {attachments.map((attachment) => <Image
        key={attachment.id}
        src={attachment.dataUrl}
        alt={attachment.name ?? '对话图片'}
        width={96}
        height={96}
        preview={{ mask: '预览' }}
      />)}
    </div>
  </Image.PreviewGroup>
}

export function AssistantMarkdown({ markdown }: { markdown: string }): React.JSX.Element {
  return <div className="markdown-body"><Markdown
    skipHtml
    components={{ img: ({ src, alt }) => <RemoteMarkdownImage src={src} alt={alt} /> }}
  >{markdown}</Markdown></div>
}

function AssistantMessage({ markdown, attachments }: { markdown: string; attachments?: MessageImageAttachment[] }): React.JSX.Element {
  return <div className="assistant-message-content">
    {markdown && <AssistantMarkdown markdown={markdown} />}
    {attachments && attachments.length > 0 && <MessageAttachments attachments={attachments} />}
  </div>
}

export function isSafeMarkdownImageUrl(src: string | undefined): boolean {
  if (!src) return false
  try { return new URL(src).protocol === 'https:' } catch { return false }
}

function RemoteMarkdownImage({ src, alt }: { src?: string; alt?: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  if (!isSafeMarkdownImageUrl(src) || failed) return <span className="markdown-image-fallback">[图片无法加载]</span>
  return <Image
    className="markdown-remote-image"
    src={src}
    alt={alt ?? ''}
    loading="lazy"
    referrerPolicy="no-referrer"
    onError={() => setFailed(true)}
  />
}

const thinkingOptions: Array<{ value: RuntimeSettings['thinkingLevel']; label: string }> = [
  { value: 'off', label: 'Thinking 关闭' },
  { value: 'low', label: 'Thinking Low' },
  { value: 'medium', label: 'Thinking Medium' },
  { value: 'high', label: 'Thinking High' },
  { value: 'xhigh', label: 'Thinking XHigh' },
  { value: 'max', label: 'Thinking Max' }
]

const permissionModeOptions: Array<{ value: PermissionMode; label: string; description: string; danger?: boolean; icon: React.ReactNode }> = [
  { value: 'default', label: '请求批准', description: '非只读工具执行前请求批准', icon: <SafetyCertificateOutlined /> },
  { value: 'acceptEdits', label: '帮我批准', description: '自动允许常规编辑，其他风险操作请求批准', icon: <CheckCircleOutlined /> },
  { value: 'bypassPermissions', label: '完全访问权限', description: '绕过大部分审批；敏感路径和 Ask 规则除外', danger: true, icon: <WarningOutlined /> },
  { value: 'plan', label: '计划模式', description: '只允许读取和任务规划，拒绝其他工具', icon: <RobotOutlined /> },
  { value: 'dontAsk', label: '不询问', description: '不弹出审批，自动拒绝需批准的工具', icon: <CheckOutlined /> }
]

function PermissionModeMenu({ value, onChange }: { value: PermissionMode; onChange: (mode: PermissionMode) => void }): React.JSX.Element {
  return <div className="permission-mode-popover" role="menu" aria-label="权限审批模式">
    <header>应如何批准 Bingo 操作？</header>
    {permissionModeOptions.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={value === option.value} className={`permission-mode-option${option.danger ? ' danger' : ''}`} onClick={() => onChange(option.value)}>
      <span className="permission-mode-option-icon">{option.icon}</span>
      <span><strong>{option.label}</strong><small>{option.description}</small></span>
      <CheckOutlined className={`permission-mode-option-check${value === option.value ? ' selected' : ''}`} />
    </button>)}
  </div>
}

function permissionModeLabel(mode: PermissionMode): string {
  return permissionModeOptions.find((option) => option.value === mode)?.label ?? '权限审批'
}

export type ContextUsageBand = 'normal' | 'warning' | 'danger'

export function contextUsageBand(usage: ContextUsage): ContextUsageBand {
  const scaled = usage.usedTokens * 100
  if (scaled > usage.contextWindow * 90) return 'danger'
  if (scaled >= usage.contextWindow * 70) return 'warning'
  return 'normal'
}

export function ChatInspector({ tools, selectedToolId, contextUsage, contextCapability, provider, model, onSelectTool }: {
  tools: ToolActivity[]
  selectedToolId: string | null
  contextUsage: ContextUsage | null
  contextCapability: boolean
  provider: string
  model: string
  onSelectTool: (toolId: string) => void
}): React.JSX.Element {
  const selected = tools.find((tool) => tool.id === selectedToolId) ?? tools.at(-1)
  const percent = contextUsage ? Math.floor(contextUsage.usedTokens * 100 / contextUsage.contextWindow) : 0
  const remaining = contextUsage ? Math.max(0, contextUsage.contextWindow - contextUsage.usedTokens) : 0
  const band = contextUsage ? contextUsageBand(contextUsage) : 'normal'
  return <div className="inspector-content"><header><span>运行检查器</span><strong>{tools.length ? `${tools.length} 项工具活动` : '会话活动'}</strong></header>
    <section className={`context-usage context-usage-${band}`} aria-label="上下文估算">
      <div className="context-usage-heading"><div><span>上下文估算</span><strong>{contextUsage ? `${percent}%` : '不可用'}</strong></div>{contextUsage && <span>{formatTokens(contextUsage.usedTokens)} / {formatTokens(contextUsage.contextWindow)}</span>}</div>
      {contextUsage
        ? <><Progress percent={Math.min(100, percent)} showInfo={false} strokeColor="currentColor" railColor="var(--rei-border)" size="small" /><dl><dt>已用</dt><dd>{formatTokens(contextUsage.usedTokens)}</dd><dt>窗口</dt><dd>{formatTokens(contextUsage.contextWindow)}</dd><dt>剩余</dt><dd>{formatTokens(remaining)}</dd></dl></>
        : <Typography.Text type="secondary">{contextCapability ? '正在读取估算…' : '当前 Bingo 版本不支持此数据'}</Typography.Text>}
      <dl className="context-runtime-profile"><dt>Provider</dt><dd>{provider || '未设置'}</dd><dt>Model</dt><dd>{model || '未设置'}</dd></dl>
    </section>
    {tools.length === 0
    ? <div className="inspector-empty"><CheckCircleOutlined /><span>当前没有工具活动</span></div>
    : <>
      <div className="inspector-tool-list" role="list">{tools.map((tool) => <button key={tool.id} type="button" className={`inspector-tool-row${selected?.id === tool.id ? ' active' : ''}`} onClick={() => onSelectTool(tool.id)}>
        <span className={`tool-status-dot ${tool.status}`} />
        <span><strong>{tool.name}</strong><small>{tool.summary}</small></span>
        <time>{formatDuration(tool.durationMs, tool.status)}</time>
      </button>)}</div>
      {selected && <section className="inspector-tool-detail"><div className="section-kicker"><ToolOutlined /> 活动详情</div><dl className="inspector-details"><dt>工具</dt><dd>{selected.name}</dd><dt>状态</dt><dd>{toolStatusLabel(selected.status)}</dd><dt>摘要</dt><dd>{selected.summary}</dd><dt>耗时</dt><dd>{formatDuration(selected.durationMs, selected.status)}</dd></dl>{selected.output && <pre className="tool-output">{selected.output}</pre>}</section>}
    </>}</div>
}

function EmptyChat({ onPrompt }: { onPrompt: (value: string) => void }): React.JSX.Element {
  const items = [
    { key: 'inspect', icon: <SafetyCertificateOutlined />, label: '检查当前项目', description: '了解结构、状态和潜在风险' },
    { key: 'plan', icon: <AppstoreOutlined />, label: '规划下一项工作', description: '结合现有代码给出可执行步骤' },
    { key: 'build', icon: <SendOutlined />, label: '实现一个具体改动', description: '描述目标，Bingo 会从项目现场开始' }
  ]
  const prompts: Record<string, string> = {
    inspect: '检查当前项目的结构、状态和主要风险，并给出优先级建议。',
    plan: '读取当前项目，规划下一项最值得推进的工作。',
    build: '读取当前项目并等待我描述要实现的具体改动。'
  }
  return <div className="empty-chat"><Welcome variant="borderless" icon={<img className="welcome-icon" src="./icon.svg" alt="" />} title="Bingo Go" description="Bingo 的本地协作工作台" /><Prompts title="从这里开始" items={items} wrap onItemClick={({ data }) => onPrompt(prompts[data.key])} /></div>
}

function DelayedThinking(): React.JSX.Element | null {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const timer = setTimeout(() => setVisible(true), 200); return () => clearTimeout(timer) }, [])
  return visible ? <Bubble content="正在分析项目…" loading avatar={<Avatar className="bingo-avatar" icon={<RobotOutlined />} />} variant="borderless" /> : null
}

function PromptDialog({ prompt, onRespond }: { prompt: PromptRequest; onRespond: (response: PromptResponse) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  return <Modal className="prompt-dialog" open title={prompt.title} width={560} closable={false} maskClosable={false} keyboard={false} footer={null}>
    <Typography.Paragraph className="prompt-question">{prompt.question}</Typography.Paragraph>
    <Space direction="vertical" className="prompt-options">
      {prompt.options.map((option) => <Button className="prompt-option" key={option.id} block onClick={() => onRespond({ kind: 'option', optionId: option.id })}>
        <span className="prompt-option-content">
          <strong>{option.label}</strong>
          {option.description && <small>{option.description}</small>}
        </span>
      </Button>)}
      {prompt.allowFreeText && <Space.Compact block><Input value={text} aria-label="自定义回答" placeholder="输入回答" onChange={(event) => setText(event.target.value)} /><Button type="primary" disabled={!text.trim()} onClick={() => onRespond({ kind: 'text', text })}>提交</Button></Space.Compact>}
      <Button type="text" onClick={() => onRespond({ kind: 'cancel' })}>取消</Button>
    </Space>
  </Modal>
}

function toolsToThoughts(tools: ToolActivity[], onSelectTool?: (toolId: string) => void, selectedToolId?: string | null): ThoughtChainItemType[] {
  return tools.map((tool) => ({
    key: tool.id,
    title: <button type="button" className={`tool-title-button${selectedToolId === tool.id ? ' active' : ''}`} onClick={() => onSelectTool?.(tool.id)}>{tool.name}</button>,
    description: <span>{tool.summary}{tool.durationMs !== undefined && <small> · {formatDuration(tool.durationMs, tool.status)}</small>}</span>,
    collapsible: false,
    status: tool.status === 'running' ? 'loading' : tool.status === 'done' ? 'success' : tool.status === 'interrupted' ? 'abort' : 'error'
  }))
}

function formatDuration(durationMs?: number, status?: ToolActivity['status']): string {
  if (durationMs === undefined) return status === 'running' ? '进行中' : '未记录'
  return durationMs < 1_000 ? `${Math.round(durationMs)} ms` : `${(durationMs / 1_000).toFixed(1)} s`
}

function toolStatusLabel(status: ToolActivity['status']): string {
  return { running: '运行中', done: '已完成', error: '失败', interrupted: '已中断' }[status]
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}
