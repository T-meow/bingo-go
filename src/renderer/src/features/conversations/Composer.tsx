import { Space, Tag, Tooltip } from 'antd'
import { Attachments, Sender } from '@ant-design/x'
import { SendOutlined, StopOutlined } from '@ant-design/icons'
import type { QueueEntry } from '../../../../shared/contracts/appServer'

export type ComposerAttachment = { uid: string; name: string; status?: 'ready' | 'error'; thumbUrl?: string }

export function Composer({ value, onChange, loading, onSubmit, onCancel, shellMode, onShellModeChange, queue, onReclaimTail, attachments }: {
  value: string
  onChange: (value: string) => void
  loading: boolean
  onSubmit: (text: string) => void
  onCancel: () => void
  shellMode: boolean
  onShellModeChange: (shell: boolean) => void
  queue: QueueEntry[]
  onReclaimTail: () => void
  attachments: ComposerAttachment[]
}): React.JSX.Element {
  return (
    <div className="composer-v2">
      <Sender
        value={value}
        onChange={onChange}
        loading={loading}
        onSubmit={(text) => { if (text.trim()) onSubmit(text) }}
        onCancel={onCancel}
        placeholder={shellMode ? '输入 Shell 命令，以 ! 执行' : '输入消息；@成员 或 #房间 可直接发送'}
        submitType="enter"
        autoSize={{ minRows: 1, maxRows: 8 }}
        prefix={<Sender.Switch value={shellMode} onChange={onShellModeChange} checkedChildren="Shell" unCheckedChildren="Chat" />}
        suffix={loading
          ? <Tooltip title="停止"><StopOutlined onClick={onCancel} aria-label="停止" /></Tooltip>
          : <SendOutlined aria-label="发送" />}
        footer={() => (
          <Space className="composer-footer-v2" size={4}>
            {queue.length > 0 && <>
              <Tag>队列 {queue.length}</Tag>
              <Tag color={queue.at(-1)?.steerEligible ? 'blue' : 'default'}>{queue.at(-1)?.steerEligible ? '可被吸收' : '等待中'}</Tag>
              <a onClick={onReclaimTail}>撤回队尾</a>
            </>}
          </Space>
        )}
      />
      {attachments.length > 0 && (
        <Attachments
          items={attachments.map((attachment) => ({ uid: attachment.uid, name: attachment.name, status: attachment.status === 'error' ? 'error' : 'done', thumbUrl: attachment.thumbUrl }))}
          disabled
        />
      )}
    </div>
  )
}
