import { spawn, type ChildProcess } from 'node:child_process'

export function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM', platform: NodeJS.Platform = process.platform): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  if (platform !== 'win32') {
    child.kill(signal)
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    killer.once('error', () => resolve())
    killer.once('exit', () => resolve())
  })
}
