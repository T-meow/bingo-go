import { describe, expect, it, vi } from 'vitest'
import type { RendererCliPayload } from '../../shared/contracts/ipc'
import type { ManagedSessionEvent } from '../runtime/sessionManager'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../storage/notificationPreferencesRepository'
import { NotificationCoordinator, type NotificationWindow, type SystemNotificationOptions } from './notificationCoordinator'

type WindowState = { visible: boolean; minimized: boolean; focused: boolean; destroyed: boolean }

function fixture(state: Partial<WindowState> = {}, supported = true): {
  coordinator: NotificationCoordinator
  state: WindowState
  notifications: Array<{ options: SystemNotificationOptions; click: () => void; show: () => void }>
  activate: ReturnType<typeof vi.fn>
  window: NotificationWindow
  setNow: (value: number) => void
} {
  const current = { visible: true, minimized: false, focused: true, destroyed: false, ...state }
  let now = 0
  const notifications: Array<{ options: SystemNotificationOptions; click: () => void; show: () => void }> = []
  const activate = vi.fn()
  const window = {
    isDestroyed: () => current.destroyed,
    isVisible: () => current.visible,
    isMinimized: () => current.minimized,
    isFocused: () => current.focused,
    restore: vi.fn(() => { current.minimized = false }),
    show: vi.fn(() => { current.visible = true }),
    focus: vi.fn(() => { current.focused = true })
  }
  const coordinator = new NotificationCoordinator({
    window,
    isSupported: () => supported,
    createNotification: (options) => {
      const item: { options: SystemNotificationOptions; click: () => void; show: () => void } = { options, click: () => undefined, show: vi.fn((): void => undefined) }
      notifications.push(item)
      return {
        on: (_event, listener) => { item.click = listener },
        show: item.show
      }
    },
    activate,
    now: () => now
  })
  coordinator.updatePreferences(DEFAULT_NOTIFICATION_PREFERENCES)
  return { coordinator, state: current, notifications, activate, window, setNow: (value) => { now = value } }
}

function event(payload: RendererCliPayload, connectionId = '123e4567-e89b-42d3-a456-426614174000'): ManagedSessionEvent {
  return { connectionId, sessionId: 'session-1', displayName: 'Release check', sequence: 1, payload }
}

const turnId = '123e4567-e89b-42d3-a456-426614174001'

describe('NotificationCoordinator', () => {
  it.each([
    ['hidden', { visible: false }],
    ['minimized', { minimized: true }],
    ['unfocused', { focused: false }]
  ])('notifies for a prompt while the window is %s', (_name, state) => {
    const item = fixture(state)
    item.coordinator.handle(event({ type: 'prompt.request', protocolVersion: 1, seq: 1, sessionId: 'session-1', turnId, promptId: '123e4567-e89b-42d3-a456-426614174002', kind: 'question', title: 'Question', question: 'Continue?', options: [], allowFreeText: true }))

    expect(item.notifications).toHaveLength(1)
    expect(item.notifications[0].options).toEqual({ title: 'Bingo 等待你的处理', body: '“Release check”需要你的确认或回答。', silent: false })
  })

  it('suppresses foreground, disabled, category-disabled, and unsupported notifications', () => {
    const foreground = fixture()
    foreground.coordinator.handle(event({ type: 'prompt.request', protocolVersion: 1, seq: 1, sessionId: 'session-1', turnId, promptId: '123e4567-e89b-42d3-a456-426614174002', kind: 'question', title: 'Question', question: 'Continue?', options: [], allowFreeText: true }))
    expect(foreground.notifications).toHaveLength(0)

    const disabled = fixture({ focused: false })
    disabled.coordinator.updatePreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: false })
    disabled.coordinator.handle(event({ type: 'transport.error', error: { code: 'FAIL', msg: 'private detail', level: 'flow', recoverable: true }, exitCode: 1, signal: null }))
    expect(disabled.notifications).toHaveLength(0)

    const category = fixture({ focused: false })
    category.coordinator.updatePreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, failures: false })
    category.coordinator.handle(event({ type: 'transport.error', error: { code: 'FAIL', msg: 'private detail', level: 'flow', recoverable: true }, exitCode: 1, signal: null }))
    expect(category.notifications).toHaveLength(0)

    const unsupported = fixture({ focused: false }, false)
    unsupported.coordinator.handle(event({ type: 'transport.error', error: { code: 'FAIL', msg: 'private detail', level: 'flow', recoverable: true }, exitCode: 1, signal: null }))
    expect(unsupported.notifications).toHaveLength(0)
  })

  it('notifies completion only at the ten-second boundary and clears cancelled turns', () => {
    const item = fixture({ focused: false })
    const started = { type: 'turn.started' as const, protocolVersion: 1 as const, seq: 1, sessionId: 'session-1', commandId: '123e4567-e89b-42d3-a456-426614174003', turnId }
    item.coordinator.handle(event(started))
    item.setNow(9_999)
    item.coordinator.handle(event({ type: 'turn.completed', protocolVersion: 1, seq: 2, sessionId: 'session-1', turnId }))
    expect(item.notifications).toHaveLength(0)

    item.setNow(20_000)
    item.coordinator.handle(event(started))
    item.setNow(30_000)
    item.coordinator.handle(event({ type: 'turn.completed', protocolVersion: 1, seq: 2, sessionId: 'session-1', turnId }))
    expect(item.notifications).toHaveLength(1)

    item.coordinator.handle(event(started))
    item.coordinator.handle(event({ type: 'turn.cancelled', protocolVersion: 1, seq: 2, sessionId: 'session-1', turnId, reason: 'requested' }))
    item.setNow(50_000)
    item.coordinator.handle(event({ type: 'turn.completed', protocolVersion: 1, seq: 3, sessionId: 'session-1', turnId }))
    expect(item.notifications).toHaveLength(1)
  })

  it('uses the sound preference and never includes runtime error details', () => {
    const item = fixture({ focused: false })
    item.coordinator.updatePreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, sound: false })
    item.coordinator.handle(event({ type: 'error', protocolVersion: 1, seq: 1, sessionId: 'session-1', scope: 'turn', turnId, code: 'SECRET', msg: 'sensitive workspace detail', level: 'page', recoverable: true }))

    expect(item.notifications[0].options).toEqual({ title: '任务运行失败', body: '“Release check”需要返回 Bingo Go 查看。', silent: true })
    expect(JSON.stringify(item.notifications[0].options)).not.toContain('sensitive')
  })

  it('deduplicates a session error followed by process exit and resets for a new connection', () => {
    const item = fixture({ focused: false })
    item.coordinator.handle(event({ type: 'error', protocolVersion: 1, seq: 1, sessionId: 'session-1', scope: 'session', code: 'FAIL', msg: 'failed', level: 'flow', recoverable: true }))
    item.coordinator.handle(event({ type: 'transport.error', error: { code: 'FAIL', msg: 'failed', level: 'flow', recoverable: true }, exitCode: 1, signal: null }))
    expect(item.notifications).toHaveLength(1)

    item.coordinator.handle(event({ type: 'transport.error', error: { code: 'FAIL', msg: 'failed', level: 'flow', recoverable: true }, exitCode: 1, signal: null }, '123e4567-e89b-42d3-a456-426614174099'))
    expect(item.notifications).toHaveLength(2)
  })

  it('restores and focuses the window before emitting notification activation', () => {
    const item = fixture({ visible: false, minimized: true, focused: false })
    item.coordinator.handle(event({ type: 'prompt.request', protocolVersion: 1, seq: 1, sessionId: 'session-1', turnId, promptId: '123e4567-e89b-42d3-a456-426614174002', kind: 'question', title: 'Question', question: 'Continue?', options: [], allowFreeText: true }))

    item.notifications[0].click()

    expect(item.window.restore).toHaveBeenCalledOnce()
    expect(item.window.show).toHaveBeenCalledOnce()
    expect(item.window.focus).toHaveBeenCalledOnce()
    expect(item.activate).toHaveBeenCalledWith({ connectionId: '123e4567-e89b-42d3-a456-426614174000', kind: 'action-required' })
  })
})
