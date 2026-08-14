// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamTask, TeamTaskMessage, TeamTaskStatus, TeamTaskSummary } from '../../../../shared/contracts/cli'
import { initialTeamState, type TeamState } from '../../state/teamReducer'
import { TeamTaskView } from './TeamTaskView'

const member = {
  memberId: 'member-reviewer',
  name: 'reviewer',
  agent: 'reviewer',
  description: 'Reviews changes',
  system: 'Review carefully.',
  inheritSystem: true,
  profile: { constraints: [], preferences: [] },
  team: 'core-team',
  directory: '/workspace'
}

const taskFor = (status: TeamTaskStatus, messages: TeamTaskMessage[] = []): TeamTask => ({
  schemaVersion: 1,
  id: 'task-1',
  projectKey: 'project',
  projectPath: '/workspace',
  branch: 'main',
  team: 'core-team',
  title: 'Release review',
  description: 'Inspect blockers',
  status,
  participants: [member],
  leader: 'reviewer',
  channel: '__task_task-1',
  createdAt: 1,
  updatedAt: 2,
  messages
})

const summaryFor = (task: TeamTask): TeamTaskSummary => ({
  id: task.id,
  title: task.title,
  status: task.status,
  participants: task.participants,
  leader: task.leader,
  projectPath: task.projectPath,
  branch: task.branch,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  messageCount: task.messages.length,
  reviewSummary: task.reviewSummary ?? null
})

const stateFor = (status: TeamTaskStatus, messages: TeamTaskMessage[] = []): TeamState => {
  const task = taskFor(status, messages)
  return {
    ...initialTeamState,
    section: 'tasks',
    selection: { kind: 'task', id: task.id },
    tasks: [summaryFor(task)],
    taskDetails: { [task.id]: task }
  }
}

function renderTask(status: TeamTaskStatus, busy = false): { onPost: ReturnType<typeof vi.fn> } {
  const onPost = vi.fn().mockResolvedValue(true)
  render(<TeamTaskView
    state={stateFor(status)}
    busy={busy}
    onLoad={vi.fn()}
    onPost={onPost}
    onPause={vi.fn()}
    onResume={vi.fn().mockResolvedValue(true)}
    onComplete={vi.fn()}
    onCancel={vi.fn()}
  />)
  return { onPost }
}

describe('TeamTaskView composer', () => {
  beforeEach(() => {
    class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
    class IntersectionObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('submits and clears a running task message', async () => {
    const { onPost } = renderTask('running')
    const composer = screen.getByPlaceholderText('向任务群聊发送消息') as HTMLTextAreaElement
    expect(composer.disabled).toBe(false)

    fireEvent.change(composer, { target: { value: 'Continue the review' } })
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' })

    await waitFor(() => expect(onPost).toHaveBeenCalledWith('task-1', 'Continue the review'))
    await waitFor(() => expect(composer.value).toBe(''))
  })

  it('disables a running task while another team operation is pending', () => {
    const { onPost } = renderTask('running', true)
    const composer = screen.getByPlaceholderText('正在处理团队操作，请稍候') as HTMLTextAreaElement
    expect(composer.disabled).toBe(true)
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' })
    expect(onPost).not.toHaveBeenCalled()
  })

  it.each([
    ['pausing', '任务正在暂停，当前回合结束前无法发送'],
    ['paused', '任务已暂停，请先恢复任务'],
    ['awaiting_review', '任务待验收，请使用上方意见框继续任务'],
    ['completed', '任务已完成，消息记录只读'],
    ['cancelled', '任务已取消，消息记录只读']
  ] satisfies Array<[Exclude<TeamTaskStatus, 'running'>, string]>)('keeps the composer visible but disabled for %s', (status, placeholder) => {
    const { onPost } = renderTask(status)
    const composer = screen.getByPlaceholderText(placeholder) as HTMLTextAreaElement
    expect(composer.disabled).toBe(true)
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' })
    expect(onPost).not.toHaveBeenCalled()
  })

  it('shows user and member avatars beside their bubbles while system events stay centered', () => {
    const messages: TeamTaskMessage[] = [
      { seq: 1, kind: 'user', from: 'user', text: '请开始检查', at: 1 },
      { seq: 2, kind: 'member', from: 'reviewer', text: '检查完成', at: 2 },
      { seq: 3, kind: 'member', from: 'main', text: '已汇总结果', at: 3 },
      { seq: 4, kind: 'system', text: '任务已同步', at: 4 }
    ]
    const state = stateFor('running', messages)
    const detail = state.taskDetails['task-1']
    if (detail) detail.participants[0] = { ...detail.participants[0], avatar: 'identicon-02' }
    render(<TeamTaskView
      state={state}
      busy={false}
      onLoad={vi.fn()}
      onPost={vi.fn().mockResolvedValue(true)}
      onPause={vi.fn()}
      onResume={vi.fn().mockResolvedValue(true)}
      onComplete={vi.fn()}
      onCancel={vi.fn()}
    />)

    const userBubble = document.querySelector('.team-user-bubble')
    const memberBubble = document.querySelector('.team-member-bubble')
    const systemBubble = document.querySelector('.team-system-bubble')
    expect(userBubble?.classList.contains('ant-bubble-end')).toBe(true)
    expect(memberBubble?.classList.contains('ant-bubble-start')).toBe(true)
    expect(userBubble?.querySelector('img[alt="用户 的头像"]')).not.toBeNull()
    expect(memberBubble?.querySelector('img[alt="reviewer 的头像"]')).not.toBeNull()
    expect(document.querySelector('img[alt="主 Agent 的头像"]')).not.toBeNull()
    expect(screen.getByText('主 Agent')).toBeTruthy()
    expect(systemBubble?.querySelector('img')).toBeNull()
    expect(systemBubble?.textContent).toContain('任务已同步')
  })
})
