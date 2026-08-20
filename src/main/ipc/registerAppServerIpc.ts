import { BrowserWindow, ipcMain } from 'electron'
import type {
  ActionExecuteParams,
  AppServerNotification,
  AssetRecord,
  CatalogKind,
  ConversationMarkReadParams,
  ConversationReadParams,
  InteractionDecision,
  QueueReadParams,
  QueueReclaimTailParams,
  ResourceKind,
  ResourceReadParams,
  SessionDeleteParams,
  SessionLocator,
  SessionSnapshot,
  TurnInterruptParams
} from '../../shared/contracts/appServer'
import {
  appServerActionExecuteInputSchema,
  appServerCatalogInputSchema,
  appServerConnectInputSchema,
  appServerInterruptInputSchema,
  appServerProbeInputSchema,
  appServerReadAssetInputSchema,
  appServerReadConversationInputSchema,
  appServerRegisterAssetInputSchema,
  appServerResourceInputSchema,
  appServerResumeInputSchema,
  appServerRespondInputSchema,
  appServerSubmitInputSchema,
  APP_SERVER_EVENT,
  type AppServerRendererEvent,
  type Result
} from '../../shared/contracts/appServerIpc'
import { AppServerActionService } from '../runtime/appServerActionService'
import { AppServerAssetService } from '../runtime/appServerAssetService'
import { AppServerSessionManager } from '../runtime/appServerSessionManager'
import { RuntimeLocator } from '../runtime/runtimeLocator'

export function registerAppServerIpc(window: BrowserWindow, locator: RuntimeLocator, binaryPath: string): void {
  let manager: AppServerSessionManager | null = null
  let actions: AppServerActionService | null = null
  let assets: AppServerAssetService | null = null

  const emit = (event: AppServerRendererEvent): void => {
    if (!window.isDestroyed()) window.webContents.send(APP_SERVER_EVENT, event)
  }

  const handlers = {
    onSnapshot: (snapshot: SessionSnapshot) => emit({ kind: 'snapshot', snapshot }),
    onNotification: (notification: AppServerNotification) => emit({ kind: 'notification', notification }),
    onDesync: (info: { expectedSeq: number | null; actual: number }) => emit({ kind: 'desync', ...info }),
    onExit: (exit: { exitCode: number | null; signal: string | null }, _stderr: string, error: Error | null) => emit({ kind: 'exit', ...exit, error: error?.message ?? null })
  }

  const currentManager = (): AppServerSessionManager => {
    if (!manager) throw new Error('No active app-server session')
    return manager
  }

  ipcMain.handle('app-server:probe', async (_event, raw): Promise<Result<{ binaryPath: string; bingoVersion: string; workspacePath: string }>> => {
    try {
      const input = appServerProbeInputSchema.parse(raw)
      const probed = await locator.probe(input.workspacePath)
      if (!probed.ok) return { ok: false, error: { code: probed.error.code, msg: probed.error.msg } }
      return { ok: true, value: { binaryPath: probed.value.binaryPath, bingoVersion: probed.value.bingoVersion, workspacePath: probed.value.workspacePath } }
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('app-server:connect', async (_event, raw): Promise<Result<SessionSnapshot>> => {
    try {
      const input = appServerConnectInputSchema.parse(raw)
      await manager?.close()
      manager = new AppServerSessionManager(binaryPath, process.cwd(), handlers)
      actions = new AppServerActionService(manager)
      assets = new AppServerAssetService(manager)
      const snapshot = await manager.start(input.workspacePath)
      return { ok: true, value: snapshot }
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('app-server:resume', async (_event, raw): Promise<Result<SessionSnapshot>> => {
    try {
      const input = appServerResumeInputSchema.parse(raw)
      await manager?.close()
      manager = new AppServerSessionManager(binaryPath, process.cwd(), handlers)
      actions = new AppServerActionService(manager)
      assets = new AppServerAssetService(manager)
      const snapshot = await manager.resume(input.locator as SessionLocator)
      return { ok: true, value: snapshot }
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('app-server:disconnect', async (): Promise<Result<void>> => {
    try {
      await manager?.close()
      manager = null
      actions = null
      assets = null
      return { ok: true, value: undefined }
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('app-server:list-sessions', async (): Promise<Result<unknown>> => {
    try { return { ok: true, value: await currentManager().sessionList() } } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:read-conversation', async (_event, raw): Promise<Result<unknown>> => {
    try { return { ok: true, value: await currentManager().conversationRead(appServerReadConversationInputSchema.parse(raw) as ConversationReadParams) } } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:mark-read', async (_event, raw): Promise<Result<unknown>> => {
    try { return { ok: true, value: await currentManager().conversationMarkRead(raw as ConversationMarkReadParams) } } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:submit', async (_event, raw): Promise<Result<unknown>> => {
    try {
      const input = appServerSubmitInputSchema.parse(raw)
      const result = input.prose
        ? await currentManager().sendProse(input.conversationId, input.text, input.attachments)
        : await currentManager().composerSubmit(input.conversationId, input.text, input.mode, input.attachments)
      return { ok: true, value: result }
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:interrupt', async (_event, raw): Promise<Result<unknown>> => {
    try { return { ok: true, value: await currentManager().actionExecute ? currentManager() : null } } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:respond', async (_event, raw): Promise<Result<unknown>> => {
    try {
      const input = appServerRespondInputSchema.parse(raw)
      return { ok: true, value: await currentManager().interactionRespond({ interactionId: input.interactionId, activation: input.activation, decision: input.decision as InteractionDecision }) }
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:read-config', async (): Promise<Result<unknown>> => {
    try { return { ok: true, value: await currentManager().configRead() } } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:read-catalog', async (_event, raw): Promise<Result<unknown>> => {
    try {
      const input = appServerCatalogInputSchema.parse(raw)
      return { ok: true, value: await currentManager().catalogRead({ catalog: input.kind as CatalogKind, provider: input.provider ?? null, cursor: null, limit: null }) }
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:list-actions', async (): Promise<Result<unknown>> => {
    try { return { ok: true, value: await currentManager().actionList() } } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:execute-action', async (_event, raw): Promise<Result<unknown>> => {
    try {
      const input = appServerActionExecuteInputSchema.parse(raw)
      return { ok: true, value: await currentManager().actionExecute(input as unknown as ActionExecuteParams) }
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:read-resource', async (_event, raw): Promise<Result<unknown>> => {
    try {
      const input = appServerResourceInputSchema.parse(raw)
      return { ok: true, value: await currentManager().resourceRead({ resource: input.kind as ResourceKind, cursor: input.cursor ?? null, limit: null } as ResourceReadParams) }
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:register-asset', async (_event, raw): Promise<Result<AssetRecord>> => {
    try {
      const input = appServerRegisterAssetInputSchema.parse(raw)
      if (!assets) throw new Error('No active app-server session')
      return { ok: true, value: await assets.registerPath(input.path, input.expectedMime) }
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:read-asset-data-url', async (_event, raw): Promise<Result<string>> => {
    try {
      const input = appServerReadAssetInputSchema.parse(raw)
      if (!assets) throw new Error('No active app-server session')
      return { ok: true, value: await assets.readDataUrl(input.assetId, input.mime) }
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:queue-read', async (_event, raw): Promise<Result<unknown>> => {
    try { return { ok: true, value: await currentManager().queueRead(raw as QueueReadParams) } } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:queue-reclaim', async (_event, raw): Promise<Result<unknown>> => {
    try { return { ok: true, value: await currentManager().queueReclaimTail(raw as QueueReclaimTailParams) } } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:session-delete', async (_event, raw): Promise<Result<unknown>> => {
    try { return { ok: true, value: await currentManager().sessionDelete(raw as SessionDeleteParams) } } catch (error) { return fail(error) }
  })
  ipcMain.handle('app-server:restart-after-definition-write', async (): Promise<Result<SessionSnapshot>> => {
    try { return { ok: true, value: await currentManager().restartCurrent() } } catch (error) { return fail(error) }
  })
}

function fail(error: unknown): { ok: false; error: { code: string; msg: string } } {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: { code: 'BINGO_APP_ERROR', msg: message } }
}
