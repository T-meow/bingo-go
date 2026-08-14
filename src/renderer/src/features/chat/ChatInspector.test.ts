// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatInspector, contextUsageBand } from './ChatPage'

afterEach(cleanup)

describe('context usage thresholds', () => {
  it('matches Bingo normal, warning, and danger boundaries', () => {
    expect(contextUsageBand({ usedTokens: 69, contextWindow: 100 })).toBe('normal')
    expect(contextUsageBand({ usedTokens: 70, contextWindow: 100 })).toBe('warning')
    expect(contextUsageBand({ usedTokens: 90, contextWindow: 100 })).toBe('warning')
    expect(contextUsageBand({ usedTokens: 91, contextWindow: 100 })).toBe('danger')
  })

  it('renders the estimate, remaining tokens, provider, model, and warning state', () => {
    render(createElement(ChatInspector, {
      tools: [],
      selectedToolId: null,
      contextUsage: { usedTokens: 7_500, contextWindow: 10_000 },
      contextCapability: true,
      provider: 'opencode-go',
      model: 'gpt-5.6-luna',
      onSelectTool: vi.fn()
    }))

    const estimate = screen.getByLabelText('上下文估算')
    expect(estimate.classList.contains('context-usage-warning')).toBe(true)
    expect(within(estimate).getByText('75%')).toBeTruthy()
    expect(within(estimate).getByText('2,500')).toBeTruthy()
    expect(within(estimate).getByText('opencode-go')).toBeTruthy()
    expect(within(estimate).getByText('gpt-5.6-luna')).toBeTruthy()
  })

  it('explains when the runtime does not support context usage', () => {
    render(createElement(ChatInspector, {
      tools: [],
      selectedToolId: null,
      contextUsage: null,
      contextCapability: false,
      provider: '',
      model: '',
      onSelectTool: vi.fn()
    }))

    const estimate = screen.getByLabelText('上下文估算')
    expect(within(estimate).getByText('不可用')).toBeTruthy()
    expect(within(estimate).getByText('当前 Bingo 版本不支持此数据')).toBeTruthy()
  })
})
