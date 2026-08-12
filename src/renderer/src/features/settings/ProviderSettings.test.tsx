// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsSnapshot } from '../../../../shared/contracts/ipc'
import { ProviderSettings } from './ProviderSettings'

const snapshot: SettingsSnapshot = {
  path: '/home/.config/bingo/settings.json',
  revision: 'a'.repeat(64),
  values: {
    apiBaseUrl: '', provider: 'opencode-go', model: 'deepseek-v4-flash', thinkingLevel: 'off', permissionMode: 'default', theme: 'auto', motion: 'auto',
    sendImages: true, cacheControl: false, respondToBashCommands: true, shell: '', permissions: { allow: [], ask: [], deny: [] },
    team: { autoStart: false }, experimental: { agentChannels: false, channelMessageLimit: 500, agentMessageLimit: 50 }, share: { baseUrl: '' }
  },
  layers: {
    user: { path: '/home/.config/bingo/settings.json', exists: true, keys: [], values: {} },
    project: { path: '/workspace/.bingo/settings.json', exists: false, keys: [], values: {} },
    local: { path: '/workspace/.bingo/local.json', exists: false, keys: [], values: {} }
  },
  sources: {},
  shadowed: [],
  providers: [{ name: 'opencode-go', protocol: 'openai', apiBaseUrl: 'https://opencode.ai/zen/go', supportsImages: false, credentialConfigured: false, builtin: true }]
}

describe('ProviderSettings', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('does not report a fallback model list as a successful connection test', async () => {
    const onListModels = vi.fn().mockResolvedValue({
      provider: 'opencode-go',
      models: ['deepseek-v4-flash'],
      source: 'fallback',
      warning: { code: 'AUTH_REQUIRED', msg: 'provider "opencode-go" has no API key configured', level: 'flow', recoverable: true }
    })
    render(<App><ProviderSettings
      snapshot={snapshot}
      error={null}
      busy={false}
      activeProvider="opencode-go"
      onUpsert={vi.fn()}
      onRemove={vi.fn()}
      onListModels={onListModels}
    /></App>)

    fireEvent.click(screen.getByRole('button', { name: '测试 opencode-go' }))

    expect(await screen.findByText(/AUTH_REQUIRED/)).toBeTruthy()
    expect(screen.queryByText(/连接成功/)).toBeNull()
    await waitFor(() => expect(onListModels).toHaveBeenCalledWith('opencode-go'))
  })
})
