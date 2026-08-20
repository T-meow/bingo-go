// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Item, Interaction } from '../../../../shared/contracts/appServer'
import { ItemRenderer } from './ItemRenderer'
import { InteractionCard } from './InteractionCard'

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
})
