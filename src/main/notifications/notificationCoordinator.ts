import type { AppServerNotification, SessionSnapshot } from '../../shared/contracts/appServer'
import type { NotificationActivation, NotificationPreferencesV1 } from '../../shared/contracts/ipc'

export const TURN_COMPLETED_NOTIFICATION_THRESHOLD_MS = 10_000

export type NotificationWindow = {
  isDestroyed(): boolean
  isVisible(): boolean
  isMinimized(): boolean
  isFocused(): boolean
  restore(): void
  show(): void
  focus(): void
}

export type SystemNotification = {
  on(event: 'click', listener: () => void): unknown
  show(): void
}

export type SystemNotificationOptions = { title: string; body: string; silent: boolean }

type NotificationCoordinatorDependencies = {
  window: NotificationWindow
  isSupported: () => boolean
  createNotification: (options: SystemNotificationOptions) => SystemNotification
  activate: (event: NotificationActivation) => void
  now?: () => number
}

const DISABLED_PREFERENCES: NotificationPreferencesV1 = {
  schemaVersion: 1,
  enabled: false,
  turnCompleted: false,
  actionRequired: false,
  failures: false,
  sound: false
}

export class NotificationCoordinator {
  private preferences = DISABLED_PREFERENCES
  private sessionId: string | null = null
  private activeTurns = new Map<string, { conversationId: string; startedAt: number }>()
  private sessionFailureHandled = false
  private readonly now: () => number

  constructor(private readonly dependencies: NotificationCoordinatorDependencies) {
    this.now = dependencies.now ?? (() => performance.now())
  }

  isSupported(): boolean {
    try { return this.dependencies.isSupported() } catch { return false }
  }

  updatePreferences(preferences: NotificationPreferencesV1): void {
    this.preferences = { ...preferences }
  }

  disable(): void {
    this.preferences = { ...DISABLED_PREFERENCES }
  }

  handle(snapshot: SessionSnapshot | null, notification: AppServerNotification): void {
    const eventSessionId = notification.params.event.sessionId
    this.adoptSession(snapshot?.session.id ?? eventSessionId)
    const title = displayName(snapshot?.session.title ?? snapshot?.session.cwd ?? '当前对话')

    if (notification.method === 'turn/started') {
      this.activeTurns.set(notification.params.turn.id, {
        conversationId: notification.params.conversationId,
        startedAt: this.now()
      })
      return
    }
    if (notification.method === 'turn/completed') {
      const activeTurn = this.takeTurn(notification.params.turn.id)
      if (notification.params.turn.status === 'failed') {
        this.notify('failure', eventSessionId, notification.params.conversationId, '任务运行失败', `“${title}”需要返回 Bingo Go 查看。`)
        return
      }
      if (notification.params.turn.status === 'completed' && activeTurn && this.now() - activeTurn.startedAt >= TURN_COMPLETED_NOTIFICATION_THRESHOLD_MS) {
        this.notify('turn-completed', eventSessionId, notification.params.conversationId, '任务已完成', `“${title}”已完成处理。`)
      }
      return
    }
    if (notification.method === 'interaction/opened') {
      this.notify('action-required', eventSessionId, notification.params.interaction.conversationId, 'Bingo 等待你的处理', `“${title}”需要你的确认或回答。`)
      return
    }
    if (notification.method === 'feedback/raised' && notification.params.feedback.level === 'error') {
      this.notify('failure', eventSessionId, notification.params.feedback.conversationId ?? undefined, '任务运行失败', `“${title}”需要返回 Bingo Go 查看。`)
      return
    }
    if (notification.method === 'operation/completed' && notification.params.operation.status === 'failed') {
      this.notify('failure', eventSessionId, notification.params.operation.conversationId ?? undefined, '操作执行失败', `“${title}”需要返回 Bingo Go 查看。`)
      return
    }
    if (notification.method === 'session/closed' || notification.method === 'session/deleted') {
      this.activeTurns.clear()
    }
  }

  handleExit(snapshot: SessionSnapshot | null, error: Error | null): void {
    if (!error) return
    const sessionId = snapshot?.session.id ?? this.sessionId
    if (!sessionId) return
    this.adoptSession(sessionId)
    this.activeTurns.clear()
    if (this.sessionFailureHandled) return
    this.sessionFailureHandled = true
    const title = displayName(snapshot?.session.title ?? snapshot?.session.cwd ?? '当前对话')
    this.notify('failure', sessionId, undefined, '运行时连接失败', `“${title}”需要返回 Bingo Go 查看。`)
  }

  private adoptSession(sessionId: string): void {
    if (this.sessionId === sessionId) return
    this.sessionId = sessionId
    this.activeTurns.clear()
    this.sessionFailureHandled = false
  }

  private takeTurn(turnId: string): { conversationId: string; startedAt: number } | null {
    const activeTurn = this.activeTurns.get(turnId) ?? null
    this.activeTurns.delete(turnId)
    return activeTurn
  }

  private notify(kind: NotificationActivation['kind'], sessionId: string, conversationId: string | undefined, title: string, body: string): void {
    if (!this.shouldNotify(kind)) return
    try {
      const notification = this.dependencies.createNotification({ title, body, silent: !this.preferences.sound })
      notification.on('click', () => this.activate({ sessionId, ...(conversationId ? { conversationId } : {}), kind }))
      notification.show()
    } catch {
      // Native notification failures must not affect the app-server event stream.
    }
  }

  private shouldNotify(kind: NotificationActivation['kind']): boolean {
    if (!this.preferences.enabled || !this.isSupported() || !this.isBackground()) return false
    if (kind === 'turn-completed') return this.preferences.turnCompleted
    if (kind === 'action-required') return this.preferences.actionRequired
    return this.preferences.failures
  }

  private isBackground(): boolean {
    const window = this.dependencies.window
    if (window.isDestroyed()) return false
    return !window.isVisible() || window.isMinimized() || !window.isFocused()
  }

  private activate(event: NotificationActivation): void {
    const window = this.dependencies.window
    if (window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    if (!window.isVisible()) window.show()
    window.focus()
    this.dependencies.activate(event)
  }
}

function displayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 80)
  return normalized || '当前对话'
}
