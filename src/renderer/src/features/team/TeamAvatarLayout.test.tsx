// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamLobby, TeamSnapshot } from '../../../../shared/contracts/cli'
import { ChannelView, LobbyView, MemberView } from './TeamPage'

const member: TeamSnapshot['members'][number] = {
  name: 'reviewer', agent: 'reviewer', avatar: 'identicon-02', status: 'standby',
  pending: 0, unacked: 0, model: 'deepseek-chat', provider: 'deepseek', kind: 'crew'
}

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

describe('Team avatar layouts', () => {
  it('places lobby user and member avatars beside opposite bubbles and centers system events', () => {
    const lobby: TeamLobby = {
      schemaVersion: 1, id: 'lobby-1', projectKey: 'project', projectPath: '/workspace', branch: 'main',
      messages: [
        { seq: 1, kind: 'user', from: 'user', targets: [], text: '开始检查', at: 1 },
        { seq: 2, kind: 'member', from: 'reviewer', targets: [], text: '检查完成', at: 2 },
        { seq: 3, kind: 'system', targets: [], text: '大厅已同步', at: 3 }
      ]
    }
    render(<LobbyView lobby={lobby} members={[member]} busy={false} selected={[]} onSelectedChange={vi.fn()} onCreateTask={vi.fn()} onPost={vi.fn().mockResolvedValue(true)} />)

    const userBubble = document.querySelector('.team-user-bubble')
    const memberBubble = document.querySelector('.team-member-bubble')
    const systemBubble = document.querySelector('.team-system-bubble')
    expect(userBubble?.classList.contains('ant-bubble-end')).toBe(true)
    expect(memberBubble?.classList.contains('ant-bubble-start')).toBe(true)
    expect(userBubble?.querySelector('img[alt="用户 的头像"]')).not.toBeNull()
    expect(memberBubble?.querySelector('img[alt="reviewer 的头像"]')).not.toBeNull()
    expect(systemBubble?.querySelector('img')).toBeNull()
    expect(systemBubble?.textContent).toContain('大厅已同步')
  })

  it('places channel user messages on the right and member messages on the left', () => {
    const channel: TeamSnapshot['channels'][number] = {
      name: 'review', mode: 'serial', seq: 2, frozen: false, members: ['reviewer'],
      messages: [
        { seq: 1, from: 'user', text: '请检查', at: 1 },
        { seq: 2, from: 'reviewer', text: '收到', at: 2 }
      ]
    }
    render(<ChannelView channel={channel} members={[member]} busy={false} onPost={vi.fn().mockResolvedValue(true)} />)

    const userBubble = document.querySelector('.team-user-bubble')
    const memberBubble = document.querySelector('.team-member-bubble')
    expect(userBubble?.classList.contains('ant-bubble-end')).toBe(true)
    expect(memberBubble?.classList.contains('ant-bubble-start')).toBe(true)
    expect(userBubble?.querySelector('img[alt="用户 的头像"]')).not.toBeNull()
    expect(memberBubble?.querySelector('img[alt="reviewer 的头像"]')).not.toBeNull()
  })

  it('saves an edited fixed-member avatar and keeps temporary-member editing disabled', async () => {
    const onSaveAvatar = vi.fn().mockResolvedValue(true)
    const { unmount } = render(<MemberView member={member} activity={[]} busy={false} editable onImportAvatar={vi.fn().mockResolvedValue(null)} onSaveAvatar={onSaveAvatar} onMessage={vi.fn().mockResolvedValue(true)} />)
    fireEvent.click(screen.getByRole('button', { name: /修改头像/ }))
    fireEvent.click(await screen.findByTitle('identicon-03'))
    fireEvent.click(screen.getByRole('button', { name: '保存头像' }))
    await waitFor(() => expect(onSaveAvatar).toHaveBeenCalledWith('identicon-03'))

    unmount()
    render(<MemberView member={{ ...member, kind: 'hire' }} activity={[]} busy={false} editable={false} onImportAvatar={vi.fn().mockResolvedValue(null)} onSaveAvatar={vi.fn().mockResolvedValue(true)} onMessage={vi.fn().mockResolvedValue(true)} />)
    expect((screen.getByRole('button', { name: /修改头像/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /修改头像/ }).getAttribute('title')).toBe('固定成员后可修改头像')
  })
})
