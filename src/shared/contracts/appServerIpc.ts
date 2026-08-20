import { z } from 'zod'
import type {
  ActionExecuteParams,
  ActionExecuteResult,
  ActionListResult,
  AppServerNotification,
  AssetRecord,
  CatalogKind,
  CatalogReadResult,
  ConfigReadResult,
  ConversationMarkReadParams,
  ConversationReadParams,
  ConversationReadResult,
  ConversationSubmitResult,
  InteractionDecision,
  QueueReadParams,
  QueueReadResult,
  QueueReclaimTailParams,
  QueueReclaimTailResult,
  ResourceKind,
  ResourceReadParams,
  ResourceReadResult,
  SessionDeleteParams,
  SessionDeleteResult,
  SessionListResult,
  SessionLocator,
  SessionSnapshot,
  TurnInterruptParams,
  TurnInterruptResult
} from './appServer'

export const APP_SERVER_CHANNEL = 'app-server:channel'
export const APP_SERVER_EVENT = 'app-server:event'

export type AppServerRendererEvent =
  | { kind: 'notification'; notification: AppServerNotification }
  | { kind: 'desync'; expectedSeq: number | null; actual: number }
  | { kind: 'exit'; exitCode: number | null; signal: string | null; error: string | null }
  | { kind: 'snapshot'; snapshot: SessionSnapshot }

export type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; msg: string } }

export type BingoAppApi = {
  probe(workspacePath: string): Promise<Result<{ binaryPath: string; bingoVersion: string; workspacePath: string }>>
  connect(workspacePath: string): Promise<Result<SessionSnapshot>>
  resume(locator: SessionLocator): Promise<Result<SessionSnapshot>>
  disconnect(): Promise<Result<void>>
  listSessions(): Promise<Result<SessionListResult>>
  readConversation(params: ConversationReadParams): Promise<Result<ConversationReadResult>>
  markRead(params: ConversationMarkReadParams): Promise<Result<unknown>>
  composerSubmit(conversationId: string, text: string, mode: 'normal' | 'shell', attachments: string[]): Promise<Result<ConversationSubmitResult>>
  sendProse(conversationId: string, text: string, attachments: string[]): Promise<Result<ConversationSubmitResult>>
  interrupt(params: TurnInterruptParams): Promise<Result<TurnInterruptResult>>
  respond(interactionId: string, decision: InteractionDecision, activation: 'pointer' | 'keyboard' | 'programmatic'): Promise<Result<unknown>>
  readConfig(): Promise<Result<ConfigReadResult>>
  readCatalog(kind: CatalogKind, provider?: string): Promise<Result<CatalogReadResult>>
  listActions(): Promise<Result<ActionListResult>>
  executeAction(params: ActionExecuteParams): Promise<Result<ActionExecuteResult>>
  readResource(kind: ResourceKind, cursor?: string): Promise<Result<ResourceReadResult>>
  registerAsset(path: string, expectedMime?: string): Promise<Result<AssetRecord>>
  readAssetDataUrl(assetId: string, mime: string): Promise<Result<string>>
  queueRead(params: QueueReadParams): Promise<Result<QueueReadResult>>
  queueReclaimTail(params: QueueReclaimTailParams): Promise<Result<QueueReclaimTailResult>>
  sessionDelete(params: SessionDeleteParams): Promise<Result<SessionDeleteResult>>
  restartAfterDefinitionWrite(): Promise<Result<SessionSnapshot>>
  onEvent(listener: (event: AppServerRendererEvent) => void): () => void
}

const locatorSchema = z.union([
  z.object({ type: z.literal('latest') }),
  z.object({ type: z.literal('stem'), stem: z.string().min(1) }),
  z.object({ type: z.literal('path'), path: z.string().min(1) })
])
const decisionSchema = z.union([
  z.object({ type: z.literal('allowOnce') }),
  z.object({ type: z.literal('allowSession'), scopeId: z.string().min(1) }),
  z.object({ type: z.literal('deny'), feedback: z.string().nullable().optional() }),
  z.object({ type: z.literal('answer'), optionId: z.string().nullable(), text: z.string().nullable() }),
  z.object({ type: z.literal('confirm') }),
  z.object({ type: z.literal('cancel') })
])
const catalogKindSchema = z.enum(['models', 'providers', 'skills', 'mcpServers', 'images'])
const resourceKindSchema = z.enum(['agents', 'rooms', 'tasks', 'deliveries', 'backgroundCommands'])

export const appServerProbeInputSchema = z.object({ workspacePath: z.string().min(1) })
export const appServerConnectInputSchema = z.object({ workspacePath: z.string().min(1) })
export const appServerResumeInputSchema = z.object({ locator: locatorSchema })
export const appServerReadConversationInputSchema = z.object({
  conversationId: z.string().min(1),
  cursor: z.object({ after: z.string().min(1), historyGeneration: z.number().int().nonnegative() }).nullable().optional(),
  limit: z.number().int().min(1).max(1000).nullable().optional()
})
export const appServerSubmitInputSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().min(1).max(1_000_000),
  mode: z.enum(['normal', 'shell']).default('normal'),
  attachments: z.array(z.string()).default([]),
  prose: z.boolean().optional()
})
export const appServerInterruptInputSchema = z.object({ conversationId: z.string().min(1), turnId: z.string().min(1) })
export const appServerRespondInputSchema = z.object({
  interactionId: z.string().min(1),
  decision: decisionSchema,
  activation: z.enum(['pointer', 'keyboard', 'programmatic'])
})
export const appServerCatalogInputSchema = z.object({ kind: catalogKindSchema, provider: z.string().optional() })
export const appServerResourceInputSchema = z.object({ kind: resourceKindSchema, cursor: z.string().optional() })
export const appServerRegisterAssetInputSchema = z.object({ path: z.string().min(1), expectedMime: z.string().optional() })
export const appServerReadAssetInputSchema = z.object({ assetId: z.string().min(1), mime: z.string().min(1) })
export const appServerActionExecuteInputSchema = z.object({
  originConversationId: z.string().min(1),
  precondition: z.unknown().nullable().optional(),
  action: z.unknown()
})
