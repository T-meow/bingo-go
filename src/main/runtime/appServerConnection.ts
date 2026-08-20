import type {
  ActionExecuteResult,
  ActionListResult,
  AppServerClientNotification,
  AppServerNotification,
  AppServerRequest,
  AppServerResponse,
  AssetReadChunkResult,
  AssetRegisterPathResult,
  CatalogReadResult,
  ConfigReadResult,
  ConversationListResult,
  ConversationMarkReadResult,
  ConversationReadResult,
  ConversationSubmitResult,
  ErrorData,
  InitializeParams,
  InitializeResult,
  InitializedParams,
  InteractionRespondResult,
  QueueReadResult,
  QueueReclaimTailResult,
  RequestId,
  ResourceReadResult,
  SessionCloseResult,
  SessionDeleteResult,
  SessionListResult,
  SessionReadResult,
  SessionResumeResult,
  SessionStartResult,
  ShutdownResult,
  TurnInterruptResult
} from '../../shared/contracts/appServer'
import {
  AppServerTransport,
  AppServerTransportError,
  type AppServerTransportExit,
  type AppServerTransportFrame
} from './appServerTransport'

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export type AppServerConnectionHandlers = {
  onNotification(notification: AppServerNotification): void
  onDesync(info: { expectedSeq: number | null; actual: number }): void
  onExit(exit: AppServerTransportExit, stderr: string, error: Error | null): void
}

export type AppServerResultMap = {
  initialize: InitializeResult
  shutdown: ShutdownResult
  'session/list': SessionListResult
  'session/start': SessionStartResult
  'session/resume': SessionResumeResult
  'session/read': SessionReadResult
  'session/close': SessionCloseResult
  'session/delete': SessionDeleteResult
  'conversation/list': ConversationListResult
  'conversation/read': ConversationReadResult
  'conversation/markRead': ConversationMarkReadResult
  'conversation/submit': ConversationSubmitResult
  'turn/interrupt': TurnInterruptResult
  'queue/read': QueueReadResult
  'queue/reclaimTail': QueueReclaimTailResult
  'interaction/respond': InteractionRespondResult
  'action/list': ActionListResult
  'action/execute': ActionExecuteResult
  'config/read': ConfigReadResult
  'catalog/read': CatalogReadResult
  'resource/read': ResourceReadResult
  'asset/registerPath': AssetRegisterPathResult
  'asset/readChunk': AssetReadChunkResult
}

export class AppServerCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly level: 'field' | 'page' | 'flow',
    readonly recoverable: boolean,
    readonly scope: string,
    readonly data?: ErrorData
  ) {
    super(message)
    this.name = 'AppServerCommandError'
  }
}

type Pending = {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: NodeJS.Timeout
  method: string
}

type ConnectionState = 'idle' | 'starting' | 'initializing' | 'ready' | 'closing' | 'closed' | 'failed'

export class AppServerConnection {
  private transport: AppServerTransport | null = null
  private readonly pending = new Map<string, Pending>()
  private nextRequestId = 1
  private state: ConnectionState = 'idle'
  private expectedSeq: number | null = null

  constructor(
    private readonly binaryPath: string,
    private readonly cwd: string,
    private readonly handlers: AppServerConnectionHandlers,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async start(options: Partial<InitializeParams> = {}): Promise<InitializeResult> {
    if (this.state !== 'idle') throw new Error(`AppServerConnection cannot start from state ${this.state}`)
    this.state = 'starting'
    this.transport = new AppServerTransport(this.binaryPath, this.cwd, {
      onFrame: (frame) => this.handleFrame(frame),
      onError: (error) => this.handleTransportError(error),
      onExit: (exit, stderr) => this.handleExit(exit, stderr)
    }, this.env)
    this.transport.start()
    this.state = 'initializing'
    const params: InitializeParams = {
      capabilities: { interactionResponse: true },
      client: { name: 'bingo-go', version: '0.1.0' },
      protocol: { major: 1, minMinor: 0, maxMinor: 0 },
      ...options
    }
    const result = await this.requestUnchecked('initialize', params, { skipReadyCheck: true }) as InitializeResult
    this.transport.setLimits(result.limits)
    this.sendNotification('initialized', {})
    this.state = 'ready'
    return result
  }

  request<M extends keyof AppServerResultMap>(
    method: M,
    params: Extract<AppServerRequest, { method: M }>['params'],
    options: { timeoutMs?: number } = {}
  ): Promise<AppServerResultMap[M]> {
    return this.requestUnchecked(method, params, options) as Promise<AppServerResultMap[M]>
  }

  notify(method: AppServerClientNotification['method'], params: InitializedParams = {}): void {
    this.sendNotification(method, params)
  }

  async shutdown(): Promise<void> {
    if (this.state !== 'ready') return
    this.state = 'closing'
    try {
      await this.requestUnchecked('shutdown', {}, { skipReadyCheck: true })
    } catch {
      // Clean EOF and transport errors are both acceptable once shutdown ran.
    } finally {
      await this.close()
    }
  }

  async close(): Promise<void> {
    if (this.state === 'closed') return
    this.state = 'closed'
    const transport = this.transport
    this.transport = null
    this.rejectPending(new Error('AppServerConnection closed'))
    if (transport) {
      transport.end()
      await new Promise<void>((resolve) => {
        const started = Date.now()
        const poll = (): void => {
          if (!transport.running || Date.now() - started > 1_000) resolve()
          else setTimeout(poll, 10)
        }
        poll()
      })
      transport.close()
    }
  }

  get connectionState(): ConnectionState {
    return this.state
  }

  get expectedSequence(): number | null {
    return this.expectedSeq
  }

  private requestUnchecked(method: string, params: unknown, options: { timeoutMs?: number; skipReadyCheck?: boolean } = {}): Promise<unknown> {
    if (!this.transport) return Promise.reject(new Error('AppServerConnection is not running'))
    if (!options.skipReadyCheck && this.state !== 'ready') return Promise.reject(new Error(`AppServerConnection cannot request ${method} from state ${this.state}`))
    const id = String(this.nextRequestId++)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} did not complete within ${options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS} ms`))
      }, options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer, method })
      try {
        this.transport?.write({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    this.transport?.write({ jsonrpc: '2.0', method, params })
  }

  private handleFrame(frame: AppServerTransportFrame): void {
    if (frame.kind === 'notification') {
      this.acceptNotification(frame.method, frame.params)
      return
    }
    if (typeof frame.id !== 'string') return
    const pending = this.pending.get(frame.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(frame.id)
    if (frame.error) {
      pending.reject(toCommandError(frame.error, pending.method))
    } else {
      pending.resolve(frame.result)
    }
  }

  private acceptNotification(method: string, params: Record<string, unknown>): void {
    const event = params.event
    if (isEventMeta(event)) {
      if (this.expectedSeq !== null) {
        const start = typeof event.coalescedFrom === 'number' ? event.coalescedFrom : event.seq
        if (start !== this.expectedSeq) {
          const info = { expectedSeq: this.expectedSeq, actual: start }
          this.expectedSeq = null
          this.handlers.onDesync(info)
          return
        }
      }
      this.expectedSeq = event.seq + 1
    }
    this.handlers.onNotification({ jsonrpc: '2.0', method, params } as unknown as AppServerNotification)
  }

  private handleTransportError(error: Error): void {
    if (this.state === 'closed') return
    this.state = 'failed'
    this.rejectPending(error)
  }

  private handleExit(exit: AppServerTransportExit, stderr: string): void {
    const wasClosed = this.state === 'closed'
    const wasFailed = this.state === 'failed'
    let error: Error | null = null
    if (!wasClosed && !wasFailed) {
      error = new Error(`bingo app-server exited before shutdown (code=${exit.exitCode ?? 'null'}, signal=${exit.signal ?? 'null'})`)
      this.rejectPending(error)
    } else if (wasFailed) {
      error = new Error(`bingo app-server exited (code=${exit.exitCode ?? 'null'}, signal=${exit.signal ?? 'null'})`)
    }
    this.state = 'closed'
    this.handlers.onExit(exit, stderr, error)
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function isEventMeta(value: unknown): value is { seq: number; coalescedFrom?: number | null; sessionId: string; ts: number } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).seq === 'number'
    && typeof (value as Record<string, unknown>).sessionId === 'string'
}

function toCommandError(error: { code: number; message: string; data?: unknown }, method: string): AppServerCommandError {
  const data = isRecord(error.data) ? error.data as unknown as ErrorData : undefined
  const scope = data?.scope ?? 'request'
  return new AppServerCommandError(
    data?.bingoCode ?? `JSONRPC_${error.code}`,
    error.message || `${method} failed`,
    levelForScope(scope),
    data?.recoverable ?? true,
    scope,
    data
  )
}

function levelForScope(scope: string): 'field' | 'page' | 'flow' {
  if (scope === 'request' || scope === 'interaction' || scope === 'item') return 'field'
  if (scope === 'conversation' || scope === 'turn' || scope === 'queue') return 'page'
  return 'flow'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
