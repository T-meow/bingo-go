// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamSnapshot } from '../../shared/contracts/cli'
import type { BingoGuiApi, EditableSettings, RendererSessionEvent, SessionListOutput, SessionOpened, SettingsSnapshot } from '../../shared/contracts/ipc'
import App from './App'
import { AppearanceProvider } from './theme/AppearanceProvider'

const firstSession = { id: 'project-1', name: 'First session', preview: 'Remember amber', updatedAt: '2026-08-10T05:00:00.000Z', messageCount: 2 }
const secondSession = { id: 'project-2', name: 'Second session', preview: 'Latest answer', updatedAt: '2026-08-10T06:00:00.000Z', messageCount: 1 }

const editable: EditableSettings = {
  apiBaseUrl: 'https://example.test', provider: 'opencode-go', model: 'gpt-5.6-luna', thinkingLevel: 'off',
  permissionMode: 'default', theme: 'auto', motion: 'auto', sendImages: true, cacheControl: false,
  respondToBashCommands: true, shell: '', permissions: { allow: [], ask: [], deny: [] }, team: { autoStart: true },
  experimental: { agentChannels: true, channelMessageLimit: 500, agentMessageLimit: 50 }, share: { baseUrl: 'https://bingo.ruobin.dev' }
}
const providers = [
  { name: 'default', protocol: 'anthropic' as const, apiBaseUrl: 'https://example.test', supportsImages: true, credentialConfigured: true, builtin: false },
  { name: 'opencode-go', protocol: 'openai' as const, apiBaseUrl: 'https://opencode.ai/zen/go', supportsImages: false, credentialConfigured: false, builtin: true }
]
const settingsSnapshot: SettingsSnapshot = {
  path: '/home/.config/bingo/settings.json', revision: 'a'.repeat(64), values: editable, effective: editable,
  layers: {
    user: { path: '/home/.config/bingo/settings.json', exists: true, keys: ['provider'], values: { provider: 'opencode-go' } },
    project: { path: '/workspace/.bingo/settings.json', exists: false, keys: [], values: {} },
    local: { path: '/workspace/.bingo/local.json', exists: false, keys: [], values: {} }
  },
  sources: { provider: '/home/.config/bingo/settings.json' }, shadowed: [], providers
}
const teamSnapshot: TeamSnapshot = {
  available: true, path: '/workspace/.bingo/team.json', revision: 'b'.repeat(64), branch: 'main', validation: null,
  definition: { schemaVersion: 1, name: 'core-team', channel: { mode: 'serial', messageLimit: 500 }, members: [{ name: 'reviewer', agent: 'reviewer' }] },
  agentDefinitions: [{ name: 'reviewer', description: 'Reviews changes', source: 'project' }], avatars: ['sora'],
  members: [{ name: 'reviewer', agent: 'reviewer', status: 'standby', pending: 0, unacked: 0, model: 'm', provider: 'default' }],
  channels: [{ name: 'core-team', mode: 'serial', seq: 0, frozen: false, members: ['main', 'user', 'reviewer'], messages: [] }]
}

function opened(sessionId: string, history: SessionOpened['history'] = [], capabilities: string[] = ['settings.inspect.v1', 'team.workspace.v1']): SessionOpened {
  return {
    connectionId: crypto.randomUUID(),
    metadata: {
      bingoVersion: '0.4.0', protocolVersion: 1, sessionId, displayName: sessionId === firstSession.id ? firstSession.name : '新对话', resumed: history.length > 0,
      cwd: '/workspace', provider: 'opencode-go', model: 'gpt-5.6-luna', thinkingLevel: 'off', permissionMode: 'default', theme: 'auto', supportsImages: false, capabilities
    },
    history
  }
}

function api(list: SessionListOutput, capabilities: string[] = ['settings.inspect.v1', 'team.workspace.v1']): BingoGuiApi {
  let listener: ((event: RendererSessionEvent) => void) | undefined
  const bridge = {
    getAppInfo: vi.fn().mockResolvedValue({ ok: true, value: { appVersion: '0.1.0', platform: 'win32', arch: 'x64', packaged: false } }),
    probeRuntime: vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: '/bingo', bingoVersion: '0.4.0', protocolVersion: 1, workspacePath: '/workspace', capabilities } }),
    getWorkspaces: vi.fn().mockResolvedValue({ ok: true, value: { schemaVersion: 2, currentPath: '/workspace', recentPaths: ['/workspace'] } }),
    selectWorkspace: vi.fn().mockResolvedValue({ ok: true, value: { canceled: true, preferences: { schemaVersion: 2, currentPath: '/workspace', recentPaths: ['/workspace'] } } }),
    listSessions: vi.fn().mockResolvedValue({ ok: true, value: list }),
    openSession: vi.fn().mockImplementation(async ({ sessionId }: { sessionId: string | null }) => ({ ok: true, value: opened(sessionId ?? 'new-session', sessionId === firstSession.id ? [
      { type: 'message', value: { id: 'history-user', role: 'user', markdown: 'Remember amber' } },
      { type: 'message', value: { id: 'history-assistant', role: 'assistant', markdown: 'I will remember amber' } }
    ] : [], capabilities) })),
    renameSession: vi.fn(), deleteSession: vi.fn(),
    readRuntimeSettings: vi.fn().mockResolvedValue({ ok: true, value: { providers, provider: editable.provider, model: editable.model, thinkingLevel: editable.thinkingLevel, theme: editable.theme } }),
    listModels: vi.fn().mockResolvedValue({ ok: true, value: { provider: editable.provider, models: [editable.model] } }),
    saveRuntimeSettings: vi.fn(), readSettings: vi.fn().mockResolvedValue({ ok: true, value: settingsSnapshot }), saveSettings: vi.fn(),
    upsertProvider: vi.fn(), removeProvider: vi.fn(), upsertMcpServer: vi.fn(), removeMcpServer: vi.fn(),
    readTeam: vi.fn().mockResolvedValue({ ok: true, value: teamSnapshot }), validateTeam: vi.fn(), saveTeam: vi.fn(), startTeam: vi.fn(), stopTeam: vi.fn(),
    messageTeamMember: vi.fn(), stopTeamMember: vi.fn(), removeTeamMember: vi.fn(), readTeamActivity: vi.fn().mockResolvedValue({ ok: true, value: { member: 'reviewer', activity: [] } }),
    postTeamChannel: vi.fn(), readTeamChannel: vi.fn(),
    readAppearance: vi.fn().mockResolvedValue({ ok: true, value: { path: '/preferences.json', revision: 'c'.repeat(64), values: { schemaVersion: 1, colorMode: 'system', accentColor: '#756AA8', density: 'comfortable', motion: 'system', inspectorCollapsed: false } } }),
    saveAppearance: vi.fn(), closeSession: vi.fn(), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), captureVisual: vi.fn(),
    onSessionEvent: vi.fn().mockImplementation((next) => { listener = next; return () => { listener = undefined } })
  }
  return bridge as unknown as BingoGuiApi
}

function renderApp(): void { render(<AppearanceProvider><App /></AppearanceProvider>) }

describe('Bingo Go workbench', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
    class IntersectionObserverStub { root = null; rootMargin = ''; thresholds = [0]; observe(): void {} unobserve(): void {} disconnect(): void {} takeRecords(): IntersectionObserverEntry[] { return [] } }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const computedStyle = window.getComputedStyle.bind(window)
    vi.stubGlobal('getComputedStyle', (element: Element) => computedStyle(element))
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('opens an exact transcript and restores its history', async () => {
    const bridge = api({ sessions: [secondSession, firstSession], warnings: [] })
    window.bingoGui = bridge
    renderApp()
    const sessionLabel = await screen.findByText('First session')
    expect(bridge.openSession).not.toHaveBeenCalled()
    fireEvent.click(sessionLabel)
    await waitFor(() => expect(bridge.openSession).toHaveBeenCalledWith({ sessionId: firstSession.id }))
    expect((await screen.findAllByText('Remember amber')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('I will remember amber')).toBeTruthy()
  })

  it('loads the settings center and renders credential state without secrets', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    window.bingoGui = bridge
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    expect(await screen.findByRole('heading', { name: '常规与运行' })).toBeTruthy()
    fireEvent.click(screen.getByText('API 供应商'))
    expect(await screen.findByText('opencode-go')).toBeTruthy()
    expect(screen.getByText('未配置')).toBeTruthy()
    expect(document.body.textContent).not.toContain('sk-')
  })

  it('opens Team when capability is present and degrades when it is absent', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    window.bingoGui = bridge
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Team' }))
    await waitFor(() => expect(bridge.readTeam).toHaveBeenCalled())
    expect(await screen.findByRole('heading', { name: 'core-team' })).toBeTruthy()
    cleanup()

    const legacy = api({ sessions: [], warnings: [] }, [])
    window.bingoGui = legacy
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Team' }))
    expect(await screen.findByText('CAPABILITY_UNAVAILABLE')).toBeTruthy()
    expect(legacy.readTeam).not.toHaveBeenCalled()
  })
})
