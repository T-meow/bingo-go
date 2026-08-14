import type { NotificationActivation, NotificationPreferencesV1 } from '../../shared/contracts/ipc'
import type { ManagedSessionEvent } from '../runtime/sessionManager'

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
  private connectionId: string | null = null
  private activeTurn: { turnId: string; startedAt: number } | null = null
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

  handle(event: ManagedSessionEvent): void {
    this.adoptConnection(event.connectionId)
    const payload = event.payload

    if (payload.type === 'turn.started') {
      this.activeTurn = { turnId: payload.turnId, startedAt: this.now() }
      return
    }
    if (payload.type === 'turn.completed') {
      const activeTurn = this.takeTurn(payload.turnId)
      if (activeTurn && this.now() - activeTurn.startedAt >= TURN_COMPLETED_NOTIFICATION_THRESHOLD_MS) {
        this.notify('turn-completed', event, '任务已完成', `“${displayName(event.displayName)}”已完成处理。`)
      }
      return
    }
    if (payload.type === 'turn.cancelled') {
      this.takeTurn(payload.turnId)
      return
    }
    if (payload.type === 'prompt.request') {
      this.notify('action-required', event, 'Bingo 等待你的处理', `“${displayName(event.displayName)}”需要你的确认或回答。`)
      return
    }
    if (payload.type === 'error' && (payload.scope === 'turn' || payload.scope === 'session')) {
      if (payload.turnId) this.takeTurn(payload.turnId)
      if (payload.scope === 'session') this.sessionFailureHandled = true
      this.notify('failure', event, '任务运行失败', `“${displayName(event.displayName)}”需要返回 Bingo Go 查看。`)
      return
    }
    if (payload.type === 'transport.error') {
      this.activeTurn = null
      if (this.sessionFailureHandled) return
      this.sessionFailureHandled = true
      this.notify('failure', event, '任务运行失败', `“${displayName(event.displayName)}”需要返回 Bingo Go 查看。`)
    }
  }

  private adoptConnection(connectionId: string): void {
    if (this.connectionId === connectionId) return
    this.connectionId = connectionId
    this.activeTurn = null
    this.sessionFailureHandled = false
  }

  private takeTurn(turnId: string): { turnId: string; startedAt: number } | null {
    if (this.activeTurn?.turnId !== turnId) return null
    const activeTurn = this.activeTurn
    this.activeTurn = null
    return activeTurn
  }

  private notify(kind: NotificationActivation['kind'], event: ManagedSessionEvent, title: string, body: string): void {
    if (!this.shouldNotify(kind)) return
    try {
      const notification = this.dependencies.createNotification({ title, body, silent: !this.preferences.sound })
      notification.on('click', () => this.activate(event.connectionId, kind))
      notification.show()
    } catch {
      // Native notification failures must not affect the session event stream.
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

  private activate(connectionId: string, kind: NotificationActivation['kind']): void {
    const window = this.dependencies.window
    if (window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    if (!window.isVisible()) window.show()
    window.focus()
    this.dependencies.activate({ connectionId, kind })
  }
}

function displayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 80)
  return normalized || '当前对话'
}
