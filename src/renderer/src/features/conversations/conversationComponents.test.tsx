// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentResource, ConversationSummary, Item, Interaction } from '../../../../shared/contracts/appServer'
import { AgentInspector } from './AgentInspector'
import { ItemRenderer } from './ItemRenderer'
import { InteractionCard } from './InteractionCard'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  })))
})

afterEach(cleanup)

describe('conversation components', () => {
  it('renders semantic message, reasoning, and tool items through one renderer', () => {
    const items: Item[] = [
      { id: 'item_1', type: 'assistantMessage', text: 'Hello **world**', status: 'streaming' },
      { id: 'item_2', type: 'reasoning', text: 'thinking aloud', status: 'streaming' },
      { id: 'item_3', type: 'toolCall', name: 'Bash', summary: 'run tests', output: 'ok', input: {}, diff: null, artifact: null, durationMs: 4, toolCallId: 'tool_1', status: 'completed' }
    ] as unknown as Item[]
    const { container } = render(<>{items.map((item) => <ItemRenderer key={item.id} item={item} />)}</>)
    expect(container.textContent).toContain('Hello world')
    expect(container.textContent).toContain('思考过程')
    expect(container.textContent).toContain('run tests')
  })

  it('renders a permission interaction and sends an allow-once decision', () => {
    const interaction: Interaction = {
      id: 'int_1', conversationId: 'conv_main', openedAt: 0, remainingGuardMs: 0, turnId: 'turn_1', itemId: null,
      prompt: {
        type: 'permission', title: 'Allow Bash', reason: 'run tests', allowsFeedback: false,
        decisions: ['allowOnce', 'deny'], sessionScope: null,
        tool: { name: 'Bash', input: { command: 'cargo test' } }, preview: { type: 'command', command: 'cargo test' }
      }
    }
    const onRespond = vi.fn()
    render(<InteractionCard interaction={interaction} onRespond={onRespond} />)
    screen.getByText('允许一次').click()
    expect(onRespond).toHaveBeenCalledWith({ type: 'allowOnce' }, 'pointer')
  })

  it('renders agent runtime, context, and recent tool activity in the inspector', () => {
    const conversation = {
      id: 'conv_agent', kind: { type: 'agent', agentId: 'agent_1' }, title: '工程 Agent', runState: 'running',
      historyGeneration: 1, isMember: true, unread: 0, mentions: 0, obligations: [], pendingInteractions: 1,
      queueCount: 2, queueRevision: 1, revision: 1
    } as ConversationSummary
    const agent = {
      id: 'agent_1', conversationId: 'conv_agent', name: '工程 Agent', description: '负责前端重构', prompt: '重构 Agent 页面',
      state: 'running', kind: 'crew', cwd: '/workspace', provider: 'openai', model: 'gpt-5', thinking: 'high',
      outputTokens: 12_000, toolUses: 4, pending: 1, unacked: 2, lastActiveAt: 1, recentActivity: []
    } as AgentResource
    const items = [{
      id: 'tool_1', type: 'toolCall', name: 'Bash', summary: '运行测试', output: 'ok', input: {}, diff: null,
      artifact: null, durationMs: 20, toolCallId: 'call_1', status: 'completed'
    }] as Item[]

    const inspector = render(<AgentInspector
      conversation={conversation}
      agent={agent}
      session={null}
      config={null}
      items={items}
      contextUsage={{ used: 24_000, window: 120_000, trigger: 100_000 }}
      turnUsage={{ authoritative: true, inputTokens: 2_000, outputTokens: 800, cacheReadTokens: 200, cacheWriteTokens: 0 }}
      interactionCount={1}
      queueCount={2}
    />)

    expect(inspector.getByText('工程 Agent')).toBeTruthy()
    expect(inspector.getByText('gpt-5')).toBeTruthy()
    expect(inspector.getByText('20%')).toBeTruthy()
    expect(inspector.getByText('Bash')).toBeTruthy()
  })
})
