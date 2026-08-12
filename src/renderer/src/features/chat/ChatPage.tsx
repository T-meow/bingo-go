import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { Actions, Attachments, Bubble, Prompts, Sender, ThoughtChain, Welcome, type BubbleItemType, type ThoughtChainItemType } from '@ant-design/x'
import { AppstoreOutlined, CheckCircleOutlined, CheckOutlined, CopyOutlined, FolderOpenOutlined, PaperClipOutlined, RobotOutlined, SafetyCertificateOutlined, SendOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Avatar, Button, Image, Input, Modal, Select, Space, Tag, Tooltip, Typography, Upload } from 'antd'
import type { PromptResponse } from '../../../../shared/contracts/cli'
import type { GuiError, MessageImageAttachment, RuntimeSettings, SessionSummary, WorkspacePreferencesV2 } from '../../../../shared/contracts/ipc'
import { ModelPicker } from '../../components/ModelPicker'
import type { ChatState, PromptRequest, ToolActivity } from '../../state/chatReducer'
import { IMAGE_ACCEPT, MAX_ATTACHMENTS, type ComposerImageAttachment } from './attachments'

export function ChatPage({ state, activeSession, ready, connected, sessionOperation, runtimeSettings, selectedProvider, selectedModel, models, thinkingLevel, settingsError, savingRuntime, draft, attachments, attachmentCapability, workspacePreferences, workspaceBusy, onDraftChange, onAddAttachments, onRemoveAttachment, onWorkspaceChange, onProviderChange, onModelChange, onThinkingChange, onSaveRuntime, onSubmit, onCancel, onRespond }: {
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
  settingsError: GuiError | null
  savingRuntime: boolean
  draft: string
  attachments: ComposerImageAttachment[]
  attachmentCapability: boolean
  workspacePreferences: WorkspacePreferencesV2 | null
  workspaceBusy: boolean
  onDraftChange: (value: string) => void
  onAddAttachments: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onWorkspaceChange: (path?: string) => void
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void
  onThinkingChange: (level: RuntimeSettings['thinkingLevel']) => void
  onSaveRuntime: () => void
  onSubmit: (message?: string) => void
  onCancel: () => void
  onRespond: (response: PromptResponse) => void
}): React.JSX.Element {
  const attachmentsRef = useRef<React.ComponentRef<typeof Attachments>>(null)
  const prompt = state.prompts[0]
  const bubbleItems: BubbleItemType[] = state.messages.map((message) => ({
    key: message.id,
    role: message.role === 'assistant' ? 'ai' : 'user',
    content: message.role === 'user'
      ? <MessageContent markdown={message.markdown} attachments={message.attachments} />
      : message.markdown,
    contentRender: message.role === 'assistant'
      ? () => <AssistantMessage markdown={message.markdown} attachments={message.attachments} />
      : undefined,
    streaming: message.status === 'streaming',
    status: message.status === 'interrupted' ? 'abort' : message.status === 'streaming' ? 'updating' : 'success',
    footer: message.role === 'assistant' && message.markdown
      ? <Actions items={[{ key: 'copy', label: '复制', icon: <CopyOutlined />, onItemClick: () => void navigator.clipboard?.writeText(message.markdown) }]} />
      : undefined
  }))
  const toolItems = toolsToThoughts(state.tools)
  const provider = runtimeSettings?.providers.find((item) => item.name === selectedProvider)
  const runtimeDirty = Boolean(runtimeSettings && (selectedProvider !== runtimeSettings.provider || selectedModel !== runtimeSettings.model || thinkingLevel !== runtimeSettings.thinkingLevel))
  const controlsDisabled = Boolean(state.turnId) || sessionOperation
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
  return (
    <main className="chat-page" data-qa-state={state.turnId ? 'loading' : state.messages.length ? 'chat' : 'empty'}>
      <header className="page-toolbar chat-toolbar">
        <div className="page-heading"><span>本地对话</span><h1>{activeSession?.name ?? '新对话'}</h1></div>
      </header>
      {settingsError && <Alert className="page-alert" type="error" showIcon message={settingsError.code} description={settingsError.msg} />}
      <section className="chat-scroll" aria-live="polite">
        {bubbleItems.length === 0 && !state.turnId && <EmptyChat onPrompt={(value) => { onDraftChange(value) }} />}
        {bubbleItems.length > 0 && <Bubble.List
          rootClassName="message-list"
          autoScroll
          items={bubbleItems}
          role={{
            user: { placement: 'end', variant: 'filled', shape: 'corner', avatar: <Avatar icon={<UserOutlined />} /> },
            ai: {
              placement: 'start', variant: 'borderless', avatar: <Avatar className="bingo-avatar" icon={<RobotOutlined />} />,
              contentRender: (content) => <AssistantMarkdown markdown={String(content)} />
            }
          }}
        />}
        {state.turnId && !state.messages.some((message) => message.role === 'assistant' && message.markdown) && <DelayedThinking />}
        {toolItems.length > 0 && <section className="tool-chain"><div className="section-kicker"><AppstoreOutlined /> 工具活动</div><ThoughtChain items={toolItems} /></section>}
        {state.error && <Alert className="inline-error" type="error" showIcon message={state.error.code} description={state.error.msg} />}
      </section>
      <footer className="sender-zone">
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
          placeholder={ready ? '给 Bingo 发送消息' : '正在读取 Bingo 配置'}
          autoSize={{ minRows: 2, maxRows: 7 }}
          onChange={onDraftChange}
          onSubmit={(message) => onSubmit(message)}
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
              disabled={controlsDisabled || workspaceBusy}
              options={workspaceOptions(workspacePreferences)}
              onChange={(value) => onWorkspaceChange(value === CHOOSE_WORKSPACE ? undefined : value)}
            />}
            <Select aria-label="Provider" size="small" variant="borderless" value={selectedProvider} popupMatchSelectWidth={false} disabled={controlsDisabled} options={runtimeSettings.providers.map((item) => ({ value: item.name, label: `${item.name}${item.credentialConfigured ? '' : ' · 未配置'}` }))} onChange={onProviderChange} />
            <ModelPicker ariaLabel="Model" className="composer-model-picker" value={selectedModel} models={models} size="small" variant="borderless" disabled={controlsDisabled} onChange={onModelChange} />
            <Select aria-label="Thinking level" size="small" variant="borderless" value={thinkingLevel} popupMatchSelectWidth={false} disabled={controlsDisabled} options={thinkingOptions} onChange={onThinkingChange} />
            <Button type={runtimeDirty ? 'primary' : 'text'} size="small" icon={<CheckOutlined />} loading={savingRuntime} disabled={!runtimeDirty || !selectedModel.trim() || controlsDisabled} onClick={onSaveRuntime}>应用</Button>
          </Space>}
          <Typography.Text type="secondary" className="sender-status">{state.turnId ? 'Bingo 正在处理，可随时停止' : sessionOperation ? '正在准备对话' : connected ? '会话已连接' : ready ? '首次发送时创建对话' : '等待运行时'}</Typography.Text>
        </div>
      </footer>
      {prompt && <PromptDialog prompt={prompt} onRespond={onRespond} />}
    </main>
  )
}

const CHOOSE_WORKSPACE = '__choose_other_workspace__'

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

export function ChatInspector({ tools }: { tools: ToolActivity[] }): React.JSX.Element {
  return <div className="inspector-content"><header><span>运行检查器</span><strong>本轮活动</strong></header>{tools.length === 0
    ? <div className="inspector-empty"><CheckCircleOutlined /><span>当前没有工具活动</span></div>
    : <ThoughtChain items={toolsToThoughts(tools)} />}</div>
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
  return <Modal open title={prompt.title} closable={false} maskClosable={false} keyboard={false} footer={null}>
    <Typography.Paragraph>{prompt.question}</Typography.Paragraph>
    <Space direction="vertical" className="prompt-options">
      {prompt.options.map((option) => <Button key={option.id} block onClick={() => onRespond({ kind: 'option', optionId: option.id })}><span>{option.label}</span>{option.description && <small>{option.description}</small>}</Button>)}
      {prompt.allowFreeText && <Space.Compact block><Input value={text} aria-label="自定义回答" placeholder="输入回答" onChange={(event) => setText(event.target.value)} /><Button type="primary" disabled={!text.trim()} onClick={() => onRespond({ kind: 'text', text })}>提交</Button></Space.Compact>}
      <Button type="text" onClick={() => onRespond({ kind: 'cancel' })}>取消</Button>
    </Space>
  </Modal>
}

function toolsToThoughts(tools: ToolActivity[]): ThoughtChainItemType[] {
  return tools.map((tool) => ({
    key: tool.id,
    title: tool.name,
    description: tool.summary,
    content: tool.output ? <pre className="tool-output">{tool.output}</pre> : undefined,
    collapsible: Boolean(tool.output),
    status: tool.status === 'running' ? 'loading' : tool.status === 'done' ? 'success' : tool.status === 'interrupted' ? 'abort' : 'error'
  }))
}
