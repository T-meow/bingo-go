// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BingoGuiApi, GamePackSnapshot } from '../../../../shared/contracts/ipc'
import { GamePackSettings } from './GamePackSettings'

const snapshot: GamePackSnapshot = { revision: 'a'.repeat(64), warnings: [], items: [
  { manifest: { schemaVersion: 1, kind: 'game', id: 'io.github.tmeow.bingogo.bingo', name: 'Bingo', version: '1.0.0', entry: 'index.html', window: { width: 440, height: 620, minWidth: 360, minHeight: 520, resizable: true } }, source: 'builtin', enabled: true, status: 'ready', sha256: '1'.repeat(64) },
  { manifest: { schemaVersion: 1, kind: 'game', id: 'com.example.counter', name: 'Counter', version: '2.0.0', entry: 'index.html', window: { width: 400, height: 480, minWidth: 320, minHeight: 400, resizable: true } }, source: 'external', enabled: true, status: 'ready', sha256: '2'.repeat(64), installedAt: '2026-08-14T00:00:00.000Z' }
] }

describe('GamePackSettings', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    window.bingoGui = {
      listGamePacks: vi.fn().mockResolvedValue({ ok: true, value: snapshot }),
      setGamePackEnabled: vi.fn().mockResolvedValue({ ok: true, value: { ...snapshot, revision: 'b'.repeat(64) } }),
      chooseGamePack: vi.fn().mockResolvedValue({ ok: true, value: { canceled: true } }),
      launchGamePack: vi.fn(), clearGamePackData: vi.fn(), uninstallGamePack: vi.fn(), installGamePack: vi.fn(),
      onGamePackEvent: vi.fn().mockReturnValue(() => undefined)
    } as unknown as BingoGuiApi
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('shows source, version and hash while keeping built-ins non-removable', async () => {
    render(<AntApp><GamePackSettings /></AntApp>)
    expect(await screen.findByText('Counter')).toBeTruthy()
    expect(screen.getByText('v2.0.0 · 未知作者')).toBeTruthy()
    expect(screen.getAllByText(/SHA-256/)).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /卸载/ })).toHaveLength(1)
  })

  it('uses the current revision when disabling a package', async () => {
    render(<AntApp><GamePackSettings /></AntApp>)
    const toggle = await screen.findByRole('switch', { name: '禁用 Counter' })
    fireEvent.click(toggle)
    await waitFor(() => expect(window.bingoGui.setGamePackEnabled).toHaveBeenCalledWith({ id: 'com.example.counter', enabled: false, baseRevision: snapshot.revision }))
  })

  it('shows unsigned and downgrade warnings before installation', async () => {
    vi.mocked(window.bingoGui.chooseGamePack).mockResolvedValue({ ok: true, value: { canceled: false, preview: {
      token: '123e4567-e89b-42d3-a456-426614174000', manifest: { ...snapshot.items[1].manifest, version: '1.0.0' }, sha256: '3'.repeat(64),
      relation: 'downgrade', existingVersion: '2.0.0', compressedBytes: 1024, extractedBytes: 2048, entryCount: 4, unsigned: true, expiresAt: '2026-08-14T01:00:00.000Z'
    } } })
    render(<AntApp><GamePackSettings /></AntApp>)
    fireEvent.click(await screen.findByRole('button', { name: /导入游戏包/ }))
    expect(await screen.findByText('此游戏包未签名')).toBeTruthy()
    expect(screen.getByText('降级：2.0.0 → 1.0.0')).toBeTruthy()
  })

  it('passes the explicit clear-data choice when uninstalling', async () => {
    vi.mocked(window.bingoGui.uninstallGamePack).mockResolvedValue({ ok: true, value: { ...snapshot, revision: 'c'.repeat(64), items: [snapshot.items[0]] } })
    render(<AntApp><GamePackSettings /></AntApp>)
    fireEvent.click((await screen.findAllByRole('button', { name: /卸载/ }))[0])
    const dialog = await screen.findByRole('dialog', { name: '卸载“Counter”？' })
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: /卸\s*载/ }))
    await waitFor(() => expect(window.bingoGui.uninstallGamePack).toHaveBeenCalledWith({ id: 'com.example.counter', clearData: true, baseRevision: snapshot.revision }))
  })
})
