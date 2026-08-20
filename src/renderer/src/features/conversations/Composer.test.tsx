// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConfigSnapshot, ProviderInfo } from '../../../../shared/contracts/appServer'
import { Composer, type ComposerRuntime } from './Composer'

const config: ConfigSnapshot = {
  cwd: '/workspace', provider: 'openai', model: 'gpt-5.2-codex', thinking: 'high', permissionMode: 'default', theme: 'auto',
  shell: 'powershell', shellDialect: 'powershell', permissions: [], mcpServers: [], layers: [], revision: 1
}
const providers: ProviderInfo[] = [
  { name: 'openai', protocol: 'openai', apiBaseUrl: '', supportsImages: true, builtin: true, credential: { configured: true, source: 'settings', status: 'present' } },
  { name: 'anthropic', protocol: 'anthropic', apiBaseUrl: '', supportsImages: true, builtin: true, credential: { configured: true, source: 'settings', status: 'present' } }
]

beforeEach(() => {
  class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function baseProps() {
  return {
    value: '', onChange: vi.fn(), loading: false, onSubmit: vi.fn(), onCancel: vi.fn(), shellMode: false,
    onShellModeChange: vi.fn(), audience: '主 Agent', queue: [], onReclaimTail: vi.fn(), attachments: []
  }
}

describe('Composer', () => {
  it('does not expose Shell mode in collaboration conversations', () => {
    render(<App><Composer {...baseProps()} allowShell={false} audience="frontend" /></App>)
    expect(screen.queryByText('Shell')).toBeNull()
    expect(screen.getByPlaceholderText('发送消息给 frontend')).toBeTruthy()
  })

  it('dispatches runtime selections through the existing action callbacks', async () => {
    const runtime: ComposerRuntime = {
      config, providers, models: ['gpt-5.2-codex', 'gpt-5.1-codex-mini'],
      onProviderSelect: vi.fn(), onModelSelect: vi.fn(), onThinkingSelect: vi.fn(), onPermissionMode: vi.fn()
    }
    render(<App><Composer {...baseProps()} allowShell runtime={runtime} /></App>)
    fireEvent.click(screen.getByRole('button', { name: /gpt-5.2-codex/ }))

    fireEvent.mouseDown(await screen.findByLabelText('Provider'))
    const providerOptions = await screen.findAllByText('anthropic')
    fireEvent.click(providerOptions.at(-1)!)
    expect(vi.mocked(runtime.onProviderSelect).mock.calls[0]?.[0]).toBe('anthropic')

    fireEvent.mouseDown(screen.getByLabelText('Thinking'))
    const thinkingOptions = await screen.findAllByText('medium')
    fireEvent.click(thinkingOptions.at(-1)!)
    expect(vi.mocked(runtime.onThinkingSelect).mock.calls[0]?.[0]).toBe('medium')
  })
})
