import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  AppServerNotification,
  AssetRecord,
  CatalogKind,
  InteractionDecision,
  ResourceKind,
  SessionSnapshot
} from '../../shared/contracts/appServer'
import {
  APP_SERVER_CHANNELS,
  APP_SERVER_EVENT,
  appServerActionExecuteInputSchema,
  appServerCatalogInputSchema,
  appServerConnectInputSchema,
  appServerInterruptInputSchema,
  appServerMarkReadInputSchema,
  appServerProbeInputSchema,
  appServerQueueReadInputSchema,
  appServerQueueReclaimInputSchema,
  appServerReadAssetInputSchema,
  appServerReadConversationInputSchema,
  appServerRegisterAssetInputSchema,
  appServerResourceInputSchema,
  appServerRespondInputSchema,
  appServerResumeInputSchema,
  appServerSessionDeleteInputSchema,
  appServerSubmitInputSchema,
  type AppServerRendererEvent,
  type Result
} from '../../shared/contracts/appServerIpc'
import { AppServerAssetService } from '../runtime/appServerAssetService'
import { AppServerSessionManager } from '../runtime/appServerSessionManager'
import { RuntimeLocator } from '../runtime/runtimeLocator'

export type AppServerIpcController = {
  close(): Promise<void>
  dispose(): Promise<void>
  currentSnapshot(): SessionSnapshot | null
}

export type AppServerIpcOptions = {
  workspacePath: () => string
  onSnapshot?: (snapshot: SessionSnapshot) => void
  onNotification?: (snapshot: SessionSnapshot | null, notification: AppServerNotification) => void
  onExit?: (snapshot: SessionSnapshot | null, error: Error | null) => void
}

export function registerAppServerIpc(
  window: BrowserWindow,
  locator: RuntimeLocator,
  binaryPath: string,
  options: AppServerIpcOptions = { workspacePath: () => process.cwd() }
): AppServerIpcController {
  let manager: AppServerSessionManager | null = null
  let assets: AppServerAssetService | null = null
  const registeredChannels: string[] = []

  const trusted = (event: IpcMainInvokeEvent): void => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Untrusted IPC sender')
    }
  }
  const emit = (event: AppServerRendererEvent): void => {
    if (!window.isDestroyed()) window.webContents.send(APP_SERVER_EVENT, event)
  }
  const handlers = {
    onSnapshot: (snapshot: SessionSnapshot): void => {
      options.onSnapshot?.(snapshot)
      emit({ kind: 'snapshot', snapshot })
    },
    onNotification: (notification: AppServerNotification): void => {
      options.onNotification?.(manager?.currentSnapshot() ?? null, notification)
      emit({ kind: 'notification', notification })
    },
    onDesync: (info: { expectedSeq: number | null; actual: number }): void => emit({ kind: 'desync', ...info }),
    onExit: (exit: { exitCode: number | null; signal: string | null }, _stderr: string, error: Error | null): void => {
      options.onExit?.(manager?.currentSnapshot() ?? null, error)
      emit({ kind: 'exit', ...exit, error: error?.message ?? null })
    }
  }

  const currentManager = (): AppServerSessionManager => {
    if (!manager) throw new Error('No active app-server session')
    return manager
  }
  const currentAssets = (): AppServerAssetService => {
    if (!assets) throw new Error('No active app-server session')
    return assets
  }
  const setManager = (next: AppServerSessionManager): void => {
    manager = next
    assets = new AppServerAssetService(next)
  }
  const register = <TInput, TOutput>(
    channel: string,
    schema: { parse(value: unknown): TInput },
    operation: (input: TInput) => Promise<TOutput>
  ): void => {
    ipcMain.handle(channel, async (event, raw): Promise<Result<TOutput>> => {
      try {
        trusted(event)
        return { ok: true, value: await operation(schema.parse(raw)) }
      } catch (error) {
        return fail(error)
      }
    })
    registeredChannels.push(channel)
  }
  const registerWithoutInput = <TOutput>(channel: string, operation: () => Promise<TOutput>): void => {
    ipcMain.handle(channel, async (event): Promise<Result<TOutput>> => {
      try {
        trusted(event)
        return { ok: true, value: await operation() }
      } catch (error) {
        return fail(error)
      }
    })
    registeredChannels.push(channel)
  }

  register(APP_SERVER_CHANNELS.probe, appServerProbeInputSchema, async ({ workspacePath }) => {
    const probed = await locator.probe(workspacePath)
    if (!probed.ok) throw new AppServerIpcError(probed.error.code, probed.error.msg)
    return {
      binaryPath: probed.value.binaryPath,
      bingoVersion: probed.value.bingoVersion,
      workspacePath: probed.value.workspacePath
    }
  })

  register(APP_SERVER_CHANNELS.connect, appServerConnectInputSchema, async ({ workspacePath }) => {
    const probed = await locator.probe(workspacePath)
    if (!probed.ok) throw new AppServerIpcError(probed.error.code, probed.error.msg)
    await manager?.close()
    const next = new AppServerSessionManager(probed.value.binaryPath || binaryPath, probed.value.workspacePath, handlers)
    setManager(next)
    return next.start(probed.value.workspacePath)
  })

  register(APP_SERVER_CHANNELS.resume, appServerResumeInputSchema, async ({ locator: sessionLocator }) => {
    await manager?.close()
    const workspacePath = options.workspacePath()
    const probed = await locator.probe(workspacePath)
    if (!probed.ok) throw new AppServerIpcError(probed.error.code, probed.error.msg)
    const next = new AppServerSessionManager(probed.value.binaryPath || binaryPath, probed.value.workspacePath, handlers)
    setManager(next)
    return next.resume(sessionLocator)
  })

  registerWithoutInput(APP_SERVER_CHANNELS.disconnect, async () => {
    const active = manager
    manager = null
    assets = null
    await active?.close()
  })
  registerWithoutInput(APP_SERVER_CHANNELS.listSessions, () => currentManager().sessionList())
  register(APP_SERVER_CHANNELS.readConversation, appServerReadConversationInputSchema, (input) => currentManager().conversationRead(input))
  register(APP_SERVER_CHANNELS.markRead, appServerMarkReadInputSchema, (input) => currentManager().conversationMarkRead(input))
  register(APP_SERVER_CHANNELS.submit, appServerSubmitInputSchema, (input) => input.prose
    ? currentManager().sendProse(input.conversationId, input.text, input.attachments)
    : currentManager().composerSubmit(input.conversationId, input.text, input.mode, input.attachments))
  register(APP_SERVER_CHANNELS.interrupt, appServerInterruptInputSchema, (input) => currentManager().turnInterrupt(input))
  register(APP_SERVER_CHANNELS.respond, appServerRespondInputSchema, (input) => currentManager().interactionRespond({
    interactionId: input.interactionId,
    activation: input.activation,
    decision: input.decision as InteractionDecision
  }))
  registerWithoutInput(APP_SERVER_CHANNELS.readConfig, () => currentManager().configRead())
  register(APP_SERVER_CHANNELS.readCatalog, appServerCatalogInputSchema, (input) => currentManager().catalogRead({
    catalog: input.kind as CatalogKind,
    provider: input.provider ?? null,
    cursor: null,
    limit: null
  }))
  registerWithoutInput(APP_SERVER_CHANNELS.listActions, () => currentManager().actionList())
  register(APP_SERVER_CHANNELS.executeAction, appServerActionExecuteInputSchema, (input) => currentManager().actionExecute(input))
  register(APP_SERVER_CHANNELS.readResource, appServerResourceInputSchema, (input) => currentManager().resourceRead({
    resource: input.kind as ResourceKind,
    cursor: input.cursor ?? null,
    limit: null
  }))
  register(APP_SERVER_CHANNELS.registerAsset, appServerRegisterAssetInputSchema, (input): Promise<AssetRecord> => currentAssets().registerPath(input.path, input.expectedMime))
  register(APP_SERVER_CHANNELS.readAssetDataUrl, appServerReadAssetInputSchema, (input) => currentAssets().readDataUrl(input.assetId, input.mime))
  register(APP_SERVER_CHANNELS.queueRead, appServerQueueReadInputSchema, (input) => currentManager().queueRead(input))
  register(APP_SERVER_CHANNELS.queueReclaimTail, appServerQueueReclaimInputSchema, (input) => currentManager().queueReclaimTail(input))
  register(APP_SERVER_CHANNELS.sessionDelete, appServerSessionDeleteInputSchema, (input) => currentManager().sessionDelete(input))
  registerWithoutInput(APP_SERVER_CHANNELS.restartAfterDefinitionWrite, () => currentManager().restartCurrent())

  const close = async (): Promise<void> => {
    const active = manager
    manager = null
    assets = null
    await active?.close()
  }
  return {
    close,
    currentSnapshot: () => manager?.currentSnapshot() ?? null,
    dispose: async () => {
      for (const channel of registeredChannels) ipcMain.removeHandler(channel)
      await close()
    }
  }
}

class AppServerIpcError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

function fail(error: unknown): { ok: false; error: { code: string; msg: string } } {
  const message = error instanceof Error ? error.message : String(error)
  const code = error instanceof AppServerIpcError ? error.code : 'BINGO_APP_ERROR'
  return { ok: false, error: { code, msg: message } }
}
