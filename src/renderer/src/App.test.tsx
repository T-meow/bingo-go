// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEAM_V2_CAPABILITIES, type TeamSnapshot, type TeamTask, type TeamTaskSummary } from '../../shared/contracts/cli'
import type { BingoGuiApi, EditableSettings, GamePackSnapshot, NotificationActivation, RendererSessionEvent, SessionListOutput, SessionOpened, SettingsSnapshot } from '../../shared/contracts/ipc'
import App from './App'
import { AppearanceProvider } from './theme/AppearanceProvider'

const firstSession = { id: 'project-1', name: 'First session', preview: 'Remember amber', updatedAt: '2026-08-10T05:00:00.000Z', messageCount: 2, workspacePath: '/workspace' }
const secondSession = { id: 'project-2', name: 'Second session', preview: 'Latest answer', updatedAt: '2026-08-10T06:00:00.000Z', messageCount: 1, workspacePath: '/workspace' }

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
const taskMember = { memberId: 'member-reviewer', name: 'reviewer', agent: 'reviewer', description: 'Reviews changes', system: 'Review carefully.', inheritSystem: true, profile: { constraints: [], preferences: [] }, team: 'core-team', directory: '/workspace' }
const teamTaskSummary: TeamTaskSummary = {
  id: 'task-1', title: 'Release review', status: 'awaiting_review', participants: [taskMember], leader: 'reviewer', projectPath: '/workspace', branch: 'main',
  createdAt: 1, updatedAt: 3, messageCount: 3, reviewSummary: 'All release checks passed.'
}
const teamTask: TeamTask = {
  schemaVersion: 1, id: 'task-1', projectKey: 'project', projectPath: '/workspace', branch: 'main', team: 'core-team', title: 'Release review',
  description: 'Inspect blockers', status: 'awaiting_review', participants: [taskMember], leader: 'reviewer', channel: '__task_task-1', createdAt: 1, updatedAt: 3,
  reviewSummary: 'All release checks passed.', messages: [
    { seq: 1, kind: 'user', from: 'user', text: 'Inspect blockers', at: 1 },
    { seq: 2, kind: 'member', from: 'reviewer', text: '**Checks passed.**', at: 2 },
    { seq: 3, kind: 'system', text: 'Task is awaiting user review', at: 3 }
  ]
}

function opened(sessionId: string, history: SessionOpened['history'] = [], capabilities: string[] = ['settings.inspect.v1', 'team.workspace.v1']): SessionOpened {
  return {
    connectionId: crypto.randomUUID(),
    metadata: {
      bingoVersion: '0.4.0', protocolVersion: 1, sessionId, displayName: sessionId === firstSession.id ? firstSession.name : '新对话', resumed: history.length > 0,
      cwd: '/workspace', provider: 'opencode-go', model: 'gpt-5.6-luna', thinkingLevel: 'off', permissionMode: 'default', theme: 'auto', supportsImages: false, capabilities
    },
    history,
    autoTitleEligible: history.length === 0 && sessionId === 'new-session',
    runtime: { binaryPath: '/bingo', bingoVersion: '0.4.0', protocolVersion: 1, workspacePath: '/workspace', capabilities },
    workspacePreferences: { schemaVersion: 2, currentPath: '/workspace', recentPaths: ['/workspace'] },
    contextUsage: null
  }
}

type TestBingoGuiApi = BingoGuiApi & {
  emitSessionEvent: (event: RendererSessionEvent) => void
  emitNotificationActivation: (event: NotificationActivation) => void
}

function api(list: SessionListOutput, capabilities: string[] = ['settings.inspect.v1', 'team.workspace.v1']): TestBingoGuiApi {
  let listener: ((event: RendererSessionEvent) => void) | undefined
  let notificationListener: ((event: NotificationActivation) => void) | undefined
  const notificationValues = { schemaVersion: 1 as const, enabled: true, turnCompleted: true, actionRequired: true, failures: true, sound: true }
  const gamePacks: GamePackSnapshot = { revision: 'f'.repeat(64), warnings: [], items: [{
    manifest: { schemaVersion: 1, kind: 'game', id: 'io.github.tmeow.bingogo.bingo', name: 'Bingo', version: '1.0.0', entry: 'index.html', description: '抽号、标记并完成五格连线', author: 'Bingo Go', window: { width: 440, height: 620, minWidth: 360, minHeight: 520, resizable: true } },
    source: 'builtin', enabled: true, status: 'ready', sha256: '1'.repeat(64)
  }] }
  const bridge = {
    getAppInfo: vi.fn().mockResolvedValue({ ok: true, value: { appVersion: '0.1.0', platform: 'win32', arch: 'x64', packaged: false } }),
    probeRuntime: vi.fn().mockResolvedValue({ ok: true, value: { binaryPath: '/bingo', bingoVersion: '0.4.0', protocolVersion: 1, workspacePath: '/workspace', capabilities } }),
    getWorkspaces: vi.fn().mockResolvedValue({ ok: true, value: { schemaVersion: 2, currentPath: '/workspace', recentPaths: ['/workspace'] } }),
    selectWorkspace: vi.fn().mockResolvedValue({ ok: true, value: { canceled: true, preferences: { schemaVersion: 2, currentPath: '/workspace', recentPaths: ['/workspace'] } } }),
    openExternalTerminal: vi.fn().mockResolvedValue({ ok: true, value: { terminalName: 'Windows Terminal', workspacePath: '/workspace' } }),
    listSessions: vi.fn().mockResolvedValue({ ok: true, value: list }),
    openSession: vi.fn().mockImplementation(async ({ sessionId }: { sessionId: string | null }) => ({ ok: true, value: opened(sessionId ?? 'new-session', sessionId === firstSession.id ? [
      { type: 'message', value: { id: 'history-user', role: 'user', markdown: 'Remember amber' } },
      { type: 'message', value: { id: 'history-assistant', role: 'assistant', markdown: 'I will remember amber' } }
    ] : [], capabilities) })),
    renameSession: vi.fn(), deleteSession: vi.fn(), forkSession: vi.fn(),
    readRuntimeSettings: vi.fn().mockResolvedValue({ ok: true, value: { providers, provider: editable.provider, model: editable.model, thinkingLevel: editable.thinkingLevel, permissionMode: editable.permissionMode, theme: editable.theme } }),
    listModels: vi.fn().mockResolvedValue({ ok: true, value: { provider: editable.provider, models: [editable.model], source: 'remote' } }),
    saveRuntimeSettings: vi.fn(), readSettings: vi.fn().mockResolvedValue({ ok: true, value: settingsSnapshot }), saveSettings: vi.fn(),
    upsertProvider: vi.fn(), removeProvider: vi.fn(), upsertMcpServer: vi.fn(), removeMcpServer: vi.fn(),
    readTeam: vi.fn().mockResolvedValue({ ok: true, value: teamSnapshot }), validateTeam: vi.fn(), saveTeam: vi.fn(), startTeam: vi.fn(), stopTeam: vi.fn(),
    getTeamLobby: vi.fn().mockResolvedValue({ ok: true, value: { schemaVersion: 1, id: 'lobby-1', projectKey: 'project', projectPath: '/workspace', branch: 'main', messages: [] } }),
    postTeamLobby: vi.fn(), importTeamAvatar: vi.fn(), chooseTeamPreset: vi.fn(), importTeamPreset: vi.fn(), exportTeamPreset: vi.fn(),
    restartTeamMember: vi.fn(), markTeamMemberUseful: vi.fn(), promoteTeamMember: vi.fn(),
    messageTeamMember: vi.fn(), stopTeamMember: vi.fn(), removeTeamMember: vi.fn(), readTeamActivity: vi.fn().mockResolvedValue({ ok: true, value: { member: 'reviewer', activity: [] } }),
    postTeamChannel: vi.fn(), readTeamChannel: vi.fn(),
    listTeamTasks: vi.fn().mockResolvedValue({ ok: true, value: { branch: 'main', tasks: [] } }),
    getTeamTask: vi.fn(), createTeamTask: vi.fn(), postTeamTask: vi.fn(), pauseTeamTask: vi.fn(), resumeTeamTask: vi.fn(), completeTeamTask: vi.fn(), cancelTeamTask: vi.fn(),
    listAgentDefinitions: vi.fn().mockResolvedValue({ ok: true, value: [] }), getAgentDefinition: vi.fn(), saveAgentDefinition: vi.fn(), archiveAgentDefinition: vi.fn(),
    readAppearance: vi.fn().mockResolvedValue({ ok: true, value: { path: '/preferences.json', revision: 'c'.repeat(64), values: { schemaVersion: 1, colorMode: 'system', accentColor: '#756AA8', density: 'comfortable', motion: 'system', inspectorCollapsed: false } } }),
    saveAppearance: vi.fn(),
    readNotificationPreferences: vi.fn().mockResolvedValue({ ok: true, value: { path: '/notifications.json', revision: 'd'.repeat(64), values: notificationValues, supported: true } }),
    saveNotificationPreferences: vi.fn().mockImplementation(async ({ values }) => ({ ok: true, value: { path: '/notifications.json', revision: 'e'.repeat(64), values, supported: true } })),
    closeSession: vi.fn(), addAttachment: vi.fn(), sendTurn: vi.fn(), cancelTurn: vi.fn(), respondToPrompt: vi.fn(), writeClipboardText: vi.fn().mockResolvedValue({ ok: true, value: { written: true } }),
    listGamePacks: vi.fn().mockResolvedValue({ ok: true, value: gamePacks }), chooseGamePack: vi.fn(), installGamePack: vi.fn(), setGamePackEnabled: vi.fn(), launchGamePack: vi.fn().mockResolvedValue({ ok: true, value: { launched: true } }), clearGamePackData: vi.fn(), uninstallGamePack: vi.fn(),
    onSessionEvent: vi.fn().mockImplementation((next) => { listener = next; return () => { listener = undefined } }),
    onNotificationActivated: vi.fn().mockImplementation((next) => { notificationListener = next; return () => { notificationListener = undefined } }),
    onGamePackEvent: vi.fn().mockReturnValue(() => undefined),
    emitSessionEvent: (event: RendererSessionEvent) => listener?.(event),
    emitNotificationActivation: (event: NotificationActivation) => notificationListener?.(event)
  }
  return bridge as unknown as TestBingoGuiApi
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

  it('requires an explicit workspace binding before opening an unclassified session', async () => {
    const unclassified = { ...firstSession, id: 'legacy-session', name: 'Legacy session', workspacePath: null }
    const bridge = api({ sessions: [unclassified], warnings: [] })
    window.bingoGui = bridge
    renderApp()

    fireEvent.click(await screen.findByText('Legacy session'))
    expect((await screen.findAllByText('为对话选择项目')).length).toBeGreaterThan(0)
    expect(bridge.openSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /使用当前项目/ }))

    await waitFor(() => expect(bridge.openSession).toHaveBeenCalledWith({
      sessionId: unclassified.id,
      workspacePath: '/workspace',
      bindWorkspace: true
    }))
  })

  it('offers relocation when a classified session workspace is unavailable', async () => {
    const stale = { ...firstSession, id: 'stale-session', name: 'Stale session', workspacePath: '/missing/project' }
    const bridge = api({ sessions: [stale], warnings: [] })
    vi.mocked(bridge.openSession)
      .mockResolvedValueOnce({ ok: false, error: { code: 'SESSION_WORKSPACE_UNAVAILABLE', msg: 'Workspace is unavailable.', level: 'flow', recoverable: true } })
      .mockResolvedValueOnce({ ok: true, value: opened(stale.id) })
    window.bingoGui = bridge
    renderApp()

    fireEvent.change(await screen.findByPlaceholderText('搜索对话'), { target: { value: 'Stale session' } })
    fireEvent.click(await screen.findByText('Stale session'))
    expect((await screen.findAllByText('项目路径不可用')).length).toBeGreaterThan(0)
    expect(bridge.openSession).toHaveBeenNthCalledWith(1, { sessionId: stale.id })
    fireEvent.click(screen.getByRole('button', { name: /使用当前项目/ }))

    await waitFor(() => expect(bridge.openSession).toHaveBeenNthCalledWith(2, {
      sessionId: stale.id,
      workspacePath: '/workspace',
      bindWorkspace: true
    }))
  })

  it('applies the first automatic title on turn.started and never changes it on later turns', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    vi.mocked(bridge.sendTurn).mockResolvedValue({ ok: true, value: { accepted: true } })
    window.bingoGui = bridge
    renderApp()
    const composer = await screen.findByPlaceholderText('给 Bingo 发送消息')
    vi.mocked(bridge.listSessions).mockResolvedValue({
      ok: true,
      value: { sessions: [{ id: 'new-session', name: '新对话', preview: '', updatedAt: '2026-08-13T00:00:00.000Z', messageCount: 0, workspacePath: '/workspace' }], warnings: [] }
    })

    fireEvent.change(composer, { target: { value: '## 检查 **项目**' } })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))
    await waitFor(() => expect(bridge.sendTurn).toHaveBeenCalledOnce())
    const firstInput = vi.mocked(bridge.sendTurn).mock.calls[0][0]
    expect(firstInput.autoTitle).toBe('检查 项目')
    expect(document.querySelector('.page-heading h1')?.textContent).toBe('新对话')

    act(() => bridge.emitSessionEvent({
      connectionId: crypto.randomUUID(),
      sequence: 1,
      payload: { protocolVersion: 1, seq: 2, sessionId: 'new-session', type: 'turn.started', commandId: crypto.randomUUID(), turnId: firstInput.turnId }
    }))
    expect(document.querySelector('.page-heading h1')?.textContent).toBe('新对话')

    act(() => bridge.emitSessionEvent({
      connectionId: firstInput.connectionId,
      sequence: 1,
      payload: { protocolVersion: 1, seq: 2, sessionId: 'new-session', type: 'turn.started', commandId: crypto.randomUUID(), turnId: firstInput.turnId }
    }))
    expect(document.querySelector('.page-heading h1')?.textContent).toBe('检查 项目')
    expect(document.querySelector('.session-label strong')?.textContent).toBe('检查 项目')

    act(() => bridge.emitSessionEvent({
      connectionId: firstInput.connectionId,
      sequence: 2,
      payload: { protocolVersion: 1, seq: 3, sessionId: 'new-session', type: 'turn.completed', turnId: firstInput.turnId }
    }))
    fireEvent.change(screen.getByPlaceholderText('给 Bingo 发送消息'), { target: { value: '第二条消息' } })
    await waitFor(() => expect(screen.getByRole('button', { name: '发送消息' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))
    await waitFor(() => expect(bridge.sendTurn).toHaveBeenCalledTimes(2))
    const secondInput = vi.mocked(bridge.sendTurn).mock.calls[1][0]
    expect(secondInput).not.toHaveProperty('autoTitle')

    act(() => bridge.emitSessionEvent({
      connectionId: secondInput.connectionId,
      sequence: 3,
      payload: { protocolVersion: 1, seq: 4, sessionId: 'new-session', type: 'turn.started', commandId: crypto.randomUUID(), turnId: secondInput.turnId }
    }))
    expect(document.querySelector('.page-heading h1')?.textContent).toBe('检查 项目')
  })

  it('retries automatic naming after the first send is rejected', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    vi.mocked(bridge.sendTurn)
      .mockResolvedValueOnce({ ok: false, error: { code: 'WRITE_FAILED', msg: '发送失败', level: 'flow', recoverable: true } })
      .mockResolvedValueOnce({ ok: true, value: { accepted: true } })
    window.bingoGui = bridge
    renderApp()
    await screen.findByPlaceholderText('给 Bingo 发送消息')
    vi.mocked(bridge.listSessions).mockResolvedValue({
      ok: true,
      value: { sessions: [{ id: 'new-session', name: '新对话', preview: '', updatedAt: '2026-08-13T00:00:00.000Z', messageCount: 0, workspacePath: '/workspace' }], warnings: [] }
    })

    fireEvent.change(screen.getByPlaceholderText('给 Bingo 发送消息'), { target: { value: '第一次' } })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))
    await waitFor(() => expect(bridge.sendTurn).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByText('WRITE_FAILED')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('给 Bingo 发送消息'), { target: { value: '重试标题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))
    await waitFor(() => expect(bridge.sendTurn).toHaveBeenCalledTimes(2))
    const retryInput = vi.mocked(bridge.sendTurn).mock.calls[1][0]
    expect(retryInput.autoTitle).toBe('重试标题')

    act(() => bridge.emitSessionEvent({
      connectionId: retryInput.connectionId,
      sequence: 1,
      payload: { protocolVersion: 1, seq: 2, sessionId: 'new-session', type: 'turn.started', commandId: crypto.randomUUID(), turnId: retryInput.turnId }
    }))
    expect(document.querySelector('.page-heading h1')?.textContent).toBe('重试标题')
  })

  it('does not generate a title for a restored manually named conversation', async () => {
    const manual = { ...firstSession, id: 'project-1--Manual_title', name: 'Manual_title' }
    const bridge = api({ sessions: [manual], warnings: [] })
    vi.mocked(bridge.openSession).mockResolvedValue({ ok: true, value: {
      ...opened(manual.id, [{ type: 'message', value: { id: 'history-user', role: 'user', markdown: '历史问题' } }]),
      metadata: { ...opened(manual.id).metadata, sessionId: manual.id, displayName: manual.name, resumed: true },
      autoTitleEligible: false
    } })
    vi.mocked(bridge.sendTurn).mockResolvedValue({ ok: true, value: { accepted: true } })
    window.bingoGui = bridge
    renderApp()

    fireEvent.click(await screen.findByText('Manual_title'))
    const composer = await screen.findByPlaceholderText('给 Bingo 发送消息')
    fireEvent.change(composer, { target: { value: '新问题不应覆盖名称' } })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))

    await waitFor(() => expect(bridge.sendTurn).toHaveBeenCalledOnce())
    expect(vi.mocked(bridge.sendTurn).mock.calls[0][0]).not.toHaveProperty('autoTitle')
    expect(document.querySelector('.page-heading h1')?.textContent).toBe('Manual_title')
  })

  it('renders long prompt options in a wrapping title and description layout', async () => {
    const bridge = api({ sessions: [firstSession], warnings: [] })
    window.bingoGui = bridge
    renderApp()
    fireEvent.click(await screen.findByText('First session'))
    await waitFor(() => expect(bridge.openSession).toHaveBeenCalledOnce())
    const openedResult = await vi.mocked(bridge.openSession).mock.results[0].value
    if (!openedResult.ok) throw new Error(openedResult.error.msg)

    act(() => bridge.emitSessionEvent({
      connectionId: openedResult.value.connectionId,
      sequence: 1,
      payload: {
        protocolVersion: 1,
        seq: 2,
        sessionId: firstSession.id,
        type: 'prompt.request',
        turnId: crypto.randomUUID(),
        promptId: crypto.randomUUID(),
        kind: 'question',
        title: '团队规模',
        question: '创建 team 需要先定义 agent 成员。你希望怎么组织？',
        options: [{
          id: 'small-team',
          label: '3人小组 (Recommended)',
          description: '1名分析员 + 1名代码审阅 + 1名技术写作，足够覆盖 D:\\Projects\\very-long-workspace-name\\src\\features 的初步分析'
        }],
        allowFreeText: true
      }
    }))

    const dialog = await screen.findByRole('dialog')
    const option = within(dialog).getByRole('button', { name: /3人小组/ })
    expect(option.classList.contains('prompt-option')).toBe(true)
    expect(option.querySelector('.prompt-option-content strong')?.textContent).toBe('3人小组 (Recommended)')
    expect(option.querySelector('.prompt-option-content small')?.textContent).toContain('very-long-workspace-name')
  })

  it('collapses conversation tool activity by default while keeping it expandable', async () => {
    const bridge = api({ sessions: [firstSession], warnings: [] })
    vi.mocked(bridge.openSession).mockResolvedValue({ ok: true, value: opened(firstSession.id, [
      { type: 'message', value: { id: 'history-user', role: 'user', markdown: 'Inspect this project' } },
      { type: 'tool', value: { id: 'history-tool', name: 'Bash', summary: 'Get-ChildItem', status: 'done', output: 'README.md' } },
      { type: 'message', value: { id: 'history-assistant', role: 'assistant', markdown: 'Inspection complete' } }
    ]) })
    window.bingoGui = bridge
    renderApp()

    fireEvent.click(await screen.findByText('First session'))

    const labels = await screen.findAllByText('1 项工具活动')
    const label = labels.find((item) => item.closest('summary'))
    expect(label).toBeTruthy()
    const summary = label!.closest('summary')
    const details = label!.closest('details')
    expect(summary).toBeTruthy()
    expect(details?.open).toBe(false)

    fireEvent.click(summary!)
    expect(details?.open).toBe(true)
    expect(within(details!).getByRole('button', { name: 'Bash' })).toBeTruthy()
  })

  it('copies prompt text and edits only the final prompt through an image-aware fork', async () => {
    const capabilities = ['settings.inspect.v1', 'team.workspace.v1', 'session.fork.v1', 'attachments.input.v1']
    const firstTurnId = '123e4567-e89b-42d3-a456-426614174010'
    const lastTurnId = '123e4567-e89b-42d3-a456-426614174011'
    const sourceHistory: SessionOpened['history'] = [
      { type: 'message', value: { id: 'source:2', role: 'user', markdown: 'first prompt', turnId: firstTurnId, origin: 'prompt', revision: 'a'.repeat(64), turnStatus: 'completed' } },
      { type: 'message', value: { id: 'source:3', role: 'assistant', markdown: 'first answer', origin: 'assistant' } },
      { type: 'message', value: {
        id: 'source:4', role: 'user', markdown: 'last prompt', turnId: lastTurnId, origin: 'prompt', editable: true, revision: 'b'.repeat(64), turnStatus: 'completed',
        attachments: [{ id: 'source:4:image:0', name: 'screen.png', mediaType: 'image/png', dataUrl: 'data:image/png;base64,aA==' }]
      } },
      { type: 'message', value: { id: 'source:5', role: 'assistant', markdown: 'last answer', origin: 'assistant' } }
    ]
    const sourceOpened = opened(firstSession.id, sourceHistory, capabilities)
    sourceOpened.metadata = { ...sourceOpened.metadata, provider: 'default', model: 'model', supportsImages: true }
    const childHistory = sourceHistory.slice(0, 2)
    const childOpened = opened('child-session', childHistory, capabilities)
    childOpened.metadata = {
      ...childOpened.metadata,
      sessionId: 'child-session',
      displayName: 'first prompt',
      provider: 'default',
      model: 'model',
      supportsImages: true,
      parentSessionId: firstSession.id,
      forkReason: 'edit-last-prompt'
    }
    const bridge = api({ sessions: [firstSession], warnings: [] }, capabilities)
    vi.mocked(bridge.openSession).mockResolvedValue({ ok: true, value: sourceOpened })
    vi.mocked(bridge.forkSession).mockResolvedValue({ ok: true, value: childOpened })
    vi.mocked(bridge.addAttachment).mockImplementation(async (input) => ({ ok: true, value: { attachmentId: input.attachmentId, marker: '#[image 1]', mediaType: 'image/png' } }))
    vi.mocked(bridge.sendTurn).mockResolvedValue({ ok: true, value: { accepted: true } })
    window.bingoGui = bridge
    renderApp()

    fireEvent.click(await screen.findByText('First session'))
    await screen.findByText('last prompt')
    expect(await screen.findAllByRole('button', { name: '编辑' }, { timeout: 3_000 })).toHaveLength(1)

    const lastPromptBubble = screen.getByText('last prompt').closest('.ant-bubble')
    expect(lastPromptBubble).toBeTruthy()
    fireEvent.click(within(lastPromptBubble as HTMLElement).getByRole('button', { name: '复制' }))
    await waitFor(() => expect(bridge.writeClipboardText).toHaveBeenCalledWith({ text: 'last prompt' }))

    fireEvent.click(await screen.findByRole('button', { name: '编辑' }, { timeout: 3_000 }))
    const composer = await screen.findByPlaceholderText('修改提示词后发送，将创建新分支')
    expect((composer as HTMLTextAreaElement).value).toBe('last prompt')
    fireEvent.change(composer, { target: { value: 'edited prompt' } })
    vi.mocked(bridge.listSessions).mockResolvedValue({ ok: true, value: { sessions: [{
      id: 'child-session', name: 'first prompt', preview: '', updatedAt: '2026-08-14T00:00:00.000Z', messageCount: 2,
      workspacePath: '/workspace', parentSessionId: firstSession.id, forkReason: 'edit-last-prompt'
    }, firstSession], warnings: [] } })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))

    await waitFor(() => expect(bridge.forkSession).toHaveBeenCalledWith({
      sourceSessionId: firstSession.id,
      reason: 'edit-last-prompt',
      sourceTurnId: lastTurnId,
      sourceRevision: 'b'.repeat(64)
    }))
    await waitFor(() => expect(bridge.addAttachment).toHaveBeenCalledWith(expect.objectContaining({ connectionId: childOpened.connectionId, data: 'aA==' })))
    await waitFor(() => expect(bridge.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: childOpened.connectionId,
      prompt: 'edited prompt\n\n#[image 1]'
    })))
    expect(await screen.findByText('分支')).toBeTruthy()
    expect(screen.queryByText('正在编辑并创建分支')).toBeNull()
  })

  it('protects the existing composer draft and restores it when prompt editing is cancelled', async () => {
    const capabilities = ['settings.inspect.v1', 'team.workspace.v1', 'session.fork.v1']
    const history: SessionOpened['history'] = [{
      type: 'message',
      value: {
        id: 'source:2', role: 'user', markdown: 'historical prompt', turnId: '123e4567-e89b-42d3-a456-426614174020',
        origin: 'prompt', editable: true, revision: 'c'.repeat(64), turnStatus: 'completed'
      }
    }]
    const bridge = api({ sessions: [firstSession], warnings: [] }, capabilities)
    vi.mocked(bridge.openSession).mockResolvedValue({ ok: true, value: opened(firstSession.id, history, capabilities) })
    window.bingoGui = bridge
    renderApp()

    fireEvent.click(await screen.findByText('First session'))
    const composer = await screen.findByPlaceholderText('给 Bingo 发送消息')
    fireEvent.change(composer, { target: { value: 'unsent draft' } })
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }, { timeout: 3_000 }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '开始编辑' }))

    const editingComposer = await screen.findByPlaceholderText('修改提示词后发送，将创建新分支')
    expect((editingComposer as HTMLTextAreaElement).value).toBe('historical prompt')
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }))

    expect((await screen.findByPlaceholderText('给 Bingo 发送消息') as HTMLTextAreaElement).value).toBe('unsent draft')
    expect(bridge.forkSession).not.toHaveBeenCalled()
  })

  it('continues a cancelled turn in place without replacing the current draft', async () => {
    const capabilities = ['settings.inspect.v1', 'team.workspace.v1', 'session.fork.v1']
    const bridge = api({ sessions: [], warnings: [] }, capabilities)
    vi.mocked(bridge.sendTurn).mockResolvedValue({ ok: true, value: { accepted: true } })
    window.bingoGui = bridge
    renderApp()

    const composer = await screen.findByPlaceholderText('给 Bingo 发送消息')
    fireEvent.change(composer, { target: { value: 'run a long task' } })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))
    await waitFor(() => expect(bridge.sendTurn).toHaveBeenCalledOnce())
    const firstInput = vi.mocked(bridge.sendTurn).mock.calls[0][0]
    act(() => bridge.emitSessionEvent({
      connectionId: firstInput.connectionId,
      sequence: 1,
      payload: { protocolVersion: 1, seq: 2, sessionId: 'new-session', type: 'turn.started', commandId: crypto.randomUUID(), turnId: firstInput.turnId, promptRevision: 'd'.repeat(64) }
    }))
    act(() => bridge.emitSessionEvent({
      connectionId: firstInput.connectionId,
      sequence: 2,
      payload: { protocolVersion: 1, seq: 3, sessionId: 'new-session', type: 'turn.cancelled', turnId: firstInput.turnId, reason: 'requested' }
    }))

    const nextDraft = await screen.findByPlaceholderText('给 Bingo 发送消息')
    fireEvent.change(nextDraft, { target: { value: 'keep this draft' } })
    fireEvent.click(await screen.findByRole('button', { name: '继续任务' }, { timeout: 3_000 }))

    await waitFor(() => expect(bridge.sendTurn).toHaveBeenCalledTimes(2))
    expect(vi.mocked(bridge.sendTurn).mock.calls[1][0]).toMatchObject({
      connectionId: firstInput.connectionId,
      prompt: '继续未完成的任务。先检查当前工作区和已完成的工具结果，只执行剩余步骤，不要重复已经完成或可能产生副作用的操作。'
    })
    expect((screen.getByPlaceholderText('给 Bingo 发送消息') as HTMLTextAreaElement).value).toBe('keep this draft')
  })

  it('recovers a crashed turn through a repair fork and blocks duplicate clicks', async () => {
    const capabilities = ['settings.inspect.v1', 'team.workspace.v1', 'session.fork.v1']
    const bridge = api({ sessions: [], warnings: [] }, capabilities)
    vi.mocked(bridge.sendTurn).mockResolvedValue({ ok: true, value: { accepted: true } })
    window.bingoGui = bridge
    renderApp()

    const composer = await screen.findByPlaceholderText('给 Bingo 发送消息')
    fireEvent.change(composer, { target: { value: 'run before crash' } })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))
    await waitFor(() => expect(bridge.sendTurn).toHaveBeenCalledOnce())
    const firstInput = vi.mocked(bridge.sendTurn).mock.calls[0][0]
    act(() => bridge.emitSessionEvent({
      connectionId: firstInput.connectionId,
      sequence: 1,
      payload: { protocolVersion: 1, seq: 2, sessionId: 'new-session', type: 'turn.started', commandId: crypto.randomUUID(), turnId: firstInput.turnId, promptRevision: 'e'.repeat(64) }
    }))
    act(() => bridge.emitSessionEvent({
      connectionId: firstInput.connectionId,
      sequence: 2,
      payload: { type: 'transport.error', error: { code: 'CHILD_EXITED', msg: 'runtime exited', level: 'flow', recoverable: true }, exitCode: 1, signal: null }
    }))

    const childOpened = opened('recovered-child', [{
      type: 'message',
      value: { id: 'recovered-child:2', role: 'user', markdown: 'run before crash', turnId: firstInput.turnId, origin: 'prompt', turnStatus: 'error', revision: 'e'.repeat(64), editable: true }
    }], capabilities)
    childOpened.metadata = { ...childOpened.metadata, sessionId: 'recovered-child', parentSessionId: 'new-session', forkReason: 'recover-interrupted' }
    let resolveFork!: (value: Awaited<ReturnType<BingoGuiApi['forkSession']>>) => void
    vi.mocked(bridge.forkSession).mockReturnValue(new Promise((resolve) => { resolveFork = resolve }))

    const recover = await screen.findByRole('button', { name: '恢复并继续' }, { timeout: 3_000 })
    fireEvent.click(recover)
    fireEvent.click(recover)
    expect(bridge.forkSession).toHaveBeenCalledOnce()
    resolveFork({ ok: true, value: childOpened })

    await waitFor(() => expect(bridge.sendTurn).toHaveBeenCalledTimes(2))
    expect(bridge.forkSession).toHaveBeenCalledWith({ sourceSessionId: 'new-session', reason: 'recover-interrupted' })
    expect(vi.mocked(bridge.sendTurn).mock.calls[1][0]).toMatchObject({
      connectionId: childOpened.connectionId,
      prompt: '上一个回合因运行时异常中断。继续未完成的任务。先检查当前工作区和已完成的工具结果，只执行剩余步骤，不要重复已经完成或可能产生副作用的操作。'
    })
  })

  it('exposes permission approval modes below the composer and persists a selection', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    vi.mocked(bridge.saveRuntimeSettings).mockResolvedValue({ ok: true, value: {
      settings: { providers, provider: editable.provider, model: editable.model, thinkingLevel: editable.thinkingLevel, permissionMode: 'acceptEdits', theme: editable.theme }
    } })
    window.bingoGui = bridge
    renderApp()

    fireEvent.click(await screen.findByRole('button', { name: '权限审批：请求批准' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /帮我批准/ }))

    await waitFor(() => expect(bridge.saveRuntimeSettings).toHaveBeenCalledWith({
      workspacePath: '/workspace', provider: editable.provider, model: editable.model, thinkingLevel: editable.thinkingLevel, permissionMode: 'acceptEdits'
    }))
    expect(await screen.findByRole('button', { name: '权限审批：帮我批准' })).toBeTruthy()
  })

  it('opens the current workspace in an external terminal', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    window.bingoGui = bridge
    renderApp()

    fireEvent.click(await screen.findByRole('button', { name: '在外部终端中打开' }))

    await waitFor(() => expect(bridge.openExternalTerminal).toHaveBeenCalledOnce())
  })

  it('opens the game center from the rail and launches Bingo in its isolated window', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    window.bingoGui = bridge
    renderApp()

    fireEvent.click(await screen.findByRole('button', { name: '打开小游戏中心' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('抽号、标记并完成五格连线')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '启动 Bingo' }))
    await waitFor(() => expect(bridge.launchGamePack).toHaveBeenCalledWith({ id: 'io.github.tmeow.bingogo.bingo' }))
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

  it('guards settings navigation while the current section has unsaved changes', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    window.bingoGui = bridge
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    await screen.findByRole('heading', { name: '常规与运行' })
    fireEvent.click(screen.getAllByRole('switch')[0])
    fireEvent.click(screen.getByText('API 供应商'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/尚未保存/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: '常规与运行' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '放弃更改' }))
    expect(await screen.findByRole('heading', { name: 'API 供应商' })).toBeTruthy()
  })

  it('loads and saves the independent notification preferences', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    window.bingoGui = bridge
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    fireEvent.click(await screen.findByText('通知'))

    expect(await screen.findByRole('heading', { name: '通知' })).toBeTruthy()
    const sound = screen.getByRole('switch', { name: '通知声音' })
    expect(sound.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sound)
    fireEvent.click(screen.getByRole('button', { name: '保存通知设置' }))

    await waitFor(() => expect(bridge.saveNotificationPreferences).toHaveBeenCalledWith({
      baseRevision: 'd'.repeat(64),
      values: { schemaVersion: 1, enabled: true, turnCompleted: true, actionRequired: true, failures: true, sound: false }
    }))
  })

  it('shows when native notifications are unsupported while keeping settings editable', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    vi.mocked(bridge.readNotificationPreferences).mockResolvedValue({ ok: true, value: {
      path: '/notifications.json', revision: 'd'.repeat(64), supported: false,
      values: { schemaVersion: 1, enabled: true, turnCompleted: true, actionRequired: true, failures: true, sound: true }
    } })
    window.bingoGui = bridge
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    fireEvent.click(await screen.findByText('通知'))

    expect(await screen.findByText('当前系统不支持通知')).toBeTruthy()
    expect(screen.getByRole('switch', { name: '系统通知' }).hasAttribute('disabled')).toBe(false)
  })

  it('shows a notification preference read error without attempting to overwrite it', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    vi.mocked(bridge.readNotificationPreferences).mockResolvedValue({ ok: false, error: {
      code: 'CONFIG_INVALID', msg: 'Cannot read /notifications.json: invalid JSON', level: 'flow', recoverable: true
    } })
    window.bingoGui = bridge
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    fireEvent.click(await screen.findByText('通知'))

    expect(await screen.findByText('CONFIG_INVALID')).toBeTruthy()
    expect(screen.getByText(/Cannot read \/notifications\.json/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '保存通知设置' })).toBeNull()
    expect(bridge.saveNotificationPreferences).not.toHaveBeenCalled()
  })

  it('discards notification preference changes through the shared settings guard', async () => {
    const bridge = api({ sessions: [], warnings: [] })
    window.bingoGui = bridge
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    fireEvent.click(await screen.findByText('通知'))
    const sound = await screen.findByRole('switch', { name: '通知声音' })
    fireEvent.click(sound)
    expect(sound.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(screen.getByText('关于'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/尚未保存/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '放弃更改' }))

    expect(await screen.findByRole('heading', { name: '关于' })).toBeTruthy()
    expect(bridge.saveNotificationPreferences).not.toHaveBeenCalled()
  })

  it('returns to the current chat on notification activation and ignores stale connections', async () => {
    const bridge = api({ sessions: [firstSession], warnings: [] })
    window.bingoGui = bridge
    renderApp()
    fireEvent.click(await screen.findByText('First session'))
    const openedConnectionId = (await vi.mocked(bridge.openSession).mock.results[0].value).value.connectionId
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(await screen.findByRole('heading', { name: '常规与运行' })).toBeTruthy()

    act(() => bridge.emitNotificationActivation({ connectionId: crypto.randomUUID(), kind: 'failure' }))
    expect(screen.getByRole('heading', { name: '常规与运行' })).toBeTruthy()

    act(() => bridge.emitNotificationActivation({ connectionId: openedConnectionId, kind: 'turn-completed' }))
    expect(await screen.findByRole('heading', { name: 'First session' })).toBeTruthy()
  })

  it('uses the existing unsaved-settings confirmation for notification activation', async () => {
    const bridge = api({ sessions: [firstSession], warnings: [] })
    window.bingoGui = bridge
    renderApp()
    fireEvent.click(await screen.findByText('First session'))
    const openedConnectionId = (await vi.mocked(bridge.openSession).mock.results[0].value).value.connectionId
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    await screen.findByRole('heading', { name: '常规与运行' })
    fireEvent.click(screen.getAllByRole('switch')[0])

    act(() => bridge.emitNotificationActivation({ connectionId: openedConnectionId, kind: 'action-required' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/尚未保存/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: '常规与运行' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '放弃更改' }))
    expect(await screen.findByRole('heading', { name: 'First session' })).toBeTruthy()
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

  it('blocks fixed-team creation on an incomplete capability set and enables the v2 starter flow after upgrade', async () => {
    const emptySnapshot: TeamSnapshot = {
      ...teamSnapshot,
      available: false,
      definition: null,
      agentDefinitions: [],
      avatars: [],
      members: [],
      channels: []
    }
    const incomplete = api({ sessions: [], warnings: [] }, ['team.workspace.v1', 'team.tasks.v1'])
    vi.mocked(incomplete.readTeam).mockResolvedValue({ ok: true, value: emptySnapshot })
    window.bingoGui = incomplete
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Team' }))

    expect(await screen.findByText('当前 Bingo 不支持固定团队 v2')).toBeTruthy()
    expect((screen.getByRole('button', { name: '编辑蓝图' }) as HTMLButtonElement).disabled).toBe(true)
    expect(incomplete.saveTeam).not.toHaveBeenCalled()
    cleanup()

    const upgraded = api({ sessions: [], warnings: [] }, [...TEAM_V2_CAPABILITIES])
    vi.mocked(upgraded.readTeam).mockResolvedValue({ ok: true, value: emptySnapshot })
    vi.mocked(upgraded.saveAgentDefinition).mockImplementation(async ({ scope, id, definition }) => ({
      ok: true,
      value: { ...definition, id, source: scope, revision: 'c'.repeat(64), path: `/workspace/.bingo/agents/${id}.md`, overridden: false }
    }))
    vi.mocked(upgraded.saveTeam).mockImplementation(async ({ definition }) => ({
      ok: true,
      value: { ...emptySnapshot, available: true, definition, revision: 'd'.repeat(64) }
    }))
    window.bingoGui = upgraded
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Team' }))
    await waitFor(() => expect(upgraded.readTeam).toHaveBeenCalled())
    const lobby = await screen.findByRole('radio', { name: '大厅' })
    await waitFor(() => expect((lobby as HTMLInputElement).disabled).toBe(false))
    fireEvent.click(lobby)
    expect(await screen.findByText('尚未配置固定团队')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /创建开发三人组/ }))

    await waitFor(() => expect(upgraded.saveTeam).toHaveBeenCalledOnce())
    expect(upgraded.saveAgentDefinition).toHaveBeenCalledTimes(3)
    expect(vi.mocked(upgraded.saveTeam).mock.calls[0][0].definition).toMatchObject({ schemaVersion: 2, members: expect.arrayContaining([expect.objectContaining({ memberId: expect.any(String) })]) })
  })

  it('renders an awaiting-review team task as a group chat with explicit acceptance actions', async () => {
    const capabilities = ['settings.inspect.v1', ...TEAM_V2_CAPABILITIES]
    const bridge = api({ sessions: [], warnings: [] }, capabilities)
    vi.mocked(bridge.listTeamTasks).mockResolvedValue({ ok: true, value: { branch: 'main', tasks: [teamTaskSummary] } })
    vi.mocked(bridge.getTeamTask).mockResolvedValue({ ok: true, value: teamTask })
    window.bingoGui = bridge
    renderApp()

    fireEvent.click(await screen.findByRole('button', { name: 'Team' }))
    fireEvent.click(await screen.findByRole('radio', { name: '任务' }))

    await waitFor(() => expect(bridge.getTeamTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1', limit: 100 })))
    expect((await screen.findAllByText('All release checks passed.')).length).toBeGreaterThanOrEqual(2)
    expect(document.querySelector('.team-user-bubble')).toBeTruthy()
    expect(document.querySelector('.team-member-bubble')).toBeTruthy()
    expect(document.querySelector('.team-system-bubble')).toBeTruthy()
    expect(screen.getByRole('button', { name: /完成任务/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /继续任务/ })).toBeTruthy()
    const composer = screen.getByPlaceholderText('任务待验收，请使用上方意见框继续任务') as HTMLTextAreaElement
    expect(composer.disabled).toBe(true)
  })
})
