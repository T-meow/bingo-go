// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BingoGuiApi } from '../../../shared/contracts/ipc'
import { GameCenter } from './GameCenter'

describe('GameCenter', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    window.bingoGui = {
      listGamePacks: vi.fn().mockResolvedValue({ ok: true, value: { revision: 'a'.repeat(64), warnings: [], items: [] } }),
      launchGamePack: vi.fn(),
      onGamePackEvent: vi.fn().mockReturnValue(() => undefined)
    } as unknown as BingoGuiApi
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('keeps a settings route when every game is disabled', async () => {
    const close = vi.fn(), openSettings = vi.fn()
    render(<AntApp><GameCenter open onClose={close} onOpenSettings={openSettings} /></AntApp>)
    expect(await screen.findByText('没有已启用的小游戏')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /打开小游戏设置/ }))
    expect(close).toHaveBeenCalledOnce()
    expect(openSettings).toHaveBeenCalledOnce()
  })
})
