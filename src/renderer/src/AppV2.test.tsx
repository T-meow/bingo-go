// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BingoAppApi } from '../../shared/contracts/appServerIpc'
import type { BingoGuiApi, SettingsSnapshot } from '../../shared/contracts/ipc'
import AppV2 from './AppV2'
import { AppearanceProvider } from './theme/AppearanceProvider'

function snapshot() {
  return {
    session: { id: 'sess_1', epoch: 'epoch_1', locator: { type: 'stem', stem: 'bingo-1' }, cwd: '/tmp', provider: 'default', model: 'model', thinking: 'off', permissionMode: 'default', title: 'Session', state: 'active', resumed: false, createdAt: 0, updatedAt: 0 },
    capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true },
    config: { cwd: '/tmp', provider: 'default', model: 'model', thinking: 'off', permissionMode: 'default', theme: 'dark', shell: 'sh', shellDialect: 'posix', permissions: [], mcpServers: [], layers: [], revision: 1 },
    conversations: { active: [
      { id: 'conv_main', kind: { type: 'main' }, title: 'Main', runState: 'idle', historyGeneration: 1, isMember: true, unread: 0, mentions: 0, obligations: [], pendingInteractions: 0, queueCount: 0, queueRevision: 1, revision: 1, lastActivityAt: 0, lastItemId: null, readCursor: null, activeTurnId: null },
      { id: 'conv_agent', kind: { type: 'agent', agentId: 'agent_1' }, title: 'Child', runState: 'idle', historyGeneration: 1, isMember: true, unread: 0, mentions: 0, obligations: [], pendingInteractions: 0, queueCount: 0, queueRevision: 1, revision: 1, lastActivityAt: 0, lastItemId: null, readCursor: null, activeTurnId: null }
    ], count: 2, revision: 1 },
    collections: { agents: { active: [{ id: 'agent_1', kind: 'crew', name: 'Child', description: 'fixture agent', prompt: '', state: 'idle', provider: 'default', model: 'model', thinking: 'off', cwd: '/tmp', outputTokens: 0, toolUses: 0, pending: 0, unacked: 0, lastActiveAt: 0, recentActivity: [], conversationId: 'conv_agent' }], count: 1, revision: 1 }, rooms: { active: [], count: 0, revision: 1 }, tasks: { active: [], count: 0, revision: 1 }, deliveries: { active: [], count: 0, revision: 1 }, backgroundCommands: { active: [], count: 0, revision: 1 }, mcpServers: [] },
    activeTurns: [], interactions: [], operations: [], feedback: [], eventCursor: 1
  }
}

const api = {
  probe: vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: '/bingo', bingoVersion: '0.4.1', workspacePath: '/tmp' } }),
  connect: vi.fn().mockResolvedValue({ ok: true, value: snapshot() }),
  resume: vi.fn(),
  disconnect: vi.fn(),
  listSessions: vi.fn().mockResolvedValue({ ok: true, value: { sessions: { items: [], nextCursor: null, revision: 1 } } }),
  readConversation: vi.fn().mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', msg: 'fixture has no transcript' } }),
  markRead: vi.fn(),
  composerSubmit: vi.fn(),
  sendProse: vi.fn(),
  interrupt: vi.fn(),
  respond: vi.fn(),
  readConfig: vi.fn().mockResolvedValue({ ok: true, value: { config: snapshot().config } }),
  readCatalog: vi.fn().mockResolvedValue({ ok: true, value: { catalog: { catalog: 'providers', items: [], revision: 1 } } }),
  listActions: vi.fn().mockResolvedValue({ ok: true, value: { actions: [], revision: 1 } }),
  executeAction: vi.fn(),
  readResource: vi.fn(),
  registerAsset: vi.fn(),
  readAssetDataUrl: vi.fn(),
  queueRead: vi.fn(),
  queueReclaimTail: vi.fn(),
  sessionDelete: vi.fn(),
  restartAfterDefinitionWrite: vi.fn(),
  onEvent: vi.fn().mockReturnValue(() => undefined)
} as unknown as BingoAppApi

const gui = {
  getWorkspaces: vi.fn().mockResolvedValue({ ok: true, value: { schemaVersion: 2, currentPath: '/tmp', recentPaths: ['/tmp'] } }),
  onNotificationActivated: vi.fn().mockReturnValue(() => undefined)
} as unknown as BingoGuiApi

function conversationSnapshot(conversationId: string) {
  const conversation = snapshot().conversations.active.find((item) => item.id === conversationId)
  if (!conversation) return { ok: false, error: { code: 'NOT_FOUND', msg: 'missing conversation' } }
  return { ok: true, value: { snapshot: { conversation, activeTurn: null, contextUsage: null, interactions: [], items: { items: [], nextCursor: null, revision: 1 }, queue: { items: [], nextCursor: null, revision: 1 }, eventCursor: 1, historyGeneration: 1 } } }
}

function settingsSnapshot(): SettingsSnapshot {
  const values = {
    apiBaseUrl: '', provider: 'default', model: 'model', thinkingLevel: 'off' as const, permissionMode: 'default' as const,
    theme: 'auto' as const, motion: 'auto' as const, sendImages: true, cacheControl: false, respondToBashCommands: true,
    shell: '', permissions: { allow: [], ask: [], deny: [] }, share: { baseUrl: '' }
  }
  return {
    path: '/tmp/settings.json', revision: 'a'.repeat(64), values,
    layers: {
      user: { path: '/tmp/settings.json', exists: true, keys: [], values: {} },
      project: { path: '/tmp/.bingo/settings.json', exists: false, keys: [], values: {} },
      local: { path: '/tmp/.bingo/local.json', exists: false, keys: [], values: {} }
    },
    sources: {}, shadowed: [], providers: [], mcpServers: [], hooks: []
  }
}

beforeEach(() => {
  class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
  class IntersectionObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })))
  vi.clearAllMocks()
  window.bingoApp = api
  window.bingoGui = gui
  api.probe = vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: '/bingo', bingoVersion: '0.4.1', workspacePath: '/tmp' } })
  api.connect = vi.fn().mockResolvedValue({ ok: true, value: snapshot() })
  api.listSessions = vi.fn().mockResolvedValue({ ok: true, value: { sessions: { items: [], nextCursor: null, revision: 1 } } })
  api.readConversation = vi.fn().mockImplementation(async ({ conversationId }) => conversationSnapshot(conversationId))
  api.readConfig = vi.fn().mockResolvedValue({ ok: true, value: { config: snapshot().config } })
  api.readCatalog = vi.fn().mockResolvedValue({ ok: true, value: { catalog: { catalog: 'providers', items: [], revision: 1 } } })
  api.listActions = vi.fn().mockResolvedValue({ ok: true, value: { actions: [], revision: 1 } })
  api.composerSubmit = vi.fn().mockResolvedValue({ ok: true, value: { disposition: { type: 'turnStarted', turnId: 'turn_1' } } })
  api.sendProse = vi.fn().mockResolvedValue({ ok: true, value: { disposition: { type: 'delivered', messageId: 'message_1' } } })
  api.executeAction = vi.fn().mockResolvedValue({ ok: true, value: { disposition: { type: 'applied', result: { status: 'applied' } } } })
  api.onEvent = vi.fn().mockReturnValue(() => undefined)
  gui.getWorkspaces = vi.fn().mockResolvedValue({ ok: true, value: { schemaVersion: 2, currentPath: '/tmp', recentPaths: ['/tmp'] } })
  gui.onNotificationActivated = vi.fn().mockReturnValue(() => undefined)
  gui.readSettings = vi.fn().mockResolvedValue({ ok: true, value: settingsSnapshot() })
  gui.listGamePacks = vi.fn().mockResolvedValue({ ok: true, value: { revision: 'b'.repeat(64), items: [], warnings: [] } })
  gui.onGamePackEvent = vi.fn().mockReturnValue(() => undefined)
  gui.readAppearance = vi.fn().mockResolvedValue({ ok: true, value: { path: '/tmp/appearance.json', revision: 'c'.repeat(64), values: { schemaVersion: 1, colorMode: 'light', accentColor: '#1F8A7A', density: 'comfortable', motion: 'system', inspectorCollapsed: false } } })
  gui.saveAppearance = vi.fn().mockImplementation(async ({ values }) => ({ ok: true, value: { path: '/tmp/appearance.json', revision: 'd'.repeat(64), values } }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AppV2', () => {
  it('connects the app-server and renders the main conversation', async () => {
    render(<AntApp><AppV2 /></AntApp>)
    await waitFor(() => expect(screen.getByTestId('conversation-canvas')).toBeTruthy())
    expect(screen.getAllByText('Main').length).toBeGreaterThan(0)
    expect(api.probe).toHaveBeenCalledWith('/tmp')
    expect(api.connect).toHaveBeenCalledWith('/tmp')
  })

  it('uses composerSubmit for the main conversation and sendProse for an Agent conversation', async () => {
    render(<AntApp><AppV2 /></AntApp>)
    const mainInput = await screen.findByPlaceholderText('描述任务或要修改的内容')
    fireEvent.change(mainInput, { target: { value: 'main task' } })
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }))
    await waitFor(() => expect(api.composerSubmit).toHaveBeenCalledWith('conv_main', 'main task', 'normal', []))

    fireEvent.click(screen.getByText('Child'))
    const agentInput = await screen.findByPlaceholderText('发送消息给 Child')
    expect(screen.queryByText('Shell')).toBeNull()
    fireEvent.change(agentInput, { target: { value: 'agent message' } })
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }))
    await waitFor(() => expect(api.sendProse).toHaveBeenCalledWith('conv_agent', 'agent message', []))
  })

  it('opens the game center and jumps directly to game settings', async () => {
    render(<AntApp><AppV2 /></AntApp>)
    await screen.findByTestId('conversation-canvas')
    fireEvent.click(screen.getByRole('button', { name: '打开小游戏中心' }))
    fireEvent.click(await screen.findByRole('button', { name: '打开小游戏设置' }))

    expect(await screen.findByRole('heading', { name: '小游戏' })).toBeTruthy()
    expect(screen.getByText('应用管理')).toBeTruthy()
  })

  it('protects unsaved settings before leaving the settings view', async () => {
    render(<AppearanceProvider><AppV2 /></AppearanceProvider>)
    await screen.findByTestId('conversation-canvas')
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(await screen.findByText('外观'))
    fireEvent.click(await screen.findByText('暗色'))
    await waitFor(() => expect((screen.getByRole('button', { name: '保存外观' }) as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(screen.getByRole('button', { name: '团队' }))
    expect((await screen.findAllByText('放弃未保存的设置？')).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('workspace-page-v2')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '放弃更改' }))
    expect(await screen.findByTestId('workspace-page-v2')).toBeTruthy()
  })

  it('leaves appearance settings cleanly after saving a preview', async () => {
    render(<AppearanceProvider><AppV2 /></AppearanceProvider>)
    await screen.findByTestId('conversation-canvas')
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(await screen.findByText('外观'))
    fireEvent.click(await screen.findByText('暗色'))
    fireEvent.click(await screen.findByRole('button', { name: '保存外观' }))

    await waitFor(() => expect(gui.saveAppearance).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '团队' }))
    expect(await screen.findByTestId('workspace-page-v2')).toBeTruthy()
    expect(screen.queryByText('放弃未保存的设置？')).toBeNull()
  })
})
