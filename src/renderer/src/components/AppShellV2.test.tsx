// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShellV2 } from './AppShellV2'

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1180 })
  class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AppShellV2', () => {
  it('routes primary navigation and exposes the game center', () => {
    const onViewChange = vi.fn()
    const onOpenGames = vi.fn()
    render(<AppShellV2
      view="conversations"
      onViewChange={onViewChange}
      onOpenGames={onOpenGames}
      sidebar={<span>会话侧栏内容</span>}
      inspector={<span>运行详情内容</span>}
    >工作区内容</AppShellV2>)

    fireEvent.click(screen.getByRole('button', { name: '团队' }))
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('button', { name: '打开小游戏中心' }))

    expect(onViewChange).toHaveBeenNthCalledWith(1, 'workspace')
    expect(onViewChange).toHaveBeenNthCalledWith(2, 'settings')
    expect(onOpenGames).toHaveBeenCalledOnce()
    expect(screen.getByText('会话侧栏内容')).toBeTruthy()
    expect(screen.getByText('运行详情内容')).toBeTruthy()
  })

  it('moves the inspector into a drawer below 980px', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 800 })
    render(<AppShellV2
      view="conversations"
      onViewChange={vi.fn()}
      sidebar={<span>窄屏会话侧栏</span>}
      inspector={<span>窄屏运行详情</span>}
    >窄屏内容</AppShellV2>)

    fireEvent.click(screen.getByRole('button', { name: '打开运行详情' }))
    expect(screen.getByRole('dialog', { name: '运行详情' })).toBeTruthy()
  })

  it('moves the conversation sidebar into a drawer below 980px', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 800 })
    render(<AppShellV2
      view="conversations"
      onViewChange={vi.fn()}
      sidebar={<span>窄屏会话侧栏</span>}
    >窄屏内容</AppShellV2>)

    fireEvent.click(screen.getByRole('button', { name: '打开会话侧栏' }))
    expect(screen.getByRole('dialog', { name: '会话' })).toBeTruthy()
  })
})
