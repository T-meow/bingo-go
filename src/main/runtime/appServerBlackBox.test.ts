import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RuntimeLocator } from './runtimeLocator'
import { AppServerInspector } from './appServerInspector'
import { AppServerConnection } from './appServerConnection'

const candidate = process.env.BINGO_APP_SERVER_BINARY
  ?? (process.platform === 'win32'
    ? resolve('..', 'bingo', 'target', 'release', 'bingo.exe')
    : resolve('..', 'bingo', 'target', 'release', 'bingo'))
const binary = existsSync(candidate) ? candidate : null

describe.runIf(binary !== null)('real bingo app-server', () => {
  it('completes the initialize/shutdown handshake with exit code 0', async () => {
    const connection = new AppServerConnection(binary as string, process.cwd(), {
      onNotification: () => undefined,
      onDesync: () => undefined,
      onExit: () => undefined
    })
    const initialized = await connection.start()
    expect(initialized.protocol).toEqual({ major: 1, minor: 0 })
    expect(initialized.server.name).toBe('bingo')
    expect(initialized.limits.maxClientFrameBytes).toBeGreaterThan(0)
    await connection.shutdown()
  })

  it('exposes the pre-session provider catalog through the inspector', async () => {
    const inspector = new AppServerInspector(binary as string, process.cwd())
    const metadata = await inspector.open()
    expect(metadata.bingoVersion).toBe('0.4.1')
    const providers = await inspector.listProviders()
    expect(providers.length).toBeGreaterThan(0)
    await inspector.close()
  })

  it('is discovered by RuntimeLocator without legacy probe flags', async () => {
    const result = await new RuntimeLocator({ env: { ...process.env, BINGO_GUI_BINARY: binary as string } }).probe(process.cwd())
    expect(result).toMatchObject({
      ok: true,
      value: { bingoVersion: '0.4.1', protocolVersion: 1, appServer: { protocol: { major: 1, minor: 0 } } }
    })
  })
})
