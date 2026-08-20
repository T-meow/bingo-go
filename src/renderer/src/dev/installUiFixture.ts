import type {
  ActionInfo,
  CatalogKind,
  CatalogReadResult,
  ConversationSnapshot,
  ConversationSummary,
  Interaction,
  ResourceKind,
  ResourceReadResult,
  SessionSnapshot
} from '../../../shared/contracts/appServer'
import type { BingoAppApi } from '../../../shared/contracts/appServerIpc'
import type {
  AppearanceSnapshot,
  BingoGuiApi,
  GamePackSnapshot,
  NotificationPreferencesSnapshot,
  SettingsSnapshot,
  UserProfileSnapshot
} from '../../../shared/contracts/ipc'

const FIXTURE_WORKSPACE = 'D:\\Projects\\bingo-go\\examples\\very-long-workspace-name\\frontend-redesign'
const REVISION = 'a'.repeat(64)
const NOW = Date.UTC(2026, 7, 20, 9, 30)

const conversations = {
  main: conversation('conv_main', { type: 'main' }, 'Bingo Go 主应用全页面重设计', 'running', {
    activeTurnId: 'turn_main', pendingInteractions: 1, queueCount: 2
  }),
  agent: conversation('conv_agent_frontend', { type: 'agent', agentId: 'agent_frontend' }, 'Frontend · 页面实现', 'idle', {
    unread: 2
  }),
  room: conversation('conv_room_design', { type: 'room', roomId: 'room_design' }, '#design-review', 'passive', {
    mentions: 1, unread: 3
  })
} satisfies Record<string, ConversationSummary>

const sessionSnapshot = {
  session: {
    id: 'sess_fixture', epoch: 'epoch_fixture', locator: { type: 'stem', stem: 'ui-fixture' }, cwd: FIXTURE_WORKSPACE,
    provider: 'openai', model: 'gpt-5.2-codex', thinking: 'high', permissionMode: 'default', title: 'Frontend redesign',
    state: 'active', resumed: false, createdAt: NOW - 5_400_000, updatedAt: NOW
  },
  capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true },
  config: {
    cwd: FIXTURE_WORKSPACE, provider: 'openai', model: 'gpt-5.2-codex', thinking: 'high', permissionMode: 'default', theme: 'auto',
    shell: 'powershell', shellDialect: 'powershell', permissions: [{ decision: 'ask', rule: 'npm publish', sessionScoped: false }],
    mcpServers: [
      { name: 'filesystem', enabled: true, status: 'connected', tools: 12 },
      { name: 'design-assets-with-an-intentionally-long-server-name', enabled: true, status: 'error', tools: 0, error: '连接超时' }
    ],
    layers: [{ path: 'C:\\Users\\Ferris\\.config\\bingo\\settings.json', keys: ['provider', 'model'] }], revision: 7
  },
  conversations: { active: Object.values(conversations), count: 3, revision: 7 },
  collections: {
    agents: {
      active: [
        {
          id: 'agent_frontend', kind: 'crew', name: 'frontend', description: '实现会话与响应式 Shell，处理长内容和紧凑模式。',
          prompt: '重构主界面', state: 'running', provider: 'openai', model: 'gpt-5.2-codex', thinking: 'high',
          cwd: `${FIXTURE_WORKSPACE}\\src\\renderer\\src\\features\\conversations`, conversationId: 'conv_agent_frontend',
          elapsedMs: 2_240_000, outputTokens: 18_420, toolUses: 41, pending: 2, unacked: 1, lastActiveAt: NOW - 8_000,
          recentActivity: ['完成 Composer 运行配置', '正在检查 800px 布局', '补充权限状态']
        },
        {
          id: 'agent_review', kind: 'hire', name: 'review', description: '复查可访问性和危险操作反馈。', prompt: 'Review UI', state: 'idle',
          provider: 'openai', model: 'gpt-5.2-codex', thinking: 'medium', cwd: FIXTURE_WORKSPACE, elapsedMs: 820_000,
          outputTokens: 6_120, toolUses: 18, pending: 0, unacked: 0, lastActiveAt: NOW - 95_000, recentActivity: ['检查焦点样式']
        },
        {
          id: 'agent_docs', kind: 'crew', name: 'docs', description: '整理前端设计文档。', prompt: 'Write docs', state: 'stopped',
          provider: 'openai', model: 'gpt-5.2-codex', thinking: 'low', cwd: FIXTURE_WORKSPACE, outputTokens: 3_200, toolUses: 8,
          pending: 0, unacked: 0, lastActiveAt: NOW - 850_000, recentActivity: ['设计计划已写入 docs']
        }
      ],
      count: 3,
      revision: 4
    },
    rooms: {
      active: [
        { id: 'room_design', name: 'design-review', mode: 'broadcast', topic: '交互、层级与视觉验收', members: ['main', 'frontend', 'review'], userIsMember: true, messageCount: 28, unread: 3, mentions: 1, lastSeq: 28, conversationId: 'conv_room_design' },
        { id: 'room_release', name: 'release', mode: 'relay', topic: '构建与打包结果', members: ['main', 'docs'], userIsMember: false, messageCount: 9, unread: 0, mentions: 0, lastSeq: 9 }
      ],
      count: 2,
      revision: 3
    },
    tasks: {
      active: [
        { id: 'task_shell', subject: '重构应用 Shell', description: '窄导航栏、响应式 Drawer 与检查器。', status: 'completed', owner: 'frontend', blockedBy: [], blocks: ['task_qa'] },
        { id: 'task_settings', subject: '统一设置页面', description: '七个分区和未保存状态保护。', status: 'inProgress', activeForm: '正在整理 Provider 和 MCP Drawer', owner: 'frontend', blockedBy: [], blocks: ['task_qa'] },
        { id: 'task_qa', subject: '多视口视觉验收', description: '覆盖明暗主题和 800px 窗口。', status: 'pending', blockedBy: ['task_settings'], blocks: [] },
        { id: 'task_copy', subject: '系统文案校对', description: '统一错误、空状态与权限文案。', status: 'cancelled', owner: 'docs', blockedBy: [], blocks: [] }
      ],
      count: 4,
      revision: 5
    },
    deliveries: {
      active: [
        { id: 'delivery_1', from: 'frontend', to: 'main', state: 'answered', private: false, followUps: 1, maxFollowUps: 3, updatedAt: NOW - 120_000, messageItemId: 'agent_2' },
        { id: 'delivery_2', from: 'review', to: 'frontend', state: 'read', private: true, followUps: 0, maxFollowUps: 2, updatedAt: NOW - 320_000, reason: '焦点样式需要复查' },
        { id: 'delivery_3', from: 'main', to: 'docs', state: 'queued', private: false, followUps: 0, maxFollowUps: 2, updatedAt: NOW - 35_000 }
      ],
      count: 3,
      revision: 6
    },
    backgroundCommands: {
      active: [{ id: 'cmd_typecheck', label: 'TypeScript', command: 'npm run typecheck', state: 'running', durationMs: 28_400, startedAt: NOW - 28_400, conversationId: 'conv_main', itemId: 'main_5' }],
      count: 1,
      revision: 2
    },
    mcpServers: [
      { name: 'filesystem', enabled: true, status: 'connected', tools: 12 },
      { name: 'design-assets-with-an-intentionally-long-server-name', enabled: true, status: 'error', tools: 0, error: '连接超时' }
    ]
  },
  activeTurns: [{
    id: 'turn_main', conversationId: 'conv_main', origin: 'user', status: 'running', round: 2, startedAt: NOW - 124_000,
    inputItemIds: ['main_1'], usage: { authoritative: true, inputTokens: 48_210, outputTokens: 7_360, cacheReadTokens: 32_000, cacheWriteTokens: 1_240 }
  }],
  interactions: [permissionInteraction()],
  operations: [{ id: 'operation_fixture', kind: 'compact', status: 'completed', startedAt: NOW - 600_000, completedAt: NOW - 590_000, conversationId: 'conv_main' }],
  feedback: [{ id: 'feedback_fixture', code: 'MCP_TIMEOUT', level: 'warning', message: 'design-assets 连接超时，其他工具仍可正常使用。', raisedAt: NOW - 90_000, conversationId: 'conv_main' }],
  eventCursor: 18
} satisfies SessionSnapshot

const transcriptById: Record<string, ConversationSnapshot> = {
  conv_main: {
    conversation: conversations.main,
    activeTurn: sessionSnapshot.activeTurns[0],
    contextUsage: { used: 62_480, window: 128_000, trigger: 110_000 },
    interactions: [permissionInteraction()],
    items: { revision: 9, items: [
      item({ id: 'main_1', type: 'userMessage', text: '请重构全部主应用页面，保持现有能力并覆盖窄窗口。', attachments: [] }),
      item({ id: 'main_2', type: 'assistantMessage', text: '已完成主结构重组。当前正在核对 **会话、团队、设置和浮层** 的一致性，并保留现有 app-server 行为。\n\n长路径会以省略号显示，但复制与完整标题仍然可用。' }),
      item({ id: 'main_3', type: 'reasoning', text: '需要确保运行配置只在主会话出现，协作会话只发送自然语言。' }),
      item({ id: 'main_4', type: 'toolCall', name: 'apply_patch', summary: '更新会话与设置样式', input: { path: `${FIXTURE_WORKSPACE}\\src\\renderer\\src\\styles\\conversations.css` }, output: 'Updated 6 files successfully.', diff: '+ professional workbench styles', durationMs: 1480, toolCallId: 'tool_1' }),
      item({ id: 'main_5', type: 'command', command: 'npm.cmd run typecheck', dialect: 'powershell', background: true, output: 'tsc --noEmit -p tsconfig.web.json', tail: { lines: ['> bingo-go@0.1.0 typecheck', '> tsc --noEmit -p tsconfig.web.json', 'Checking renderer types...'], totalLines: 3 }, durationMs: 28_400, commandId: 'cmd_typecheck', status: 'streaming' }),
      item({ id: 'main_6', type: 'notice', code: 'MCP_TIMEOUT', level: 'warning', text: 'design-assets 连接超时；当前页面仍可继续操作。' })
    ], nextCursor: null },
    queue: { revision: 3, items: [
      { id: 'queue_1', originConversationId: 'conv_main', queuedAt: NOW - 45_000, steerEligible: true, text: '完成后检查 800×600 下侧栏 Drawer 和长文本是否溢出。', attachments: [] },
      { id: 'queue_2', originConversationId: 'conv_main', queuedAt: NOW - 15_000, steerEligible: false, text: '再检查暗色主题中的表格边界和错误态对比度。', attachments: [] }
    ], nextCursor: null },
    eventCursor: 18,
    historyGeneration: 1
  },
  conv_agent_frontend: {
    conversation: conversations.agent, activeTurn: null, contextUsage: { used: 20_200, window: 128_000, trigger: 110_000 }, interactions: [],
    items: { revision: 3, items: [
      item({ id: 'agent_1', type: 'peerMessage', from: 'main', to: 'frontend', text: '请集中处理响应式 Shell 和 Composer。' }),
      item({ id: 'agent_2', type: 'peerMessage', from: 'frontend', to: 'main', text: '已完成实现，等待视觉检查。' })
    ], nextCursor: null },
    queue: { revision: 1, items: [], nextCursor: null }, eventCursor: 9, historyGeneration: 1
  },
  conv_room_design: {
    conversation: conversations.room, activeTurn: null, contextUsage: null, interactions: [],
    items: { revision: 4, items: [
      item({ id: 'room_1', type: 'roomMessage', from: 'review', roomId: 'room_design', roomSeq: 27, mentions: ['main'], text: '@main 设置页在 800px 下应保持菜单可扫描。' }),
      item({ id: 'room_2', type: 'roomMessage', from: 'frontend', roomId: 'room_design', roomSeq: 28, mentions: [], text: '已将内容区改为自适应布局。' })
    ], nextCursor: null },
    queue: { revision: 1, items: [], nextCursor: null }, eventCursor: 11, historyGeneration: 1
  }
}

let appearance: AppearanceSnapshot = {
  path: 'fixture://appearance.json', revision: REVISION,
  values: { schemaVersion: 1, colorMode: 'light', accentColor: '#1F8A7A', density: 'comfortable', motion: 'system', inspectorCollapsed: false }
}
let profile: UserProfileSnapshot = { path: 'fixture://profile.json', revision: REVISION, values: { schemaVersion: 1, avatar: 'identicon-01' } }
let notifications: NotificationPreferencesSnapshot = {
  path: 'fixture://notifications.json', revision: REVISION, supported: true,
  values: { schemaVersion: 1, enabled: true, turnCompleted: true, actionRequired: true, failures: true, sound: false }
}
let settings = settingsFixture()
let games = gamePackFixture()

export function installUiFixture(): void {
  window.bingoApp = createAppApi()
  window.bingoGui = createGuiApi()
  document.documentElement.dataset.uiFixture = 'true'
}

function createAppApi(): BingoAppApi {
  return {
    probe: async (workspacePath) => ok({ binaryPath: 'fixture://bingo', bingoVersion: '0.6.0-fixture', workspacePath }),
    connect: async () => ok(sessionSnapshot),
    resume: async () => ok(sessionSnapshot),
    disconnect: async () => ok(undefined),
    listSessions: async () => ok({ sessions: { items: [
      { cwd: FIXTURE_WORKSPACE, locator: { type: 'stem', stem: 'ui-fixture' }, messageCount: 42, open: true, title: 'Frontend redesign', updatedAt: NOW },
      { cwd: 'D:\\Projects\\sample', locator: { type: 'stem', stem: 'previous-session' }, messageCount: 18, open: false, title: 'Previous session', updatedAt: NOW - 86_400_000 }
    ], nextCursor: null, revision: 2 } }),
    readConversation: async ({ conversationId }) => {
      const snapshot = transcriptById[conversationId]
      return snapshot ? ok({ snapshot }) : fail('NOT_FOUND', '找不到 fixture 会话。')
    },
    markRead: async () => ok({}),
    composerSubmit: async () => ok({ disposition: { type: 'queued', queueId: 'queue_fixture', position: 3, steerEligible: true } }),
    sendProse: async () => ok({ disposition: { type: 'delivered', messageId: 'message_fixture' } }),
    interrupt: async ({ turnId }) => ok({ accepted: true, turnId }),
    respond: async () => ok({ status: 'accepted' }),
    readConfig: async () => ok({ config: sessionSnapshot.config }),
    readCatalog: async (kind, provider) => ok(catalogFixture(kind, provider)),
    listActions: async () => ok({ actions: actionFixture(), revision: 3 }),
    executeAction: async () => ok({ disposition: { type: 'applied', result: { status: 'applied', message: 'Fixture action applied.' } } }),
    readResource: async (kind) => ok(resourceFixture(kind)),
    registerAsset: async () => ok({ id: 'asset_fixture', kind: 'image', mime: 'image/png', bytes: 1024, origin: 'session', sha256: REVISION, createdAt: NOW, width: 320, height: 180 }),
    readAssetDataUrl: async () => ok('data:image/png;base64,'),
    queueRead: async ({ conversationId }) => {
      const queue = transcriptById[conversationId]?.queue ?? { revision: 1, items: [], nextCursor: null }
      return ok({ count: queue.items.length, entries: queue })
    },
    queueReclaimTail: async () => ok({ outcome: { type: 'empty' } }),
    sessionDelete: async ({ locator }) => ok({ deleted: true, locator }),
    restartAfterDefinitionWrite: async () => ok(sessionSnapshot),
    onEvent: () => () => undefined
  }
}

function createGuiApi(): BingoGuiApi {
  return {
    getAppInfo: async () => ok({ appVersion: '0.1.0-fixture', platform: 'win32', arch: 'x64', packaged: false }),
    getWorkspaces: async () => ok({ schemaVersion: 2, currentPath: FIXTURE_WORKSPACE, recentPaths: [FIXTURE_WORKSPACE, 'D:\\Projects\\sample'] }),
    selectWorkspace: async ({ path } = {}) => ok({
      canceled: false, changed: Boolean(path && path !== FIXTURE_WORKSPACE),
      runtime: { binaryPath: 'fixture://bingo', bingoVersion: '0.6.0-fixture', workspacePath: path ?? FIXTURE_WORKSPACE, appServer: { protocol: { major: 1, minor: 0 }, capabilities: sessionSnapshot.capabilities, limits: { maxClientFrameBytes: 10_000_000, maxServerFrameBytes: 10_000_000 } } },
      preferences: { schemaVersion: 2, currentPath: path ?? FIXTURE_WORKSPACE, recentPaths: [path ?? FIXTURE_WORKSPACE] }
    }),
    openExternalTerminal: async () => ok({ terminalName: 'PowerShell', workspacePath: FIXTURE_WORKSPACE }),
    writeClipboardText: async () => ok({ written: true as const }),
    readSettings: async () => ok(settings),
    listModels: async ({ provider }) => ok({ provider, models: ['gpt-5.2-codex', 'gpt-5.1-codex-mini', 'deepseek-v4-flash'], source: 'remote' }),
    upsertProvider: async () => ok(settings),
    removeProvider: async () => ok(settings),
    upsertMcpServer: async () => ok(settings),
    removeMcpServer: async () => ok(settings),
    readAppearance: async () => ok(appearance),
    saveAppearance: async ({ values }) => { appearance = { ...appearance, values }; return ok(appearance) },
    readProfile: async () => ok(profile),
    saveProfile: async ({ avatar }) => {
      profile = { ...profile, values: { schemaVersion: 1, avatar: avatar.kind === 'upload' ? 'user:fixture' : avatar.id } }
      return ok(profile)
    },
    readNotificationPreferences: async () => ok(notifications),
    saveNotificationPreferences: async ({ values }) => { notifications = { ...notifications, values }; return ok(notifications) },
    listGamePacks: async () => ok(games),
    chooseGamePack: async () => ok({ canceled: true as const }),
    installGamePack: async () => ok(games),
    setGamePackEnabled: async ({ id, enabled }) => { games = { ...games, items: games.items.map((item) => item.manifest.id === id ? { ...item, enabled } : item) }; return ok(games) },
    launchGamePack: async () => ok({ launched: true as const }),
    clearGamePackData: async () => ok({ cleared: true as const }),
    uninstallGamePack: async ({ id }) => { games = { ...games, items: games.items.filter((item) => item.manifest.id !== id) }; return ok(games) },
    onNotificationActivated: () => () => undefined,
    onGamePackEvent: () => () => undefined
  }
}

function conversation(
  id: string,
  kind: ConversationSummary['kind'],
  title: string,
  runState: ConversationSummary['runState'],
  overrides: Partial<ConversationSummary> = {}
): ConversationSummary {
  return {
    id, kind, title, runState, historyGeneration: 1, isMember: true, unread: 0, mentions: 0, obligations: [], pendingInteractions: 0,
    queueCount: 0, queueRevision: 1, revision: 1, lastActivityAt: NOW, lastItemId: `${id}_last`, readCursor: null, activeTurnId: null,
    ...overrides
  }
}

function permissionInteraction(): Interaction {
  return {
    id: 'interaction_permission', conversationId: 'conv_main', turnId: 'turn_main', itemId: 'main_5', openedAt: NOW - 18_000, remainingGuardMs: 0,
    prompt: {
      type: 'permission' as const, title: '允许执行本地命令？', reason: '类型检查将读取项目文件并写入常规构建缓存。',
      tool: { name: 'shell', input: { command: 'npm.cmd run typecheck' } }, decisions: ['allowOnce', 'allowSession', 'deny'],
      allowsFeedback: true, sessionScope: { id: 'scope_fixture', label: '当前会话' }, preview: { type: 'command' as const, command: 'npm.cmd run typecheck -- --pretty false' }
    }
  }
}

function item<T extends Record<string, unknown>>(value: T): T & { status: 'completed'; startedAt: number; completedAt: number } {
  return { status: 'completed', startedAt: NOW - 60_000, completedAt: NOW - 59_000, ...value }
}

function catalogFixture(kind: CatalogKind, provider?: string): CatalogReadResult {
  if (kind === 'providers') return { catalog: { catalog: 'providers', revision: 2, items: [
    { name: 'openai', protocol: 'openai', apiBaseUrl: 'https://api.openai.com/v1', supportsImages: true, builtin: true, credential: { configured: true, source: 'settings', status: 'present' } },
    { name: 'opencode-go', protocol: 'openai', apiBaseUrl: 'https://opencode.ai/zen/go', supportsImages: false, builtin: true, credential: { configured: false, source: 'none', status: 'missing' } }
  ] } }
  if (kind === 'models') return { catalog: { catalog: 'models', revision: 2, items: [
    { id: 'gpt-5.2-codex', provider: provider ?? 'openai', displayName: 'GPT-5.2 Codex', family: 'gpt-5', contextWindow: 128_000, supportsImages: true, supportsThinking: true },
    { id: 'gpt-5.1-codex-mini', provider: provider ?? 'openai', displayName: 'GPT-5.1 Codex Mini', family: 'gpt-5', contextWindow: 128_000, supportsImages: true, supportsThinking: true }
  ] } }
  if (kind === 'mcpServers') return { catalog: { catalog: 'mcpServers', revision: 2, items: sessionSnapshot.config.mcpServers } }
  if (kind === 'skills') return { catalog: { catalog: 'skills', revision: 1, items: [{ name: 'browser', description: '本地视觉检查', source: 'plugin' }] } }
  return { catalog: { catalog: 'images', revision: 1, items: [] } }
}

function resourceFixture(kind: ResourceKind): ResourceReadResult {
  if (kind === 'agents') return { resource: { resource: 'agents', revision: 4, items: sessionSnapshot.collections.agents.active } }
  if (kind === 'rooms') return { resource: { resource: 'rooms', revision: 3, items: sessionSnapshot.collections.rooms.active } }
  if (kind === 'tasks') return { resource: { resource: 'tasks', revision: 5, items: sessionSnapshot.collections.tasks.active } }
  if (kind === 'deliveries') return { resource: { resource: 'deliveries', revision: 6, items: sessionSnapshot.collections.deliveries.active } }
  return { resource: { resource: 'backgroundCommands', revision: 2, items: sessionSnapshot.collections.backgroundCommands.active } }
}

function actionFixture(): ActionInfo[] {
  return [
    { id: 'conversation.compact', family: 'conversation', label: '压缩当前对话', description: '减少上下文占用', available: true, arguments: [{ name: 'instructions', kind: 'string', description: '压缩说明', required: false, choices: [] }] },
    { id: 'session.rename', family: 'session', label: '重命名会话', description: '设置会话标题', available: true, arguments: [{ name: 'name', kind: 'string', description: '新名称', required: true, choices: [] }] },
    { id: 'model.select', family: 'model', label: '切换模型', description: '更改主会话模型', available: true, arguments: [{ name: 'model', kind: 'enumeration', description: '模型', required: true, choices: ['gpt-5.2-codex', 'gpt-5.1-codex-mini'] }] },
    { id: 'team.start', family: 'team', label: '启动团队', description: '启动全部成员', available: true, arguments: [] },
    { id: 'team.stop', family: 'team', label: '停止团队', description: '停止运行中的成员', available: false, unavailableReason: '有未处理的权限请求', arguments: [] },
    { id: 'theme.set', family: 'settings', label: '设置终端主题', description: '切换 Bingo 终端主题', available: true, arguments: [{ name: 'theme', kind: 'enumeration', description: '主题', required: true, choices: ['auto', 'light', 'dark'] }] }
  ]
}

function settingsFixture(): SettingsSnapshot {
  const values = {
    apiBaseUrl: '', provider: 'openai', model: 'gpt-5.2-codex', thinkingLevel: 'high' as const, permissionMode: 'default' as const,
    theme: 'auto' as const, motion: 'auto' as const, sendImages: true, cacheControl: true, respondToBashCommands: true,
    shell: 'powershell', permissions: { allow: ['npm run typecheck'], ask: ['npm run build'], deny: ['rm -rf'] }, share: { baseUrl: '' }
  }
  return {
    path: 'C:\\Users\\Ferris\\.config\\bingo\\settings.json', revision: REVISION, values, effective: values,
    layers: {
      user: { path: 'C:\\Users\\Ferris\\.config\\bingo\\settings.json', exists: true, keys: ['provider', 'model'], values: {} },
      project: { path: `${FIXTURE_WORKSPACE}\\.bingo\\settings.json`, exists: true, keys: ['permissions'], values: {} },
      local: { path: `${FIXTURE_WORKSPACE}\\.bingo\\settings.local.json`, exists: false, keys: [], values: {} }
    },
    sources: { provider: 'user', model: 'user', permissions: 'project' }, shadowed: [],
    providers: [
      { name: 'openai', protocol: 'openai', apiBaseUrl: 'https://api.openai.com/v1', supportsImages: true, credentialConfigured: true, builtin: true, source: 'builtin', editable: false },
      { name: 'company-proxy-with-a-very-long-name', protocol: 'openai', apiBaseUrl: 'https://gateway.example.internal/openai/compatible/v1', supportsImages: true, credentialConfigured: true, builtin: false, source: 'user', editable: true }
    ],
    mcpServers: [
      { name: 'filesystem', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', FIXTURE_WORKSPACE], url: '', envKeys: [], headerKeys: [], disabled: false, source: 'user', editable: true },
      { name: 'design-assets-with-an-intentionally-long-server-name', type: 'http', command: '', args: [], url: 'https://mcp.example.internal/very/long/path/to/design/assets', envKeys: [], headerKeys: ['Authorization'], disabled: false, source: 'project', editable: true }
    ],
    hooks: [{ name: 'after-build', ruleCount: 2 }]
  }
}

function gamePackFixture(): GamePackSnapshot {
  const window = { width: 760, height: 620, minWidth: 480, minHeight: 420, resizable: true }
  return {
    revision: REVISION,
    warnings: [],
    items: [
      { manifest: { schemaVersion: 1, kind: 'game', id: 'go.bingo.bingo', name: 'Bingo', version: '1.0.0', entry: 'index.html', description: '经典数字宾果游戏', author: 'Bingo Go', window }, source: 'builtin', enabled: true, status: 'ready', sha256: 'b'.repeat(64) },
      { manifest: { schemaVersion: 1, kind: 'game', id: 'go.bingo.sudoku', name: '数独', version: '1.0.0', entry: 'index.html', description: '安静的逻辑数字挑战', author: 'Bingo Go', window }, source: 'builtin', enabled: true, status: 'ready', sha256: 'c'.repeat(64) },
      { manifest: { schemaVersion: 1, kind: 'game', id: 'go.bingo.snake', name: '贪吃蛇', version: '1.0.0', entry: 'index.html', description: '键盘操控的经典小游戏', author: 'Bingo Go', window }, source: 'builtin', enabled: false, status: 'ready', sha256: 'd'.repeat(64) },
      { manifest: { schemaVersion: 1, kind: 'game', id: 'com.example.external', name: '外部示例', version: '2.1.0', entry: 'game/index.html', description: '用于检查卸载和危险操作状态的示例包', author: 'Example Studio', window }, source: 'external', enabled: true, status: 'ready', sha256: 'e'.repeat(64), installedAt: '2026-08-18T08:00:00.000Z' }
    ]
  }
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

function fail(code: string, msg: string): { ok: false; error: { code: string; msg: string } } {
  return { ok: false, error: { code, msg } }
}
