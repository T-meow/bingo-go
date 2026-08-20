import type {
  ActionExecuteParams,
  ActionExecuteResult,
  ActionListResult,
  AppServerNotification,
  AssetReadChunkParams,
  AssetReadChunkResult,
  AssetRegisterPathParams,
  AssetRegisterPathResult,
  CatalogReadParams,
  CatalogReadResult,
  ConfigReadResult,
  ConversationMarkReadParams,
  ConversationMarkReadResult,
  ConversationReadParams,
  ConversationReadResult,
  ConversationSubmitResult,
  QueueReadParams,
  QueueReadResult,
  QueueReclaimTailParams,
  QueueReclaimTailResult,
  ResourceReadParams,
  ResourceReadResult,
  SessionLocator,
  SessionSnapshot,
  SessionStartResult,
  SessionDeleteParams,
  SessionDeleteResult,
  SessionListResult
} from '../../shared/contracts/appServer'
import { AppServerSession } from './appServerSession'
import type { AppServerTransportExit } from './appServerTransport'

export type AppServerSessionManagerHandlers = {
  onSnapshot(snapshot: SessionSnapshot): void
  onNotification(notification: AppServerNotification): void
  onDesync(info: { expectedSeq: number | null; actual: number }): void
  onExit(exit: AppServerTransportExit, stderr: string, error: Error | null): void
}

export class AppServerSessionManager {
  private session: AppServerSession | null = null
  private snapshot: SessionSnapshot | null = null

  constructor(
    private readonly binaryPath: string,
    private readonly cwd: string,
    private readonly handlers: AppServerSessionManagerHandlers,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async start(workspacePath?: string): Promise<SessionSnapshot> {
    await this.close()
    const session = new AppServerSession(this.binaryPath, workspacePath ?? this.cwd, {
      onNotification: (notification) => this.handlers.onNotification(notification),
      onDesync: (info) => {
        this.handlers.onDesync(info)
        void this.resynchronize().catch(() => undefined)
      },
      onExit: (exit, stderr, error) => this.handlers.onExit(exit, stderr, error)
    }, this.env)
    await session.open()
    this.session = session
    const result = await session.sessionStart({ cwd: workspacePath ?? this.cwd })
    this.snapshot = result.snapshot
    this.handlers.onSnapshot(result.snapshot)
    return result.snapshot
  }

  async resume(locator: SessionLocator): Promise<SessionSnapshot> {
    await this.close()
    const session = new AppServerSession(this.binaryPath, this.cwd, {
      onNotification: (notification) => this.handlers.onNotification(notification),
      onDesync: (info) => {
        this.handlers.onDesync(info)
        void this.resynchronize().catch(() => undefined)
      },
      onExit: (exit, stderr, error) => this.handlers.onExit(exit, stderr, error)
    }, this.env)
    await session.open()
    this.session = session
    const result = await session.sessionResume({ locator })
    this.snapshot = result.snapshot
    this.handlers.onSnapshot(result.snapshot)
    return result.snapshot
  }

  async resynchronize(): Promise<SessionSnapshot> {
    const session = this.requireSession()
    const result = await session.sessionRead({})
    this.snapshot = result.snapshot
    this.handlers.onSnapshot(result.snapshot)
    return result.snapshot
  }

  async sessionList(): Promise<SessionListResult> {
    return this.requireSession().sessionList({})
  }

  async sessionRead(): Promise<SessionSnapshot> {
    return this.resynchronize()
  }

  async sessionDelete(params: SessionDeleteParams): Promise<SessionDeleteResult> {
    return this.requireSession().sessionDelete(params)
  }

  async conversationRead(params: ConversationReadParams): Promise<ConversationReadResult> {
    return this.requireSession().conversationRead(params)
  }

  async conversationMarkRead(params: ConversationMarkReadParams): Promise<ConversationMarkReadResult> {
    return this.requireSession().conversationMarkRead(params)
  }

  async composerSubmit(conversationId: string, text: string, mode: 'normal' | 'shell' = 'normal', attachments: Array<string> = []): Promise<ConversationSubmitResult> {
    return this.requireSession().composerSubmit(conversationId, text, mode, attachments)
  }

  async sendProse(conversationId: string, text: string, attachments: Array<string> = []): Promise<ConversationSubmitResult> {
    return this.requireSession().sendProse(conversationId, text, attachments)
  }

  async queueRead(params: QueueReadParams): Promise<QueueReadResult> {
    return this.requireSession().queueRead(params)
  }

  async queueReclaimTail(params: QueueReclaimTailParams): Promise<QueueReclaimTailResult> {
    return this.requireSession().queueReclaimTail(params)
  }

  async actionList(): Promise<ActionListResult> {
    return this.requireSession().actionList({})
  }

  async actionExecute(params: ActionExecuteParams): Promise<ActionExecuteResult> {
    return this.requireSession().actionExecute(params)
  }

  async configRead(): Promise<ConfigReadResult> {
    return this.requireSession().configRead({})
  }

  async catalogRead(params: CatalogReadParams): Promise<CatalogReadResult> {
    return this.requireSession().catalogRead(params)
  }

  async resourceRead(params: ResourceReadParams): Promise<ResourceReadResult> {
    return this.requireSession().resourceRead(params)
  }

  async assetRegisterPath(params: AssetRegisterPathParams): Promise<AssetRegisterPathResult> {
    return this.requireSession().assetRegisterPath(params)
  }

  async assetReadChunk(params: AssetReadChunkParams): Promise<AssetReadChunkResult> {
    return this.requireSession().assetReadChunk(params)
  }

  currentSnapshot(): SessionSnapshot | null {
    return this.snapshot
  }

  async close(): Promise<void> {
    const session = this.session
    this.session = null
    this.snapshot = null
    await session?.shutdown()
  }

  private requireSession(): AppServerSession {
    if (!this.session) throw new Error('AppServerSessionManager has no active session')
    return this.session
  }
}
