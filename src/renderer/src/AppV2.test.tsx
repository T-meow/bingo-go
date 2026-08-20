// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BingoAppApi } from '../../shared/contracts/appServerIpc'
import AppV2 from './AppV2'

function snapshot() {
  return {
    session: { id: 'sess_1', epoch: 'epoch_1', locator: { type: 'stem', stem: 'bingo-1' }, cwd: '/tmp', provider: 'default', model: 'model', thinking: 'off', permissionMode: 'default', title: 'Session', state: 'active', resumed: false, createdAt: 0, updatedAt: 0 },
    capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true },
    config: { cwd: '/tmp', provider: 'default', model: 'model', thinking: 'off', permissionMode: 'default', theme: 'dark', shell: 'sh', shellDialect: 'posix', permissions: [], mcpServers: [], layers: [], revision: 1 },
    conversations: { active: [{ id: 'conv_main', kind: { type: 'main' }, title: 'Main', runState: 'idle', historyGeneration: 1, isMember: true, unread: 0, mentions: 0, obligations: [], pendingInteractions: 0, queueCount: 0, queueRevision: 1, revision: 1, lastActivityAt: 0, lastItemId: null, readCursor: null, activeTurnId: null }], count: 1, revision: 1 },
    collections: { agents: { active: [], count: 0, revision: 1 }, rooms: { active: [], count: 0, revision: 1 }, tasks: { active: [], count: 0, revision: 1 }, deliveries: { active: [], count: 0, revision: 1 }, backgroundCommands: { active: [], count: 0, revision: 1 }, mcpServers: [] },
    activeTurns: [], interactions: [], operations: [], feedback: [], eventCursor: 1
  }
}

const api = {
  probe: vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: '/bingo', bingoVersion: '0.4.1', workspacePath: '/tmp' } }),
  connect: vi.fn().mockResolvedValue({ ok: true, value: snapshot() }),
  resume: vi.fn(),
  disconnect: vi.fn(),
  listSessions: vi.fn(),
  readConversation: vi.fn(),
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

beforeEach(() => {
  class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })))
  vi.clearAllMocks()
  window.bingoApp = api
  api.probe = vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: '/bingo', bingoVersion: '0.4.1', workspacePath: '/tmp' } })
  api.connect = vi.fn().mockResolvedValue({ ok: true, value: snapshot() })
  api.readConfig = vi.fn().mockResolvedValue({ ok: true, value: { config: snapshot().config } })
  api.readCatalog = vi.fn().mockResolvedValue({ ok: true, value: { catalog: { catalog: 'providers', items: [], revision: 1 } } })
  api.listActions = vi.fn().mockResolvedValue({ ok: true, value: { actions: [], revision: 1 } })
  api.onEvent = vi.fn().mockReturnValue(() => undefined)
})

describe('AppV2', () => {
  it('connects the app-server and renders the main conversation', async () => {
    render(<AntApp><AppV2 /></AntApp>)
    await waitFor(() => expect(screen.getByTestId('conversation-canvas')).toBeTruthy())
    expect(screen.getAllByText('Main').length).toBeGreaterThan(0)
    expect(api.connect).toHaveBeenCalledWith('/tmp')
  })
})
