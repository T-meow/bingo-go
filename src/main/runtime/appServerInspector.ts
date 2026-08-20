import type { Catalog, CatalogKind, ImageInfo, InitializeResult, McpServerState, ModelInfo, ProviderInfo, SkillInfo } from '../../shared/contracts/appServer'
import { AppServerSession, type AppServerSessionHandlers } from './appServerSession'

export type AppServerInspectorMetadata = {
  bingoVersion: string
  protocol: InitializeResult['protocol']
  capabilities: InitializeResult['capabilities']
  limits: InitializeResult['limits']
  epoch: InitializeResult['server']['epoch']
}

export class AppServerInspector {
  private session: AppServerSession | null = null
  private metadata: AppServerInspectorMetadata | null = null

  constructor(
    private readonly binaryPath: string,
    private readonly cwd: string,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async open(): Promise<AppServerInspectorMetadata> {
    const handlers: AppServerSessionHandlers = {
      onNotification: () => undefined,
      onDesync: () => undefined,
      onExit: () => undefined
    }
    const session = new AppServerSession(this.binaryPath, this.cwd, handlers, this.env)
    const initialized = await session.open({
      client: { name: 'bingo-go-inspector', version: '0.1.0' }
    })
    this.session = session
    this.metadata = {
      bingoVersion: initialized.server.version,
      protocol: initialized.protocol,
      capabilities: initialized.capabilities,
      limits: initialized.limits,
      epoch: initialized.server.epoch
    }
    return this.metadata
  }

  async catalog(kind: CatalogKind, provider?: string, cursor?: string, limit?: number): Promise<Catalog> {
    const result = await this.requireSession().request('catalog/read', { catalog: kind, provider, cursor, limit })
    return result.catalog
  }

  async listProviders(): Promise<ProviderInfo[]> {
    const catalog = await this.catalog('providers')
    return catalog.catalog === 'providers' ? catalog.items : []
  }

  async listModels(provider: string): Promise<ModelInfo[]> {
    const catalog = await this.catalog('models', provider)
    return catalog.catalog === 'models' ? catalog.items : []
  }

  async listSkills(): Promise<SkillInfo[]> {
    const catalog = await this.catalog('skills')
    return catalog.catalog === 'skills' ? catalog.items : []
  }

  async listImages(): Promise<ImageInfo[]> {
    const catalog = await this.catalog('images')
    return catalog.catalog === 'images' ? catalog.items : []
  }

  async listMcpServers(): Promise<McpServerState[]> {
    const catalog = await this.catalog('mcpServers')
    return catalog.catalog === 'mcpServers' ? catalog.items : []
  }

  async close(): Promise<void> {
    const session = this.session
    this.session = null
    this.metadata = null
    await session?.shutdown()
  }

  get currentMetadata(): AppServerInspectorMetadata | null {
    return this.metadata
  }

  private requireSession(): AppServerSession {
    if (!this.session) throw new Error('AppServerInspector is not open')
    return this.session
  }
}
