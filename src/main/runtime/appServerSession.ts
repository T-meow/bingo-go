import type { InitializeParams, InitializeResult, AppServerNotification, AppServerClientNotification, AppServerRequest, InitializedParams } from '../../shared/contracts/appServer'
import { AppServerConnection, AppServerCommandError, type AppServerResultMap, type AppServerConnectionHandlers } from './appServerConnection'
import type { AppServerTransportExit } from './appServerTransport'

export type AppServerSessionHandlers = {
  onNotification(notification: AppServerNotification): void
  onDesync(info: { expectedSeq: number | null; actual: number }): void
  onExit(exit: AppServerTransportExit, stderr: string, error: Error | null): void
}

export class AppServerSession {
  private connection: AppServerConnection | null = null

  constructor(
    private readonly binaryPath: string,
    private readonly cwd: string,
    private readonly handlers: AppServerSessionHandlers,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async open(options: Partial<InitializeParams> = {}): Promise<InitializeResult> {
    if (this.connection) throw new Error('AppServerSession is already open')
    this.connection = new AppServerConnection(this.binaryPath, this.cwd, {
      onNotification: (notification) => this.handlers.onNotification(notification),
      onDesync: (info) => this.handlers.onDesync(info),
      onExit: (exit, stderr, error) => this.handlers.onExit(exit, stderr, error)
    }, this.env)
    return this.connection.start(options)
  }

  request<M extends keyof AppServerResultMap>(
    method: M,
    params: Extract<AppServerRequest, { method: M }>['params'],
    options: { timeoutMs?: number } = {}
  ): Promise<AppServerResultMap[M]> {
    return this.requireConnection().request(method, params as never, options)
  }

  notify(method: AppServerClientNotification['method'], params: InitializedParams = {}): void {
    this.requireConnection().notify(method, params)
  }

  async shutdown(): Promise<void> {
    const connection = this.connection
    this.connection = null
    await connection?.shutdown()
  }

  async close(): Promise<void> {
    const connection = this.connection
    this.connection = null
    await connection?.close()
  }

  get state(): string {
    return this.connection?.connectionState ?? 'idle'
  }

  private requireConnection(): AppServerConnection {
    if (!this.connection) throw new Error('AppServerSession is not open')
    return this.connection
  }
}

export { AppServerCommandError }
