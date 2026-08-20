// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionInfo } from '../../../shared/contracts/appServer'
import { CommandPalette } from './CommandPalette'

const actions: ActionInfo[] = [
  { id: 'conversation.compact', family: 'conversation', label: '压缩对话', description: '减少上下文', available: true, arguments: [] },
  { id: 'session.rename', family: 'session', label: '重命名会话', description: '修改标题', available: true, arguments: [{ name: 'name', kind: 'string', required: true, choices: [], description: '新名称' }] },
  { id: 'team.stop', family: 'team', label: '停止团队', description: '停止成员', available: false, unavailableReason: '当前没有运行成员', arguments: [] },
  { id: 'theme.set', family: 'settings', label: '切换主题', description: '修改主题', available: true, arguments: [] }
]

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CommandPalette', () => {
  it('moves with the keyboard and executes the active available command', () => {
    const onExecute = vi.fn()
    render(<App><CommandPalette open actions={actions} onClose={vi.fn()} onExecute={onExecute} /></App>)
    const search = screen.getByPlaceholderText('搜索命令')

    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ id: 'theme.set' }), {})
    expect(screen.getByText('当前没有运行成员')).toBeTruthy()
  })

  it('keeps required arguments editable before execution', () => {
    const onExecute = vi.fn()
    render(<App><CommandPalette open actions={actions} onClose={vi.fn()} onExecute={onExecute} /></App>)

    fireEvent.click(screen.getByRole('option', { name: /重命名会话/ }))
    const execute = screen.getByRole('button', { name: '执行命令' })
    expect((execute as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '新的任务标题' } })
    fireEvent.click(execute)

    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ id: 'session.rename' }), { name: '新的任务标题' })
  })
})
