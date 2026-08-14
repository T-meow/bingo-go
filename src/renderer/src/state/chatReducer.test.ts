import { describe, expect, it } from 'vitest'
import { chatReducer, initialChatState } from './chatReducer'

const turnId = '123e4567-e89b-42d3-a456-426614174000'
const base = { protocolVersion: 1 as const, sessionId: 's', turnId }

describe('chatReducer', () => {
  it('streams text and correlates duplicate tool names by ID', () => {
    let state = chatReducer(initialChatState, { type: 'submit', turnId, prompt: 'hello' })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 1, type: 'turn.started', commandId: turnId } })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 2, type: 'text.delta', delta: 'Hi **the' } })
    expect(state.messages.at(-1)?.markdown).toBe('Hi **the')
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 3, type: 'text.delta', delta: 're**' } })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 4, type: 'tool.ready', toolCallId: 'a', name: 'Bash', summary: 'one' } })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 5, type: 'tool.ready', toolCallId: 'b', name: 'Bash', summary: 'two' } })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 6, type: 'tool.done', toolCallId: 'b', name: 'Bash', summary: 'two', status: 'done', output: 'ok', durationMs: 1 } })
    expect(state.messages.at(-1)?.markdown).toBe('Hi **there**')
    expect(state.tools.map((tool) => tool.status)).toEqual(['running', 'done'])
    expect(state.tools[1].durationMs).toBe(1)
  })

  it('queues prompts FIFO and clears them on cancellation', () => {
    let state = chatReducer(initialChatState, { type: 'submit', turnId, prompt: 'hello' })
    for (const [index, promptId] of ['123e4567-e89b-42d3-a456-426614174001', '123e4567-e89b-42d3-a456-426614174002'].entries()) {
      state = chatReducer(state, { type: 'event', event: { ...base, seq: index + 1, type: 'prompt.request', promptId, kind: 'question', title: 'Question', question: promptId, options: [], allowFreeText: true } })
    }
    expect(state.prompts[0].promptId.endsWith('001')).toBe(true)
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 3, type: 'turn.cancelled', reason: 'requested' } })
    expect(state.prompts).toEqual([])
    expect(state.turnId).toBeNull()
  })

  it('restores persisted history as settled messages', () => {
    const state = chatReducer(initialChatState, {
      type: 'restore',
      history: [
        { type: 'message', value: { id: 's:1', role: 'user', markdown: 'Remember amber' } },
        { type: 'message', value: { id: 's:2', role: 'assistant', markdown: 'Remembered' } }
      ]
    })
    expect(state.messages).toEqual([
      { id: 's:1', turnId: null, role: 'user', markdown: 'Remember amber', status: 'done' },
      { id: 's:2', turnId: null, role: 'assistant', markdown: 'Remembered', status: 'done' }
    ])
    expect(state.turnId).toBeNull()
  })

  it('rejects a duplicate submit while a turn is active', () => {
    const active = chatReducer(initialChatState, { type: 'submit', turnId, prompt: 'first' })
    const second = chatReducer(active, { type: 'submit', turnId: 'second-turn', prompt: 'second' })
    expect(second.turnId).toBe(turnId)
    expect(second.messages).toHaveLength(1)
  })

  it('keeps image metadata out of the visible message text', () => {
    const state = chatReducer(initialChatState, {
      type: 'submit',
      turnId,
      prompt: '',
      attachments: [{ id: 'image-1', name: 'screen.png', mediaType: 'image/png', dataUrl: 'data:image/png;base64,aA==' }]
    })
    expect(state.messages[0].markdown).toBe('')
    expect(state.messages[0].attachments?.[0].name).toBe('screen.png')
  })

  it('keeps text before and after a tool in chronological timeline segments', () => {
    let state = chatReducer(initialChatState, { type: 'submit', turnId, prompt: 'inspect' })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 1, type: 'turn.started', commandId: turnId } })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 2, type: 'text.delta', delta: '先检查。' } })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 3, type: 'tool.ready', toolCallId: 'tool-1', name: 'Bash', summary: 'Get-ChildItem' } })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 4, type: 'tool.done', toolCallId: 'tool-1', name: 'Bash', summary: 'Get-ChildItem', status: 'done', output: 'README.md', durationMs: 1 } })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 5, type: 'text.delta', delta: '检查完成。' } })

    expect(state.timeline.map((item) => item.type)).toEqual(['message', 'message', 'tool', 'message'])
    expect(state.timeline.flatMap((item) => item.type === 'message' && item.value.role === 'assistant' ? [item.value.markdown] : [])).toEqual(['先检查。', '检查完成。'])
    expect(state.messages.some((message) => message.role === 'assistant' && !message.markdown)).toBe(false)
  })

  it('restores tools between messages as settled timeline entries', () => {
    const state = chatReducer(initialChatState, {
      type: 'restore',
      history: [
        { type: 'message', value: { id: 's:1', role: 'user', markdown: 'inspect' } },
        { type: 'tool', value: { id: 'tool-1', name: 'Bash', summary: 'Get-ChildItem', status: 'done', output: 'README.md' } },
        { type: 'message', value: { id: 's:3', role: 'assistant', markdown: 'done' } }
      ]
    })

    expect(state.timeline.map((item) => item.type)).toEqual(['message', 'tool', 'message'])
    expect(state.tools).toEqual([{ id: 'tool-1', turnId: null, name: 'Bash', summary: 'Get-ChildItem', status: 'done', output: 'README.md' }])
  })

  it('does not duplicate repeated tool.ready events and retains an orphan tool.done event', () => {
    let state = chatReducer(initialChatState, { type: 'submit', turnId, prompt: 'inspect' })
    const ready = { ...base, seq: 1, type: 'tool.ready' as const, toolCallId: 'tool-1', name: 'Bash', summary: 'Get-ChildItem' }
    state = chatReducer(state, { type: 'event', event: ready })
    state = chatReducer(state, { type: 'event', event: { ...ready, seq: 2 } })
    state = chatReducer(state, { type: 'event', event: { ...base, seq: 3, type: 'tool.done', toolCallId: 'tool-2', name: 'Read', summary: 'README.md', status: 'done', output: 'ok', durationMs: 1 } })

    expect(state.tools.map((tool) => tool.id)).toEqual(['tool-1', 'tool-2'])
    expect(state.tools[1]).toMatchObject({ status: 'done', output: 'ok' })
  })

  it('initializes, updates, resets, and rejects stale context usage', () => {
    let state = chatReducer(initialChatState, {
      type: 'restore',
      history: [],
      contextUsage: { usedTokens: 10, contextWindow: 100 }
    })
    expect(state.contextUsage).toEqual({ usedTokens: 10, contextWindow: 100 })

    state = chatReducer(state, { type: 'submit', turnId, prompt: 'inspect' })
    state = chatReducer(state, {
      type: 'event',
      event: { ...base, seq: 1, type: 'context.usage', usedTokens: 70, contextWindow: 100 }
    })
    expect(state.contextUsage).toEqual({ usedTokens: 70, contextWindow: 100 })

    state = chatReducer(state, { type: 'context', contextUsage: { usedTokens: 20, contextWindow: 200 } })
    expect(state.contextUsage).toEqual({ usedTokens: 20, contextWindow: 200 })

    state = chatReducer(state, {
      type: 'event',
      event: { ...base, turnId: '123e4567-e89b-42d3-a456-426614174999', seq: 2, type: 'context.usage', usedTokens: 90, contextWindow: 100 }
    })
    expect(state.contextUsage).toEqual({ usedTokens: 20, contextWindow: 200 })

    state = chatReducer(state, { type: 'reset' })
    expect(state.contextUsage).toBeNull()
  })

  it('offers one continuation after cancellation and invalidates it on a new submit', () => {
    let state = chatReducer(initialChatState, { type: 'submit', turnId, prompt: 'unfinished' })
    state = chatReducer(state, {
      type: 'event',
      event: { ...base, seq: 1, type: 'turn.started', commandId: turnId, promptRevision: 'a'.repeat(64) }
    })
    state = chatReducer(state, {
      type: 'event',
      event: { ...base, seq: 2, type: 'turn.cancelled', reason: 'requested' }
    })

    expect(state.recovery).toEqual({ kind: 'cancelled', turnId })
    expect(state.messages[0]).toMatchObject({ editable: true, revision: 'a'.repeat(64), turnStatus: 'cancelled' })

    state = chatReducer(state, { type: 'submit', turnId: '123e4567-e89b-42d3-a456-426614174001', prompt: 'manual follow-up' })
    expect(state.recovery).toBeNull()
    expect(state.messages[0].editable).toBe(false)
  })

  it('distinguishes recoverable turn failures from transport crashes', () => {
    let failed = chatReducer(initialChatState, { type: 'submit', turnId, prompt: 'run' })
    failed = chatReducer(failed, {
      type: 'event',
      event: { ...base, seq: 1, type: 'error', scope: 'turn', code: 'TOOL_FAILED', msg: 'failed', level: 'flow', recoverable: true }
    })
    expect(failed.recovery).toEqual({ kind: 'turn-error', turnId })
    expect(failed.messages[0]).toMatchObject({ editable: true, turnStatus: 'error' })

    let crashed = chatReducer(initialChatState, { type: 'submit', turnId, prompt: 'run' })
    crashed = chatReducer(crashed, { type: 'transport-error', code: 'CHILD_EXITED', msg: 'runtime exited' })
    expect(crashed.recovery).toEqual({ kind: 'transport-crash', turnId })

    const restored = chatReducer(initialChatState, {
      type: 'restore',
      history: [{
        type: 'message',
        value: { id: 's:2', role: 'user', markdown: 'run', turnId, origin: 'prompt', turnStatus: 'started' }
      }]
    })
    expect(restored.recovery).toEqual({ kind: 'transport-crash', turnId })
  })
})
