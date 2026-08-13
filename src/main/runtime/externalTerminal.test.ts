import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { openExternalTerminal, type ExternalTerminalDependencies } from './externalTerminal'

type LaunchCall = { executable: string; args: string[]; cwd: string; windowsHide: boolean }

function dependencies(platform: NodeJS.Platform, outcomes: Array<'spawn' | 'error'>, env: NodeJS.ProcessEnv = {}): {
  value: ExternalTerminalDependencies
  calls: LaunchCall[]
  unref: ReturnType<typeof vi.fn>
} {
  const calls: LaunchCall[] = []
  const unref = vi.fn()
  return {
    calls,
    unref,
    value: {
      platform,
      env,
      directoryExists: vi.fn().mockResolvedValue(true),
      spawnProcess: (executable, args, options) => {
        calls.push({ executable, args, cwd: options.cwd, windowsHide: options.windowsHide })
        const child = new EventEmitter() as EventEmitter & { unref(): void }
        child.unref = unref
        queueMicrotask(() => child.emit(outcomes.shift() === 'error' ? 'error' : 'spawn', new Error('missing')))
        return child as unknown as ReturnType<ExternalTerminalDependencies['spawnProcess']>
      }
    }
  }
}

describe('openExternalTerminal', () => {
  it('uses Windows Terminal with the workspace as a separate argument', async () => {
    const fixture = dependencies('win32', ['spawn'])

    await expect(openExternalTerminal('D:\\Projects\\demo folder', fixture.value)).resolves.toEqual({
      terminalName: 'Windows Terminal',
      workspacePath: 'D:\\Projects\\demo folder'
    })
    expect(fixture.calls).toEqual([{
      executable: 'wt.exe',
      args: ['-w', '-1', '-d', 'D:\\Projects\\demo folder'],
      cwd: 'D:\\Projects\\demo folder',
      windowsHide: false
    }])
    expect(fixture.unref).toHaveBeenCalledOnce()
  })

  it('falls back to a static PowerShell launcher when Windows Terminal is unavailable', async () => {
    const fixture = dependencies('win32', ['error', 'spawn'])

    const result = await openExternalTerminal('D:\\Projects\\demo & work', fixture.value)

    expect(result.terminalName).toBe('Windows PowerShell')
    expect(fixture.calls[1]).toEqual({
      executable: 'powershell.exe',
      args: ['-NoLogo'],
      cwd: 'D:\\Projects\\demo & work',
      windowsHide: false
    })
    expect(fixture.calls[1].args.join(' ')).not.toContain('demo & work')
  })

  it('opens Terminal.app on macOS', async () => {
    const fixture = dependencies('darwin', ['spawn'])

    await openExternalTerminal('/Users/ferris/Demo Project', fixture.value)

    expect(fixture.calls[0]).toEqual({
      executable: '/usr/bin/open',
      args: ['-a', 'Terminal', '/Users/ferris/Demo Project'],
      cwd: '/Users/ferris/Demo Project',
      windowsHide: false
    })
  })

  it('uses the Linux fallback chain without invoking a shell', async () => {
    const fixture = dependencies('linux', ['error', 'error', 'error', 'spawn'], { TERMINAL: 'kitty' })

    const result = await openExternalTerminal('/home/ferris/demo', fixture.value)

    expect(result.terminalName).toBe('GNOME Terminal')
    expect(fixture.calls.map(({ executable }) => executable)).toEqual([
      'xdg-terminal-exec', 'kitty', 'x-terminal-emulator', 'gnome-terminal'
    ])
    expect(fixture.calls[3].args).toEqual(['--working-directory=/home/ferris/demo'])
  })

  it('reports an inaccessible workspace before attempting to launch', async () => {
    const fixture = dependencies('linux', [])
    fixture.value.directoryExists = vi.fn().mockResolvedValue(false)

    await expect(openExternalTerminal('/missing', fixture.value)).rejects.toMatchObject({
      code: 'WORKSPACE_UNAVAILABLE'
    })
    expect(fixture.calls).toHaveLength(0)
  })

  it('reports when no Linux terminal candidate can be started', async () => {
    const fixture = dependencies('linux', Array.from({ length: 20 }, () => 'error'))

    await expect(openExternalTerminal('/home/ferris/demo', fixture.value)).rejects.toMatchObject({
      code: 'TERMINAL_UNAVAILABLE'
    })
  })
})
