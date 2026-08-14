import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import type { RuntimeLocator } from '../runtime/runtimeLocator'
import type { SessionManager } from '../runtime/sessionManager'
import type { TranscriptRepository } from '../storage/transcriptRepository'
import type { SettingsRepository } from '../storage/settingsRepository'
import type { WorkspaceRepository } from '../storage/workspaceRepository'
import type { NotificationPreferencesRepository } from '../storage/notificationPreferencesRepository'
import type { NotificationCoordinator } from '../notifications/notificationCoordinator'
import type { UserProfileRepository } from '../storage/userProfileRepository'
import { IPC, type ModelListOutput, type NotificationPreferencesSnapshot, type Result, type RuntimeSettings, type SessionListOutput, type SessionOpened } from '../../shared/contracts/ipc'
import { BingoCommandError } from '../runtime/bingoSession'
import { createHash } from 'node:crypto'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, input?: unknown) => unknown>(),
  openExternalTerminal: vi.fn(),
  writeClipboardText: vi.fn(),
  createNativeImage: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.0', isPackaged: true },
  clipboard: { writeText: electron.writeClipboardText },
  nativeImage: { createFromBuffer: electron.createNativeImage },
  ipcMain: { handle: (channel: string, handler: (event: IpcMainInvokeEvent, input?: unknown) => unknown) => electron.handlers.set(channel, handler) }
}))

vi.mock('../runtime/externalTerminal', () => ({
  ExternalTerminalError: class ExternalTerminalError extends Error {},
  openExternalTerminal: electron.openExternalTerminal
}))

import { registerIpc } from './registerIpc'

describe('registerIpc session:list', () => {
  it('rejects unsupported profile avatar image data before saving', async () => {
    const repository = { read: vi.fn(), save: vi.fn() }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc(
      { webContents } as unknown as BrowserWindow,
      {} as RuntimeLocator,
      {} as SessionManager,
      {} as TranscriptRepository,
      {} as SettingsRepository,
      '/bingo',
      undefined, undefined, undefined, undefined, undefined, undefined,
      repository as unknown as UserProfileRepository
    )

    const handler = electron.handlers.get(IPC.profileSave)
    const result = await handler?.(
      { sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent,
      { baseRevision: 'a'.repeat(64), avatar: { kind: 'upload', fileName: 'avatar.png', data: Buffer.from('not an image').toString('base64') } }
    ) as Result<unknown>

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFIG_INVALID' } })
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('normalizes a supported profile avatar and stores its content-addressed id', async () => {
    const normalized = Buffer.from('normalized-png')
    const resize = vi.fn().mockReturnValue({ toPNG: () => normalized })
    const crop = vi.fn().mockReturnValue({ resize })
    electron.createNativeImage.mockReturnValue({ isEmpty: () => false, getSize: () => ({ width: 800, height: 600 }), crop })
    const saved = { path: '/profile.json', revision: 'b'.repeat(64), values: { schemaVersion: 1 as const, avatar: `user:${createHash('sha256').update(normalized).digest('hex')}` } }
    const repository = { read: vi.fn(), save: vi.fn().mockResolvedValue(saved) }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc(
      { webContents } as unknown as BrowserWindow,
      {} as RuntimeLocator,
      {} as SessionManager,
      {} as TranscriptRepository,
      {} as SettingsRepository,
      '/bingo',
      undefined, undefined, undefined, undefined, undefined, undefined,
      repository as unknown as UserProfileRepository
    )
    const source = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const avatar = saved.values.avatar

    const handler = electron.handlers.get(IPC.profileSave)
    const result = await handler?.(
      { sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent,
      { baseRevision: 'a'.repeat(64), avatar: { kind: 'upload', fileName: 'avatar.png', data: source.toString('base64') } }
    )

    expect(crop).toHaveBeenCalledWith({ x: 100, y: 0, width: 600, height: 600 })
    expect(resize).toHaveBeenCalledWith({ width: 512, height: 512, quality: 'best' })
    expect(repository.save).toHaveBeenCalledWith('a'.repeat(64), avatar, normalized)
    expect(result).toEqual({ ok: true, value: saved })
  })

  it('writes validated text through the main-process clipboard', async () => {
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, {} as RuntimeLocator, {} as SessionManager, {} as TranscriptRepository, {} as SettingsRepository, '/bingo')

    const handler = electron.handlers.get(IPC.clipboardWriteText)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, { text: '只复制可见文字' })

    expect(electron.writeClipboardText).toHaveBeenCalledWith('只复制可见文字')
    expect(result).toEqual({ ok: true, value: { written: true } })
  })

  it('reads and saves notification preferences while updating the live coordinator', async () => {
    const values = { schemaVersion: 1 as const, enabled: true, turnCompleted: true, actionRequired: true, failures: true, sound: false }
    const stored = { path: '/user/notifications.json', revision: 'd'.repeat(64), values }
    const next = { ...stored, revision: 'e'.repeat(64), values: { ...values, turnCompleted: false } }
    const repository = { read: vi.fn().mockResolvedValue(stored), save: vi.fn().mockResolvedValue(next) }
    const notifications = { updatePreferences: vi.fn(), disable: vi.fn(), isSupported: vi.fn().mockReturnValue(true) }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc(
      { webContents } as unknown as BrowserWindow,
      {} as RuntimeLocator,
      {} as SessionManager,
      {} as TranscriptRepository,
      {} as SettingsRepository,
      '/bingo',
      undefined,
      undefined,
      repository as unknown as NotificationPreferencesRepository,
      notifications as unknown as NotificationCoordinator
    )

    const readHandler = electron.handlers.get(IPC.notificationPreferencesRead)
    const read = await readHandler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent) as Result<NotificationPreferencesSnapshot>
    expect(read).toEqual({ ok: true, value: { ...stored, supported: true } })
    expect(notifications.updatePreferences).toHaveBeenCalledWith(values)

    const saveHandler = electron.handlers.get(IPC.notificationPreferencesSave)
    const save = await saveHandler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, { baseRevision: stored.revision, values: next.values }) as Result<NotificationPreferencesSnapshot>
    expect(repository.save).toHaveBeenCalledWith(stored.revision, next.values)
    expect(save).toEqual({ ok: true, value: { ...next, supported: true } })
    expect(notifications.updatePreferences).toHaveBeenLastCalledWith(next.values)
  })

  it('disables live notifications when the preference file cannot be read', async () => {
    const repository = { read: vi.fn().mockRejectedValue(new Error('Cannot read notifications.json')) }
    const notifications = { updatePreferences: vi.fn(), disable: vi.fn(), isSupported: vi.fn().mockReturnValue(true) }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc(
      { webContents } as unknown as BrowserWindow,
      {} as RuntimeLocator,
      {} as SessionManager,
      {} as TranscriptRepository,
      {} as SettingsRepository,
      '/bingo',
      undefined,
      undefined,
      repository as unknown as NotificationPreferencesRepository,
      notifications as unknown as NotificationCoordinator
    )

    const handler = electron.handlers.get(IPC.notificationPreferencesRead)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent) as Result<unknown>

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFIG_INVALID' } })
    expect(notifications.disable).toHaveBeenCalledOnce()
  })

  it('opens an external terminal using only the main-owned workspace', async () => {
    electron.openExternalTerminal.mockResolvedValue({ terminalName: 'Windows Terminal', workspacePath: 'D:\\Projects\\trusted' })
    const workspace = { current: vi.fn().mockReturnValue('D:\\Projects\\trusted') }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc(
      { webContents } as unknown as BrowserWindow,
      {} as RuntimeLocator,
      {} as SessionManager,
      {} as TranscriptRepository,
      {} as SettingsRepository,
      '/bingo',
      undefined,
      workspace as unknown as WorkspaceRepository
    )

    const handler = electron.handlers.get(IPC.terminalOpenExternal)
    const result = await handler?.(
      { sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent,
      { path: 'D:\\Projects\\untrusted' }
    )

    expect(workspace.current).toHaveBeenCalledOnce()
    expect(electron.openExternalTerminal).toHaveBeenCalledWith('D:\\Projects\\trusted')
    expect(result).toEqual({ ok: true, value: { terminalName: 'Windows Terminal', workspacePath: 'D:\\Projects\\trusted' } })
  })

  it('returns TranscriptRepository.list through the read-only IPC channel', async () => {
    const output: SessionListOutput = {
      sessions: [{ id: 'session-1', name: 'Session 1', preview: 'Latest reply', updatedAt: '2026-08-10T00:00:00.000Z', messageCount: 2, workspacePath: '/workspace' }],
      warnings: []
    }
    const transcripts = { list: vi.fn().mockResolvedValue(output) }
    const mainFrame = {}
    const webContents = { mainFrame }

    registerIpc(
      { webContents } as unknown as BrowserWindow,
      {} as RuntimeLocator,
      {} as SessionManager,
      transcripts as unknown as TranscriptRepository,
      {} as SettingsRepository,
      '/bingo'
    )

    const handler = electron.handlers.get(IPC.sessionList)
    expect(handler).toBeDefined()
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent) as Result<SessionListOutput>
    expect(result).toEqual({ ok: true, value: output })
    expect(transcripts.list).toHaveBeenCalledOnce()
  })

  it('loads history before opening the exact requested session', async () => {
    const history = [{ type: 'message' as const, value: { id: 'session-1:1', role: 'user' as const, markdown: 'Remember amber' } }]
    const transcripts = { list: vi.fn(), load: vi.fn().mockResolvedValue({ history, workspacePath: '/tmp', warnings: [] }) }
    const sessions = {
      open: vi.fn().mockResolvedValue({
        connectionId: crypto.randomUUID(),
        metadata: { bingoVersion: '1', protocolVersion: 1, sessionId: 'session-1', displayName: 'Remember amber', transcriptPath: '/private/session-1.jsonl', resumed: true, cwd: '/tmp', provider: 'default', model: 'm', thinkingLevel: 'off', permissionMode: 'default', theme: 'auto', supportsImages: false },
        displayName: 'Remember amber',
        autoTitleEligible: false,
        contextUsage: null
      })
    }
    const locator = { probe: vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: '/bingo', bingoVersion: '1', protocolVersion: 1, workspacePath: '/tmp', capabilities: [] } }) }
    const workspace = { current: vi.fn().mockReturnValue('/tmp'), save: vi.fn().mockResolvedValue(undefined), snapshot: vi.fn().mockReturnValue({ schemaVersion: 2, currentPath: '/tmp', recentPaths: ['/tmp'] }) }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, locator as unknown as RuntimeLocator, sessions as unknown as SessionManager, transcripts as unknown as TranscriptRepository, {} as SettingsRepository, '/bingo', undefined, workspace as unknown as WorkspaceRepository)

    const handler = electron.handlers.get(IPC.sessionOpen)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, { sessionId: 'session-1' }) as Result<SessionOpened>

    expect(transcripts.load).toHaveBeenCalledWith('session-1')
    expect(sessions.open).toHaveBeenCalledWith('session-1', { displayName: 'Remember amber', autoTitleEligible: false }, { workspacePath: '/tmp', bindSessionWorkspace: false })
    expect(result).toMatchObject({ ok: true, value: { history, autoTitleEligible: false } })
    if (result.ok) expect(result.value.metadata).not.toHaveProperty('transcriptPath')
  })

  it('persists fork workspace state before replacing the active source connection', async () => {
    const childMetadata = {
      bingoVersion: '1', protocolVersion: 1 as const, sessionId: 'child-session', displayName: 'Branch', transcriptPath: '/private/child-session.jsonl',
      resumed: true, cwd: '/tmp', provider: 'default', model: 'm', thinkingLevel: 'off' as const, permissionMode: 'default', theme: 'auto' as const,
      supportsImages: false, capabilities: ['session.fork.v1'], parentSessionId: 'source-session', forkReason: 'edit-last-prompt' as const
    }
    const transcripts = {
      load: vi.fn().mockImplementation(async (sessionId: string) => ({
        history: sessionId === 'child-session' ? [{ type: 'message' as const, value: { id: 'child-session:2', role: 'user' as const, markdown: 'earlier prompt' } }] : [],
        workspacePath: '/tmp',
        warnings: []
      }))
    }
    const sessions = {
      fork: vi.fn().mockResolvedValue({ metadata: childMetadata, warnings: [] }),
      openPreservingActive: vi.fn()
    }
    const locator = { probe: vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: '/bingo', bingoVersion: '1', protocolVersion: 1, workspacePath: '/tmp', capabilities: ['session.fork.v1'] } }) }
    const workspace = {
      current: vi.fn().mockReturnValue('/tmp'),
      save: vi.fn().mockRejectedValue(new Error('preferences are read-only')),
      snapshot: vi.fn()
    }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, locator as unknown as RuntimeLocator, sessions as unknown as SessionManager, transcripts as unknown as TranscriptRepository, {} as SettingsRepository, '/bingo', undefined, workspace as unknown as WorkspaceRepository)

    const handler = electron.handlers.get(IPC.sessionFork)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, {
      sourceSessionId: 'source-session',
      reason: 'edit-last-prompt',
      sourceTurnId: '123e4567-e89b-42d3-a456-426614174000',
      sourceRevision: 'a'.repeat(64)
    }) as Result<SessionOpened>

    expect(result).toMatchObject({ ok: false, error: { msg: 'preferences are read-only' } })
    expect(workspace.save).toHaveBeenCalledWith('/tmp')
    expect(sessions.openPreservingActive).not.toHaveBeenCalled()
  })

  it('retries transient Windows locks while handing a fork child to the GUI', async () => {
    const childMetadata = {
      bingoVersion: '1', protocolVersion: 1 as const, sessionId: 'child-session', displayName: 'Branch', transcriptPath: '/private/child-session.jsonl',
      resumed: true, cwd: '/tmp', provider: 'default', model: 'm', thinkingLevel: 'off' as const, permissionMode: 'default', theme: 'auto' as const,
      supportsImages: false, capabilities: ['session.fork.v1'], parentSessionId: 'source-session', forkReason: 'edit-last-prompt' as const
    }
    const childHistory = [{ type: 'message' as const, value: { id: 'child-session:2', role: 'user' as const, markdown: 'earlier prompt' } }]
    let childLoads = 0
    const transcripts = {
      load: vi.fn().mockImplementation(async (sessionId: string) => {
        if (sessionId === 'source-session') return { history: [], workspacePath: '/tmp', warnings: [] }
        childLoads += 1
        if (childLoads === 1) throw Object.assign(new Error('EBUSY: resource busy or locked, read'), { code: 'EBUSY' })
        return { history: childHistory, workspacePath: '/tmp', warnings: [] }
      })
    }
    const opened = {
      connectionId: crypto.randomUUID(), metadata: childMetadata, displayName: 'Branch', autoTitleEligible: false, contextUsage: null
    }
    const sessions = {
      fork: vi.fn().mockResolvedValue({ metadata: childMetadata, warnings: [] }),
      openPreservingActive: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error('EPERM: operation not permitted, open'), { code: 'EPERM' }))
        .mockResolvedValueOnce(opened)
    }
    const locator = { probe: vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: '/bingo', bingoVersion: '1', protocolVersion: 1, workspacePath: '/tmp', capabilities: ['session.fork.v1'] } }) }
    const workspace = {
      current: vi.fn().mockReturnValue('/tmp'),
      save: vi.fn().mockResolvedValue(undefined),
      snapshot: vi.fn().mockReturnValue({ schemaVersion: 2, currentPath: '/tmp', recentPaths: ['/tmp'] })
    }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, locator as unknown as RuntimeLocator, sessions as unknown as SessionManager, transcripts as unknown as TranscriptRepository, {} as SettingsRepository, '/bingo', undefined, workspace as unknown as WorkspaceRepository)

    const handler = electron.handlers.get(IPC.sessionFork)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, {
      sourceSessionId: 'source-session',
      reason: 'edit-last-prompt',
      sourceTurnId: '123e4567-e89b-42d3-a456-426614174000',
      sourceRevision: 'a'.repeat(64)
    }) as Result<SessionOpened>

    expect(result).toMatchObject({ ok: true, value: { history: childHistory, metadata: { sessionId: 'child-session' } } })
    expect(childLoads).toBe(2)
    expect(sessions.openPreservingActive).toHaveBeenCalledTimes(2)
  })

  it('returns the active session theme through runtime settings', async () => {
    const providers: RuntimeSettings['providers'] = [{ name: 'default', protocol: 'anthropic', apiBaseUrl: 'https://example.test', supportsImages: true, credentialConfigured: true, builtin: false }]
    const sessions = {
      snapshot: vi.fn().mockReturnValue({ connectionId: crypto.randomUUID(), sessionId: 'session-1', displayName: 'Session 1', autoTitleEligible: false, idle: true, workspacePath: '/tmp' }),
      listProviders: vi.fn().mockResolvedValue(providers),
      currentMetadata: vi.fn().mockReturnValue({ provider: 'default', model: 'model', thinkingLevel: 'high', permissionMode: 'acceptEdits', theme: 'dark' })
    }
    const settings = {
      read: vi.fn().mockResolvedValue({
        effective: { provider: 'configured', model: 'configured-model', thinkingLevel: 'off', permissionMode: 'default', theme: 'auto' },
        values: { provider: 'configured', model: 'configured-model', thinkingLevel: 'off', permissionMode: 'default', theme: 'auto' }
      })
    }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, {} as RuntimeLocator, sessions as unknown as SessionManager, {} as TranscriptRepository, settings as unknown as SettingsRepository, '/bingo')

    const handler = electron.handlers.get(IPC.settingsReadRuntime)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, { workspacePath: '/tmp' }) as Result<RuntimeSettings>

    expect(result).toEqual({ ok: true, value: { providers, provider: 'default', model: 'model', thinkingLevel: 'high', permissionMode: 'acceptEdits', theme: 'dark' } })
    expect(settings.read).toHaveBeenCalledWith('/tmp')
  })

  it('binds an unclassified session to the explicitly selected project', async () => {
    const history = [{ type: 'message' as const, value: { id: 'legacy:1', role: 'user' as const, markdown: 'legacy prompt' } }]
    const transcripts = { list: vi.fn(), load: vi.fn().mockResolvedValue({ history, workspacePath: null, warnings: [] }) }
    const sessions = { open: vi.fn().mockResolvedValue({
      connectionId: crypto.randomUUID(),
      metadata: { bingoVersion: '1', protocolVersion: 1, sessionId: 'legacy', displayName: 'legacy prompt', transcriptPath: '/private/legacy.jsonl', resumed: true, cwd: '/chosen', provider: 'default', model: 'm', thinkingLevel: 'off', permissionMode: 'default', theme: 'auto', supportsImages: false, capabilities: ['session.workspace.v1'] },
      displayName: 'legacy prompt', autoTitleEligible: false, contextUsage: null
    }) }
    const runtime = { binaryPath: '/bingo', bingoVersion: '1', protocolVersion: 1 as const, workspacePath: '/chosen', capabilities: ['session.workspace.v1'] }
    const locator = { probe: vi.fn().mockResolvedValue({ ok: true, value: runtime }) }
    const workspace = { current: vi.fn().mockReturnValue('/current'), save: vi.fn().mockResolvedValue(undefined), snapshot: vi.fn().mockReturnValue({ schemaVersion: 2, currentPath: '/chosen', recentPaths: ['/chosen', '/current'] }) }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, locator as unknown as RuntimeLocator, sessions as unknown as SessionManager, transcripts as unknown as TranscriptRepository, {} as SettingsRepository, '/bingo', undefined, workspace as unknown as WorkspaceRepository)

    const handler = electron.handlers.get(IPC.sessionOpen)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, {
      sessionId: 'legacy', workspacePath: '/chosen', bindWorkspace: true
    }) as Result<SessionOpened>

    expect(locator.probe).toHaveBeenCalledWith('/chosen')
    expect(sessions.open).toHaveBeenCalledWith('legacy', { displayName: 'legacy prompt', autoTitleEligible: false }, { workspacePath: '/chosen', bindSessionWorkspace: true })
    expect(workspace.save).toHaveBeenCalledWith('/chosen')
    expect(result).toMatchObject({ ok: true, value: { runtime, workspacePreferences: { currentPath: '/chosen' } } })
  })

  it('reports an unavailable stored project before launching the session', async () => {
    const transcripts = { load: vi.fn().mockResolvedValue({ history: [], workspacePath: '/missing', warnings: [] }) }
    const sessions = { open: vi.fn() }
    const locator = { probe: vi.fn().mockResolvedValue({ ok: false, error: { code: 'WORKSPACE_NOT_FOUND', msg: 'missing', level: 'page', recoverable: true } }) }
    const workspace = { current: vi.fn().mockReturnValue('/current') }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, locator as unknown as RuntimeLocator, sessions as unknown as SessionManager, transcripts as unknown as TranscriptRepository, {} as SettingsRepository, '/bingo', undefined, workspace as unknown as WorkspaceRepository)

    const handler = electron.handlers.get(IPC.sessionOpen)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, { sessionId: 'stored' }) as Result<SessionOpened>

    expect(result).toMatchObject({ ok: false, error: { code: 'SESSION_WORKSPACE_UNAVAILABLE' } })
    expect(sessions.open).not.toHaveBeenCalled()
  })

  it('rejects an unavailable model before settings persistence', async () => {
    const providers: RuntimeSettings['providers'] = [{ name: 'default', protocol: 'anthropic', apiBaseUrl: 'https://example.test', supportsImages: true, credentialConfigured: true, builtin: false }]
    const sessions = {
      snapshot: vi.fn().mockReturnValue({ connectionId: crypto.randomUUID(), sessionId: 'session-1', idle: true, workspacePath: '/tmp' }),
      listProviders: vi.fn().mockResolvedValue(providers),
      listModels: vi.fn().mockResolvedValue(['valid-model'])
    }
    const settings = { saveRuntime: vi.fn() }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, {} as RuntimeLocator, sessions as unknown as SessionManager, {} as TranscriptRepository, settings as unknown as SettingsRepository, '/bingo')

    const handler = electron.handlers.get(IPC.settingsSaveRuntime)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, { workspacePath: '/tmp', provider: 'default', model: 'invalid-model', thinkingLevel: 'off', permissionMode: 'default' }) as Result<unknown>

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFIG_INVALID', level: 'field' } })
    expect(settings.saveRuntime).not.toHaveBeenCalled()
  })

  it('persists the selected permission mode before reconnecting the active session', async () => {
    const providers: RuntimeSettings['providers'] = [{ name: 'default', protocol: 'anthropic', apiBaseUrl: 'https://example.test', supportsImages: true, credentialConfigured: true, builtin: false }]
    const nextConnectionId = crypto.randomUUID()
    const sessions = {
      snapshot: vi.fn().mockReturnValue({ connectionId: crypto.randomUUID(), sessionId: 'session-1', displayName: 'Session 1', autoTitleEligible: false, idle: true, workspacePath: '/tmp' }),
      listProviders: vi.fn().mockResolvedValue(providers),
      listModels: vi.fn().mockResolvedValue(['model']),
      open: vi.fn().mockResolvedValue({ connectionId: nextConnectionId, contextUsage: { usedTokens: 20, contextWindow: 100 } }),
      currentMetadata: vi.fn().mockReturnValue({ provider: 'default', model: 'model', thinkingLevel: 'off', permissionMode: 'acceptEdits', theme: 'auto' })
    }
    const settings = {
      saveRuntime: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue({
        effective: { provider: 'default', model: 'model', thinkingLevel: 'off', permissionMode: 'acceptEdits', theme: 'auto' },
        values: { provider: 'default', model: 'model', thinkingLevel: 'off', permissionMode: 'acceptEdits', theme: 'auto' }
      })
    }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, {} as RuntimeLocator, sessions as unknown as SessionManager, {} as TranscriptRepository, settings as unknown as SettingsRepository, '/bingo')

    const handler = electron.handlers.get(IPC.settingsSaveRuntime)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, {
      workspacePath: '/tmp', provider: 'default', model: 'model', thinkingLevel: 'off', permissionMode: 'acceptEdits'
    }) as Result<{ connectionId?: string; settings: RuntimeSettings }>

    expect(settings.saveRuntime).toHaveBeenCalledWith({ provider: 'default', model: 'model', thinkingLevel: 'off', permissionMode: 'acceptEdits' })
    expect(sessions.open).toHaveBeenCalledWith('session-1', { displayName: 'Session 1', autoTitleEligible: false }, { workspacePath: '/tmp' })
    expect(result).toMatchObject({ ok: true, value: { connectionId: nextConnectionId, contextUsage: { usedTokens: 20, contextWindow: 100 }, settings: { permissionMode: 'acceptEdits' } } })
  })

  it('returns fallback models without masking an opencode-go authentication failure', async () => {
    const sessions = {
      snapshot: vi.fn().mockReturnValue({ connectionId: crypto.randomUUID(), sessionId: 'session-1', idle: true, workspacePath: '/tmp' }),
      listModels: vi.fn().mockRejectedValue(new BingoCommandError('AUTH_REQUIRED', 'provider "opencode-go" has no API key configured', 'flow', true))
    }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, {} as RuntimeLocator, sessions as unknown as SessionManager, {} as TranscriptRepository, {} as SettingsRepository, '/bingo')

    const handler = electron.handlers.get(IPC.settingsListModels)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, { workspacePath: '/tmp', provider: 'opencode-go' }) as Result<ModelListOutput>

    expect(result).toMatchObject({
      ok: true,
      value: { provider: 'opencode-go', source: 'fallback', warning: { code: 'AUTH_REQUIRED' } }
    })
    if (result.ok) expect(result.value.models).toContain('deepseek-v4-flash')
  })

  it('returns a specific code for a stale renderer connection', async () => {
    const sessions = { cancel: vi.fn().mockRejectedValue(new Error('Connection is stale')) }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, {} as RuntimeLocator, sessions as unknown as SessionManager, {} as TranscriptRepository, {} as SettingsRepository, '/bingo')

    const handler = electron.handlers.get(IPC.sessionCancel)
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, {
      connectionId: crypto.randomUUID(),
      turnId: crypto.randomUUID()
    }) as Result<unknown>

    expect(result).toMatchObject({ ok: false, error: { code: 'CONNECTION_STALE', msg: 'Connection is stale' } })
  })

  it('validates and forwards an automatic title with session:send', async () => {
    const sessions = { send: vi.fn().mockResolvedValue(undefined) }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, {} as RuntimeLocator, sessions as unknown as SessionManager, {} as TranscriptRepository, {} as SettingsRepository, '/bingo')
    const handler = electron.handlers.get(IPC.sessionSend)
    const input = { connectionId: crypto.randomUUID(), turnId: crypto.randomUUID(), prompt: '检查项目', autoTitle: '检查项目' }

    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, input)
    const invalid = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, { ...input, autoTitle: 'a'.repeat(61) })

    expect(sessions.send).toHaveBeenCalledOnce()
    expect(sessions.send).toHaveBeenCalledWith(input.connectionId, input.turnId, input.prompt, input.autoTitle)
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(invalid).toMatchObject({ ok: false, error: { code: 'OPERATION_FAILED' } })
  })

  it('keeps session:send backward compatible and rejects an untrusted sender', async () => {
    const sessions = { send: vi.fn().mockResolvedValue(undefined) }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, {} as RuntimeLocator, sessions as unknown as SessionManager, {} as TranscriptRepository, {} as SettingsRepository, '/bingo')
    const handler = electron.handlers.get(IPC.sessionSend)!
    const input = { connectionId: crypto.randomUUID(), turnId: crypto.randomUUID(), prompt: 'legacy call' }

    await expect(handler({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, input)).resolves.toEqual({ ok: true, value: { accepted: true } })
    expect(sessions.send).toHaveBeenCalledWith(input.connectionId, input.turnId, input.prompt, undefined)
    await expect(handler({ sender: {}, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, input)).rejects.toThrow('Untrusted IPC sender')
  })

  it('forwards validated team-task creation to the active session', async () => {
    const connectionId = crypto.randomUUID()
    const task = {
      schemaVersion: 1 as const,
      id: 'task-1',
      projectKey: 'project',
      projectPath: '/workspace',
      branch: 'main',
      team: 'core-team',
      title: 'Review release',
      description: 'Inspect blockers',
      status: 'running' as const,
      participants: [],
      leader: 'reviewer',
      channel: '__task_task-1',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    }
    const sessions = { createTeamTask: vi.fn().mockResolvedValue(task) }
    const mainFrame = {}
    const webContents = { mainFrame }
    registerIpc({ webContents } as unknown as BrowserWindow, {} as RuntimeLocator, sessions as unknown as SessionManager, {} as TranscriptRepository, {} as SettingsRepository, '/bingo')

    const handler = electron.handlers.get(IPC.teamTaskCreate)
    const input = { connectionId, title: 'Review release', description: 'Inspect blockers', participants: ['reviewer'], leader: 'reviewer' }
    const result = await handler?.({ sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent, input)

    expect(sessions.createTeamTask).toHaveBeenCalledWith(connectionId, {
      title: input.title,
      description: input.description,
      participants: input.participants,
      leader: input.leader,
      contextMessageSeqs: [],
      additionalConstraints: []
    })
    expect(result).toEqual({ ok: true, value: task })
  })
})
