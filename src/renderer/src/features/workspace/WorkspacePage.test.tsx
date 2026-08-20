// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppStore } from '../../store/appStore'
import { initialAppStore } from '../../store/appStore'
import { WorkspacePage, type WorkspaceCallbacks } from './WorkspacePage'

beforeEach(() => {
  class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

describe('WorkspacePage', () => {
  it('renders members, rooms, tasks and deliveries as scan-friendly resource tables', () => {
    const agent = { id: 'agent_1', kind: 'crew' as const, name: 'frontend', description: '页面实现', prompt: '重构 Shell', state: 'running' as const, provider: 'openai', model: 'model', thinking: 'high' as const, cwd: '/workspace', outputTokens: 10, toolUses: 2, pending: 1, unacked: 0, lastActiveAt: 1, recentActivity: ['修改布局'] }
    const room = { id: 'room_1', name: 'design', mode: 'broadcast' as const, topic: '设计评审', members: ['frontend'], userIsMember: true, messageCount: 8, unread: 2, mentions: 1, lastSeq: 8 }
    const task = { id: 'task_1', subject: '视觉验收', description: '检查多视口', status: 'inProgress' as const, owner: 'frontend', blockedBy: [], blocks: [] }
    const delivery = { id: 'delivery_1', from: 'frontend', to: 'main', state: 'read' as const, private: false, followUps: 0, maxFollowUps: 2, updatedAt: 1 }
    const state: AppStore = {
      ...initialAppStore,
      capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true },
      agents: { active: [agent], count: 1, revision: 1, byId: new Map([[agent.id, agent]]) },
      rooms: { active: [room], count: 1, revision: 1, byId: new Map([[room.id, room]]) },
      tasks: { active: [task], count: 1, revision: 1, byId: new Map([[task.id, task]]) },
      deliveries: { active: [delivery], count: 1, revision: 1, byId: new Map([[delivery.id, delivery]]) }
    }
    const callbacks: WorkspaceCallbacks = {
      onOpenRoom: vi.fn(), onOpenAgent: vi.fn(), onMessageAgent: vi.fn(), onJoinRoom: vi.fn(), onLeaveRoom: vi.fn(),
      onStartTeam: vi.fn(), onStopTeam: vi.fn(), onStopAgent: vi.fn(), onAssign: vi.fn()
    }
    render(<App><WorkspacePage state={state} callbacks={callbacks} /></App>)

    expect(screen.getByText('frontend')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '房间 1' }))
    expect(screen.getByText('#design')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '任务 1' }))
    expect(screen.getByText('视觉验收')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '投递 1' }))
    expect(screen.getByText('frontend → main')).toBeTruthy()
  })
})
