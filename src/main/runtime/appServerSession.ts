import type {
  ActionExecuteParams,
  ActionExecuteResult,
  ActionListParams,
  ActionListResult,
  AppServerClientNotification,
  AppServerNotification,
  AppServerRequest,
  AssetReadChunkParams,
  AssetReadChunkResult,
  AssetRegisterPathParams,
  AssetRegisterPathResult,
  CatalogReadParams,
  CatalogReadResult,
  ConfigReadParams,
  ConfigReadResult,
  ConversationListParams,
  ConversationListResult,
  ConversationMarkReadParams,
  ConversationMarkReadResult,
  ConversationReadParams,
  ConversationReadResult,
  ConversationSubmitParams,
  ConversationSubmitResult,
  InitializeParams,
  InitializeResult,
  InitializedParams,
  InteractionRespondParams,
  InteractionRespondResult,
  QueueReadParams,
  QueueReadResult,
  QueueReclaimTailParams,
  QueueReclaimTailResult,
  ResourceReadParams,
  ResourceReadResult,
  SessionCloseParams,
  SessionCloseResult,
  SessionDeleteParams,
  SessionDeleteResult,
  SessionListParams,
  SessionListResult,
  SessionReadParams,
  SessionReadResult,
  SessionResumeParams,
  SessionResumeResult,
  SessionStartParams,
  SessionStartResult,
  TurnInterruptParams,
  TurnInterruptResult
} from '../../shared/contracts/appServer'
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

  async sessionList(params: SessionListParams = {}): Promise<SessionListResult> {
    return this.request('session/list', params)
  }

  async sessionStart(params: SessionStartParams): Promise<SessionStartResult> {
    return this.request('session/start', params)
  }

  async sessionResume(params: SessionResumeParams): Promise<SessionResumeResult> {
    return this.request('session/resume', params)
  }

  async sessionRead(params: SessionReadParams = {}): Promise<SessionReadResult> {
    return this.request('session/read', params)
  }

  async sessionClose(params: SessionCloseParams = {}): Promise<SessionCloseResult> {
    return this.request('session/close', params)
  }

  async sessionDelete(params: SessionDeleteParams): Promise<SessionDeleteResult> {
    return this.request('session/delete', params)
  }

  async conversationList(params: ConversationListParams = {}): Promise<ConversationListResult> {
    return this.request('conversation/list', params)
  }

  async conversationRead(params: ConversationReadParams): Promise<ConversationReadResult> {
    return this.request('conversation/read', params)
  }

  async conversationMarkRead(params: ConversationMarkReadParams): Promise<ConversationMarkReadResult> {
    return this.request('conversation/markRead', params)
  }

  async conversationSubmit(params: ConversationSubmitParams): Promise<ConversationSubmitResult> {
    return this.request('conversation/submit', params)
  }

  async composerSubmit(conversationId: string, text: string, mode: 'normal' | 'shell' = 'normal', attachments: Array<string> = []): Promise<ConversationSubmitResult> {
    return this.conversationSubmit({ conversationId, input: { type: 'composer', mode, text, attachments } })
  }

  async sendProse(conversationId: string, text: string, attachments: Array<string> = []): Promise<ConversationSubmitResult> {
    return this.conversationSubmit({ conversationId, input: { type: 'sendProse', text, attachments } })
  }

  async rewind(originConversationId: string, target: { type: 'item'; itemId: string } | { type: 'latest' }, mode: 'preview' | 'applied'): Promise<ActionExecuteResult> {
    return this.actionExecute({ originConversationId, precondition: null, action: { type: 'conversationRewind', target, mode } })
  }

  async turnInterrupt(params: TurnInterruptParams): Promise<TurnInterruptResult> {
    return this.request('turn/interrupt', params)
  }

  async queueRead(params: QueueReadParams): Promise<QueueReadResult> {
    return this.request('queue/read', params)
  }

  async queueReclaimTail(params: QueueReclaimTailParams): Promise<QueueReclaimTailResult> {
    return this.request('queue/reclaimTail', params)
  }

  async interactionRespond(params: InteractionRespondParams): Promise<InteractionRespondResult> {
    return this.request('interaction/respond', params)
  }

  async actionList(params: ActionListParams = {}): Promise<ActionListResult> {
    return this.request('action/list', params)
  }

  async actionExecute(params: ActionExecuteParams): Promise<ActionExecuteResult> {
    return this.request('action/execute', params)
  }

  async configRead(params: ConfigReadParams = {}): Promise<ConfigReadResult> {
    return this.request('config/read', params)
  }

  async catalogRead(params: CatalogReadParams): Promise<CatalogReadResult> {
    return this.request('catalog/read', params)
  }

  async resourceRead(params: ResourceReadParams): Promise<ResourceReadResult> {
    return this.request('resource/read', params)
  }

  async assetRegisterPath(params: AssetRegisterPathParams): Promise<AssetRegisterPathResult> {
    return this.request('asset/registerPath', params)
  }

  async assetReadChunk(params: AssetReadChunkParams): Promise<AssetReadChunkResult> {
    return this.request('asset/readChunk', params)
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
