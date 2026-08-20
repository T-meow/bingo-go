import { describe, expect, it, vi } from 'vitest'
import type { AppServerNotification, SessionSnapshot, Turn } from '../../shared/contracts/appServer'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../storage/notificationPreferencesRepository'
import { NotificationCoordinator, type NotificationWindow, type SystemNotificationOptions } from './notificationCoordinator'

type WindowState = { visible: boolean; minimized: boolean; focused: boolean; destroyed: boolean }

function fixture(state: Partial<WindowState> = {}, supported = true): {
  coordinator: NotificationCoordinator
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
      const item: { options: SystemNotificationOptions; click: () => void; show: () => void } = {
        options,
        click: () => undefined,
        show: vi.fn((): void => undefined)
      }
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
  return { coordinator, notifications, activate, window, setNow: (value) => { now = value } }
}

function snapshot(id = 'sess_1'): SessionSnapshot {
  return { session: { id, title: 'Release check', cwd: '/tmp' } } as SessionSnapshot
}

const event = { seq: 1, sessionId: 'sess_1', ts: 1 }
const turn = (status: Turn['status'] = 'running'): Turn => ({
  id: 'turn_1', conversationId: 'conv_main', inputItemIds: [], origin: 'user', round: 0,
  startedAt: 1, completedAt: status === 'running' ? null : 2, status, usage: null, error: status === 'failed' ? { code: 'SECRET', message: 'private detail' } : null
})
const notification = (value: Omit<AppServerNotification, 'jsonrpc'>): AppServerNotification => ({ jsonrpc: '2.0', ...value } as AppServerNotification)

describe('NotificationCoordinator', () => {
  it.each([
    ['hidden', { visible: false }],
    ['minimized', { minimized: true }],
    ['unfocused', { focused: false }]
  ])('notifies for an interaction while the window is %s', (_name, state) => {
    const item = fixture(state)
    item.coordinator.handle(snapshot(), notification({
      method: 'interaction/opened',
      params: {
        event,
        interaction: {
          id: 'int_1', conversationId: 'conv_main', openedAt: 1, remainingGuardMs: 0,
          prompt: { type: 'question', title: 'Question', question: 'Continue?', options: [], allowsFreeText: true }
        }
      }
    }))

    expect(item.notifications).toHaveLength(1)
    expect(item.notifications[0].options).toEqual({ title: 'Bingo 等待你的处理', body: '“Release check”需要你的确认或回答。', silent: false })
  })

  it('suppresses foreground, disabled, category-disabled, and unsupported notifications', () => {
    const failed = notification({ method: 'turn/completed', params: { event, conversationId: 'conv_main', turn: turn('failed') } })
    const foreground = fixture()
    foreground.coordinator.handle(snapshot(), failed)
    expect(foreground.notifications).toHaveLength(0)

    const disabled = fixture({ focused: false })
    disabled.coordinator.updatePreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: false })
    disabled.coordinator.handle(snapshot(), failed)
    expect(disabled.notifications).toHaveLength(0)

    const category = fixture({ focused: false })
    category.coordinator.updatePreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, failures: false })
    category.coordinator.handle(snapshot(), failed)
    expect(category.notifications).toHaveLength(0)

    const unsupported = fixture({ focused: false }, false)
    unsupported.coordinator.handle(snapshot(), failed)
    expect(unsupported.notifications).toHaveLength(0)
  })

  it('notifies completion only at the ten-second boundary and ignores interrupted turns', () => {
    const item = fixture({ focused: false })
    const started = notification({ method: 'turn/started', params: { event, conversationId: 'conv_main', turn: turn() } })
    item.coordinator.handle(snapshot(), started)
    item.setNow(9_999)
    item.coordinator.handle(snapshot(), notification({ method: 'turn/completed', params: { event, conversationId: 'conv_main', turn: turn('completed') } }))
    expect(item.notifications).toHaveLength(0)

    item.setNow(20_000)
    item.coordinator.handle(snapshot(), started)
    item.setNow(30_000)
    item.coordinator.handle(snapshot(), notification({ method: 'turn/completed', params: { event, conversationId: 'conv_main', turn: turn('completed') } }))
    expect(item.notifications).toHaveLength(1)

    item.coordinator.handle(snapshot(), started)
    item.setNow(50_000)
    item.coordinator.handle(snapshot(), notification({ method: 'turn/completed', params: { event, conversationId: 'conv_main', turn: turn('interrupted') } }))
    expect(item.notifications).toHaveLength(1)
  })

  it('uses sound preference and never includes runtime error details', () => {
    const item = fixture({ focused: false })
    item.coordinator.updatePreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, sound: false })
    item.coordinator.handle(snapshot(), notification({ method: 'turn/completed', params: { event, conversationId: 'conv_main', turn: turn('failed') } }))

    expect(item.notifications[0].options).toEqual({ title: '任务运行失败', body: '“Release check”需要返回 Bingo Go 查看。', silent: true })
    expect(JSON.stringify(item.notifications[0].options)).not.toContain('private detail')
  })

  it('deduplicates repeated transport exits and resets for a new session', () => {
    const item = fixture({ focused: false })
    item.coordinator.handleExit(snapshot(), new Error('private'))
    item.coordinator.handleExit(snapshot(), new Error('private'))
    expect(item.notifications).toHaveLength(1)

    item.coordinator.handleExit(snapshot('sess_2'), new Error('private'))
    expect(item.notifications).toHaveLength(2)
  })

  it('restores and focuses the window before emitting activation', () => {
    const item = fixture({ visible: false, minimized: true, focused: false })
    item.coordinator.handle(snapshot(), notification({
      method: 'interaction/opened',
      params: {
        event,
        interaction: {
          id: 'int_1', conversationId: 'conv_main', openedAt: 1, remainingGuardMs: 0,
          prompt: { type: 'confirmation', title: 'Confirm', detail: 'Continue?', confirmLabel: 'Continue' }
        }
      }
    }))
    item.notifications[0].click()

    expect(item.window.restore).toHaveBeenCalledOnce()
    expect(item.window.show).toHaveBeenCalledOnce()
    expect(item.window.focus).toHaveBeenCalledOnce()
    expect(item.activate).toHaveBeenCalledWith({ sessionId: 'sess_1', conversationId: 'conv_main', kind: 'action-required' })
  })
})
