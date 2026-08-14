import { useEffect, useRef, useState } from 'react'
import { Bubble, Sender, type BubbleItemType } from '@ant-design/x'
import { CheckOutlined, CloseOutlined, PauseOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Input, Modal, Space, Tag, Typography } from 'antd'
import type { TeamTask, TeamTaskMember, TeamTaskStatus } from '../../../../shared/contracts/cli'
import type { TeamState } from '../../state/teamReducer'
import { AssistantMarkdown } from '../chat/ChatPage'
import { MemberAvatar } from './TeamTaskCreateDrawer'
import { useUserProfile } from '../../profile/UserProfileProvider'

export function TeamTaskView({ state, busy, onLoad, onPost, onPause, onResume, onComplete, onCancel }: {
  state: TeamState
  busy: boolean
  onLoad: (taskId: string, beforeSeq?: number) => void
  onPost: (taskId: string, text: string) => Promise<boolean>
  onPause: (taskId: string) => void
  onResume: (taskId: string, message?: string) => Promise<boolean>
  onComplete: (taskId: string) => void
  onCancel: (taskId: string) => void
}): React.JSX.Element {
  const taskId = state.selection?.kind === 'task' ? state.selection.id : null
  const summary = state.tasks.find((task) => task.id === taskId)
  const detail = taskId ? state.taskDetails[taskId] : undefined
  const [draft, setDraft] = useState('')
  const [reviewDraft, setReviewDraft] = useState('')
  const profile = useUserProfile()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft('')
    setReviewDraft('')
    if (taskId && !detail) onLoad(taskId)
  }, [taskId])
  useEffect(() => {
    const scroll = scrollRef.current
    if (scroll) scroll.scrollTop = scroll.scrollHeight
  }, [detail?.messages.length, taskId])

  if (!summary) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧选择任务，或发起一个新任务" />
  if (!detail) return <div className="team-task-loading"><Typography.Text type="secondary">正在读取任务记录…</Typography.Text><Button type="text" icon={<ReloadOutlined />} loading={busy} onClick={() => onLoad(summary.id)}>重试</Button></div>

  const composer = taskComposerState(detail.status, busy)
  const oldest = detail.messages[0]?.seq
  const canLoadOlder = Boolean(oldest && oldest > 1)
  const submit = async (value: string): Promise<void> => {
    if (composer.disabled) return
    if (await onPost(detail.id, value)) setDraft('')
  }
  const resume = async (message?: string): Promise<void> => {
    if (await onResume(detail.id, message?.trim() || undefined)) setReviewDraft('')
  }

  return <div className="team-task-thread">
    <header className="team-task-header">
      <div><span>团队任务</span><h2>{detail.title}</h2><small>{detail.participants.map((member) => member.name).join('、')}</small></div>
      <Space wrap><TaskStatusTag status={detail.status} />{detail.status === 'running' && <Button icon={<PauseOutlined />} disabled={busy} onClick={() => onPause(detail.id)}>暂停</Button>}{detail.status !== 'completed' && detail.status !== 'cancelled' && <Button danger type="text" icon={<CloseOutlined />} disabled={busy} onClick={() => Modal.confirm({ title: `取消“${detail.title}”？`, content: '任务历史会保留，成员占用将被释放。', okText: '取消任务', cancelText: '返回', okButtonProps: { danger: true }, onOk: () => onCancel(detail.id) })}>取消</Button>}</Space>
    </header>
    <div ref={scrollRef} className="team-task-messages" aria-live="polite">
      {canLoadOlder && <Button className="team-load-older" type="text" loading={busy} onClick={() => onLoad(detail.id, oldest)}>加载更早消息</Button>}
      {detail.messages.length
        ? <Bubble.List rootClassName="team-message-list" items={taskMessages(detail, state, profile.snapshot)} role={{
          user: { placement: 'end', variant: 'filled', rootClassName: 'team-user-bubble' },
          member: { placement: 'start', variant: 'borderless', rootClassName: 'team-member-bubble' },
          system: { placement: 'start', variant: 'borderless', rootClassName: 'team-system-bubble' }
        }} />
        : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="任务还没有消息" />}
    </div>
    {detail.status === 'awaiting_review' && <div className="team-review-bar">
      <Alert type="info" showIcon message="领导人已请求验收" description={detail.reviewSummary || '请检查任务输出后选择完成，或输入意见继续任务。'} />
      <Input.TextArea value={reviewDraft} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="输入修改意见后继续（可选）" disabled={busy} onChange={(event) => setReviewDraft(event.target.value)} />
      <Space wrap><Button type="primary" icon={<CheckOutlined />} disabled={busy} onClick={() => onComplete(detail.id)}>完成任务</Button><Button disabled={busy} onClick={() => void resume(reviewDraft)}>继续任务</Button></Space>
    </div>}
    {detail.status === 'paused' && <div className="team-paused-bar"><span>{detail.pauseReason || '任务已暂停，不会自动唤醒成员。'}</span><Button type="primary" disabled={busy} onClick={() => void resume()}>恢复任务</Button></div>}
    {detail.status === 'pausing' && <Alert className="team-task-state-bar" type="warning" showIcon message="正在等待当前成员回合自然结束" />}
    {(detail.status === 'completed' || detail.status === 'cancelled') && <Alert className="team-task-state-bar" type={detail.status === 'completed' ? 'success' : 'info'} showIcon message={detail.status === 'completed' ? '任务已完成' : '任务已取消'} description="历史记录保留为只读。" />}
    <Sender value={composer.disabled ? '' : draft} disabled={composer.disabled} placeholder={composer.placeholder} onChange={setDraft} onSubmit={(value) => void submit(value)} />
  </div>
}

function taskComposerState(status: TeamTaskStatus, busy: boolean): { disabled: boolean; placeholder: string } {
  if (status !== 'running') return {
    disabled: true,
    placeholder: {
      pausing: '任务正在暂停，当前回合结束前无法发送',
      paused: '任务已暂停，请先恢复任务',
      awaiting_review: '任务待验收，请使用上方意见框继续任务',
      completed: '任务已完成，消息记录只读',
      cancelled: '任务已取消，消息记录只读'
    }[status]
  }
  return busy
    ? { disabled: true, placeholder: '正在处理团队操作，请稍候' }
    : { disabled: false, placeholder: '向任务群聊发送消息' }
}

function taskMessages(task: TeamTask, state: TeamState, profile: ReturnType<typeof useUserProfile>['snapshot']): BubbleItemType[] {
  return task.messages.map((message) => {
    if (message.kind === 'system') return {
      key: `${task.id}-${message.seq}`,
      role: 'system',
      content: <span className="team-system-message">{message.text}</span>
    }
    const member = message.kind === 'member' ? task.participants.find((participant) => participant.name === message.from) : undefined
    const user = message.kind === 'user'
    const speaker = user ? '用户' : member?.name ?? displaySpeakerName(message.from)
    return {
      key: `${task.id}-${message.seq}`,
      role: user ? 'user' : 'member',
      avatar: user
        ? <MemberAvatar name="用户" avatar={profile?.values.avatar} avatarDataUrl={profile?.avatarDataUrl} />
        : <MemberAvatar name={speaker} avatar={member?.avatar} avatarDataUrl={member ? state.snapshot?.members.find((item) => item.name === member.name && item.avatar === member.avatar)?.avatarDataUrl : undefined} />,
      header: <MessageHeader taskId={task.id} member={member} from={speaker} at={message.at} seq={message.seq} state={state} />,
      content: user ? <div className="user-message-text">{message.text}</div> : <AssistantMarkdown markdown={message.text} />
    }
  })
}

function displaySpeakerName(from?: string): string {
  return !from || from === 'main' ? '主 Agent' : from === 'user' ? '用户' : from
}

function MessageHeader({ taskId, member, from, at, seq, state }: { taskId: string; member?: TeamTaskMember; from: string; at: number; seq: number; state: TeamState }): React.JSX.Element {
  const current = member ? state.memberRuntime[member.name] : undefined
  const runtime = current?.taskId && current.taskId !== taskId ? undefined : current
  return <span className="team-message-header"><strong>{member?.name ?? from}</strong>{member && <i className={`team-member-state ${runtime?.status ?? 'offline'}`} />}
    <time>{new Date(at * 1_000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><small>#{seq}</small></span>
}

export function TaskStatusTag({ status }: { status: TeamTaskStatus }): React.JSX.Element {
  const color = status === 'running' ? 'processing' : status === 'pausing' ? 'warning' : status === 'awaiting_review' ? 'gold' : status === 'completed' ? 'success' : 'default'
  return <Tag color={color}>{{ running: '运行中', pausing: '正在暂停', paused: '已暂停', awaiting_review: '待验收', completed: '已完成', cancelled: '已取消' }[status]}</Tag>
}
