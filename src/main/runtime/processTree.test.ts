import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: childProcess.spawn
}))

import { terminateProcessTree } from './processTree'

describe('terminateProcessTree', () => {
  it('uses taskkill with tree and force flags on Windows', async () => {
    const killer = new EventEmitter()
    childProcess.spawn.mockReturnValue(killer)
    const child = { pid: 42, exitCode: null, signalCode: null, kill: vi.fn() }

    const result = terminateProcessTree(child as never, 'SIGTERM', 'win32')
    killer.emit('exit', 0)
    await result

    expect(childProcess.spawn).toHaveBeenCalledWith('taskkill.exe', ['/pid', '42', '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('uses the requested signal directly on Unix', async () => {
    const child = { pid: 42, exitCode: null, signalCode: null, kill: vi.fn() }
    await terminateProcessTree(child as never, 'SIGKILL', 'linux')
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })
})
