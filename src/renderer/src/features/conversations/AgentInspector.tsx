import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  CrownOutlined,
  LoadingOutlined,
  NumberOutlined,
  RobotOutlined,
  StopOutlined,
  ToolOutlined
} from '@ant-design/icons'
import type {
  AgentResource,
  ConfigSnapshot,
  ContextUsage,
  ConversationSummary,
  Item,
  SessionSummary,
  TurnUsage
} from '../../../../shared/contracts/appServer'
import { ContextPanel } from './ContextPanel'

export function AgentInspector({
  conversation,
  agent,
  session,
  config,
  items,
  contextUsage,
  turnUsage,
  interactionCount,
  queueCount
}: {
  conversation: ConversationSummary | null
  agent: AgentResource | null
  session: SessionSummary | null
  config: ConfigSnapshot | null
  items: Item[]
  contextUsage: ContextUsage | null
  turnUsage: TurnUsage | null
  interactionCount: number
  queueCount: number
}): React.JSX.Element {
  if (!conversation) return <div className="agent-inspector-v2 agent-inspector-empty-v2">没有可检查的会话</div>

  const state = agent?.state ?? conversation.runState
  const activity = collectActivity(items, agent)
  const toolUses = agent?.toolUses ?? items.filter((item) => item.type === 'toolCall' || item.type === 'command').length
  const outputTokens = agent?.outputTokens ?? turnUsage?.outputTokens ?? 0
  const pending = agent ? agent.pending + agent.unacked : interactionCount + queueCount
  const provider = agent?.provider ?? config?.provider ?? session?.provider ?? '—'
  const model = agent?.model ?? config?.model ?? session?.model ?? '—'
  const thinking = agent?.thinking ?? config?.thinking ?? session?.thinking ?? '—'
  const cwd = agent?.cwd ?? config?.cwd ?? session?.cwd ?? '—'

  return (
    <aside className="agent-inspector-v2" data-testid="agent-inspector-v2">
      <header className="agent-inspector-identity-v2">
        <span className="agent-inspector-avatar-v2">
          {conversationIcon(conversation)}
          <i className={`is-${state}`} />
        </span>
        <span>
          <small>{kindLabel(conversation)}</small>
          <strong>{agent?.name ?? conversation.title}</strong>
          <span>{agent?.description || stateLabel(state)}</span>
        </span>
      </header>

      <div className="agent-metrics-v2">
        <div><strong>{formatNumber(toolUses)}</strong><span>工具调用</span></div>
        <div><strong>{formatNumber(outputTokens)}</strong><span>输出 Token</span></div>
        <div><strong>{formatNumber(pending)}</strong><span>待处理</span></div>
      </div>

      {agent?.prompt && <section className="agent-task-v2">
        <h2>当前任务</h2>
        <p>{agent.prompt}</p>
      </section>}

      <ContextPanel contextUsage={contextUsage} turnUsage={turnUsage} />

      <section className="agent-runtime-v2">
        <h2>运行配置</h2>
        <dl>
          <div><dt>Provider</dt><dd>{provider}</dd></div>
          <div><dt>Model</dt><dd title={model}>{model}</dd></div>
          <div><dt>Thinking</dt><dd>{thinking}</dd></div>
          <div><dt>权限</dt><dd>{permissionLabel(config?.permissionMode ?? session?.permissionMode)}</dd></div>
          <div><dt>工作目录</dt><dd title={cwd}>{cwd}</dd></div>
        </dl>
      </section>

      <section className="agent-activity-v2">
        <h2>最近活动</h2>
        {activity.length === 0
          ? <p className="agent-activity-empty-v2">暂无工具活动</p>
          : <div className="agent-activity-list-v2">
            {activity.map((entry) => (
              <div className={`agent-activity-row-v2 is-${entry.status}`} key={entry.id}>
                <span className="agent-activity-icon-v2">{entry.type === 'command' ? <CodeOutlined /> : <ToolOutlined />}</span>
                <span>
                  <strong>{entry.title}</strong>
                  {entry.detail && <small title={entry.detail}>{entry.detail}</small>}
                </span>
                <span className="agent-activity-state-v2">{statusIcon(entry.status)}</span>
                {entry.durationMs !== null && <time>{formatDuration(entry.durationMs)}</time>}
              </div>
            ))}
          </div>}
      </section>
    </aside>
  )
}

type InspectorActivity = {
  id: string
  type: 'tool' | 'command'
  title: string
  detail: string
  status: Item['status'] | 'idle'
  durationMs: number | null
}

function collectActivity(items: Item[], agent: AgentResource | null): InspectorActivity[] {
  const toolItems = items
    .filter((item): item is Extract<Item, { type: 'toolCall' | 'command' }> => item.type === 'toolCall' || item.type === 'command')
    .slice(-6)
    .reverse()
    .map((item) => item.type === 'command'
      ? { id: item.id, type: 'command' as const, title: '终端命令', detail: item.command, status: item.status, durationMs: item.durationMs }
      : { id: item.id, type: 'tool' as const, title: item.name, detail: item.summary, status: item.status, durationMs: item.durationMs })
  if (toolItems.length > 0) return toolItems
  return (agent?.recentActivity ?? []).slice(-6).reverse().map((detail, index) => ({
    id: `agent-activity-${index}`,
    type: 'tool',
    title: detail,
    detail: '',
    status: 'idle',
    durationMs: null
  }))
}

function conversationIcon(conversation: ConversationSummary): React.ReactNode {
  if (conversation.kind.type === 'main') return <CrownOutlined />
  if (conversation.kind.type === 'room') return <NumberOutlined />
  return <RobotOutlined />
}

function kindLabel(conversation: ConversationSummary): string {
  if (conversation.kind.type === 'main') return '主 Agent'
  if (conversation.kind.type === 'room') return '协作房间'
  return '子 Agent'
}

function stateLabel(state: AgentResource['state'] | ConversationSummary['runState']): string {
  const labels: Record<AgentResource['state'] | ConversationSummary['runState'], string> = {
    running: '正在执行任务',
    idle: '等待新任务',
    stopped: '已停止',
    passive: '正在监听消息'
  }
  return labels[state]
}

function permissionLabel(mode?: ConfigSnapshot['permissionMode']): string {
  if (!mode) return '—'
  const labels: Record<ConfigSnapshot['permissionMode'], string> = {
    default: '默认确认',
    acceptEdits: '自动接受编辑',
    bypassPermissions: '绕过确认',
    dontAsk: '不主动询问',
    plan: '计划模式'
  }
  return labels[mode]
}

function statusIcon(status: InspectorActivity['status']): React.ReactNode {
  if (status === 'streaming' || status === 'pending') return <LoadingOutlined spin={status === 'streaming'} />
  if (status === 'completed') return <CheckCircleOutlined />
  if (status === 'failed') return <CloseCircleOutlined />
  if (status === 'cancelled') return <StopOutlined />
  return <span className="agent-activity-idle-dot-v2" />
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(value)
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs} ms`
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`
  return `${Math.floor(durationMs / 60_000)}m`
}
