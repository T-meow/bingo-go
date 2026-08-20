import { Button, Popover, Segmented, Select, Tooltip } from 'antd'
import { Attachments, Sender } from '@ant-design/x'
import { CodeOutlined, ControlOutlined, MessageOutlined, SendOutlined, StopOutlined } from '@ant-design/icons'
import type { ConfigSnapshot, ProviderInfo, QueueEntry, ThinkingLevel } from '../../../../shared/contracts/appServer'

export type ComposerAttachment = { uid: string; name: string; status?: 'ready' | 'error'; thumbUrl?: string }
export type ComposerRuntime = {
  config: ConfigSnapshot
  providers: ProviderInfo[]
  models: string[]
  onProviderSelect: (provider: string) => void
  onModelSelect: (model: string) => void
  onThinkingSelect: (level: ThinkingLevel) => void
  onPermissionMode: (mode: ConfigSnapshot['permissionMode']) => void
}

export function Composer({ value, onChange, loading, onSubmit, onCancel, shellMode, onShellModeChange, allowShell, audience, runtime, queue, onReclaimTail, attachments }: {
  value: string
  onChange: (value: string) => void
  loading: boolean
  onSubmit: (text: string) => void
  onCancel: () => void
  shellMode: boolean
  onShellModeChange: (shell: boolean) => void
  allowShell: boolean
  audience: string
  runtime?: ComposerRuntime
  queue: QueueEntry[]
  onReclaimTail: () => void
  attachments: ComposerAttachment[]
}): React.JSX.Element {
  const submit = (): void => {
    if (value.trim() && !loading) onSubmit(value)
  }
  return (
    <div className="composer-v2">
      <div className="composer-frame-v2">
        {attachments.length > 0 && (
          <Attachments
            items={attachments.map((attachment) => ({ uid: attachment.uid, name: attachment.name, status: attachment.status === 'error' ? 'error' : 'done', thumbUrl: attachment.thumbUrl }))}
            disabled
          />
        )}
        <Sender
          value={value}
          onChange={onChange}
          loading={loading}
          onSubmit={(text) => { if (text.trim()) onSubmit(text) }}
          onCancel={onCancel}
          placeholder={allowShell && shellMode ? '输入要执行的 Shell 命令' : allowShell ? '描述任务或要修改的内容' : `发送消息给 ${audience}`}
          submitType="enter"
          autoSize={{ minRows: 2, maxRows: 8 }}
          prefix={allowShell ? <Segmented
            className="composer-mode-v2"
            size="small"
            aria-label="输入模式"
            value={shellMode ? 'shell' : 'chat'}
            options={[
              { value: 'chat', icon: <MessageOutlined />, label: '对话' },
              { value: 'shell', icon: <CodeOutlined />, label: 'Shell' }
            ]}
            onChange={(mode) => onShellModeChange(mode === 'shell')}
          /> : undefined}
          suffix={loading
            ? <Tooltip title="停止当前回合"><Button className="composer-submit-v2 is-stop" type="text" shape="circle" icon={<StopOutlined />} aria-label="停止当前回合" onClick={onCancel} /></Tooltip>
            : <Tooltip title="发送任务"><Button className="composer-submit-v2" type="primary" shape="circle" icon={<SendOutlined />} aria-label="发送任务" disabled={!value.trim()} onClick={submit} /></Tooltip>}
          footer={() => (
            <div className="composer-footer-v2">
              <div className="composer-status-v2">
                <span className={`composer-agent-state-v2${loading ? ' is-running' : ''}`}><i />{loading ? 'Agent 执行中' : 'Agent 就绪'}</span>
                {runtime && <RuntimeControl runtime={runtime} />}
              </div>
              <div className="composer-footer-end-v2">
                {queue.length > 0 && <div className="composer-queue-v2">
                  <span>队列 {queue.length}</span>
                  <span>{queue.at(-1)?.steerEligible ? '可合并' : '等待执行'}</span>
                  <button type="button" onClick={onReclaimTail}>撤回队尾</button>
                </div>}
              </div>
            </div>
          )}
        />
      </div>
    </div>
  )
}

function RuntimeControl({ runtime }: { runtime: ComposerRuntime }): React.JSX.Element {
  const content = <div className="runtime-control-popover-v2">
    <header><strong>本次会话运行配置</strong><span>修改后由 Bingo 保存并立即应用</span></header>
    <label><span>Provider</span><Select aria-label="Provider" value={runtime.config.provider} options={runtime.providers.map((provider) => ({ value: provider.name, label: provider.name }))} onChange={runtime.onProviderSelect} /></label>
    <label><span>Model</span><Select aria-label="Model" showSearch value={runtime.config.model} options={runtime.models.map((model) => ({ value: model, label: model }))} onChange={runtime.onModelSelect} /></label>
    <label><span>Thinking</span><Select aria-label="Thinking" value={runtime.config.thinking} options={thinkingOptions} onChange={runtime.onThinkingSelect} /></label>
    <label><span>权限模式</span><Select aria-label="权限模式" value={runtime.config.permissionMode} options={permissionOptions} onChange={runtime.onPermissionMode} /></label>
  </div>
  return <Popover trigger="click" placement="topLeft" content={content}>
    <Button className="runtime-control-trigger-v2" type="text" size="small" icon={<ControlOutlined />} title={`${runtime.config.provider} / ${runtime.config.model}`}>
      {runtime.config.model}
    </Button>
  </Popover>
}

const thinkingLevels: ThinkingLevel[] = ['off', 'low', 'medium', 'high', 'xhigh', 'max']
const thinkingOptions: Array<{ value: ThinkingLevel; label: string }> = thinkingLevels.map((value) => ({ value, label: value }))
const permissionOptions: Array<{ value: ConfigSnapshot['permissionMode']; label: string }> = [
  { value: 'default', label: '默认确认' },
  { value: 'acceptEdits', label: '自动接受编辑' },
  { value: 'plan', label: '计划模式' },
  { value: 'dontAsk', label: '不主动询问' },
  { value: 'bypassPermissions', label: '绕过确认' }
]
