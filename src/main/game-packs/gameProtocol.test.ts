import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ registerSchemesAsPrivileged: vi.fn() }))
vi.mock('electron', () => ({ protocol: { registerSchemesAsPrivileged: electron.registerSchemesAsPrivileged } }))

import { GameProtocol, registerGameProtocolScheme } from './gameProtocol'

const roots: string[] = []
afterEach(async () => {
  electron.registerSchemesAsPrivileged.mockReset()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('GameProtocol', () => {
  it('registers the custom scheme as standard and secure', () => {
    registerGameProtocolScheme()
    expect(electron.registerSchemesAsPrivileged).toHaveBeenCalledWith([{
      scheme: 'bingo-game', privileges: { standard: true, secure: true, stream: true }
    }])
  })

  it('serves only package files with a restrictive CSP and read-only methods', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bingo-game-protocol-'))
    roots.push(root)
    await mkdir(join(root, 'assets'))
    await writeFile(join(root, 'index.html'), '<!doctype html><script src="assets/app.js"></script>')
    await writeFile(join(root, 'assets', 'app.js'), 'document.title = "Game"')
    const manifest = {
      schemaVersion: 1 as const, kind: 'game' as const, id: 'com.example.game', name: 'Game', version: '1.0.0', entry: 'index.html',
      window: { width: 480, height: 600, minWidth: 360, minHeight: 480, resizable: true }
    }
    let handler: ((request: Request) => Promise<Response>) | undefined
    const gameSession = {
      protocol: {
        isProtocolHandled: vi.fn().mockReturnValue(false),
        unhandle: vi.fn(),
        handle: vi.fn((_scheme: string, next: (request: Request) => Promise<Response>) => { handler = next })
      }
    }

    await new GameProtocol().register(gameSession as never, manifest, root)
    const page = await handler!({ url: 'bingo-game://com.example.game/index.html', method: 'GET' } as Request)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(page.headers.get('content-security-policy')).toContain("connect-src 'none'")
    expect(page.headers.get('content-security-policy')).toContain("worker-src 'none'")
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(page.headers.get('content-security-policy')).not.toContain('unsafe-inline')
    expect(await page.text()).toContain('assets/app.js')

    const head = await handler!({ url: 'bingo-game://com.example.game/index.html', method: 'HEAD' } as Request)
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    expect((await handler!({ url: 'bingo-game://com.example.game/index.html', method: 'POST' } as Request)).status).toBe(405)
    expect((await handler!({ url: 'bingo-game://com.other.game/index.html', method: 'GET' } as Request)).status).toBe(403)
    expect((await handler!({ url: 'bingo-game://com.example.game/%252e%252e/secret', method: 'GET' } as Request)).status).toBe(400)
  })
})
