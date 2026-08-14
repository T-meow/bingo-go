import { describe, expect, it } from 'vitest'
import { compareGamePackVersions, gamePackImportPreviewSchema, gamePackManifestV1Schema, gamePackSnapshotSchema } from './gamePacks'

const manifest = {
  schemaVersion: 1 as const,
  kind: 'game' as const,
  id: 'com.example.snake',
  name: 'Snake',
  version: '1.0.0',
  entry: 'index.html',
  window: { width: 480, height: 600, minWidth: 360, minHeight: 480, resizable: true }
}

describe('game pack manifest', () => {
  it('accepts a strict v1 game manifest', () => {
    expect(gamePackManifestV1Schema.parse(manifest)).toEqual(manifest)
  })

  it.each([
    ['uppercase ID', { ...manifest, id: 'Com.Example.Game' }],
    ['non-semver version', { ...manifest, version: '1.0' }],
    ['traversal entry', { ...manifest, entry: '../index.html' }],
    ['backslash entry', { ...manifest, entry: 'web\\index.html' }],
    ['NTFS alternate stream entry', { ...manifest, entry: 'web/index.html:payload' }],
    ['Windows device entry', { ...manifest, entry: 'con.html' }],
    ['URL query delimiter entry', { ...manifest, entry: 'game?.html' }],
    ['URL fragment delimiter entry', { ...manifest, entry: 'game#1.html' }],
    ['URL escape delimiter entry', { ...manifest, entry: 'game%20name.html' }],
    ['Windows forbidden character entry', { ...manifest, entry: 'bad|name.html' }],
    ['non-HTML entry', { ...manifest, entry: 'main.js' }],
    ['unknown field', { ...manifest, permissions: ['network'] }],
    ['oversized minimum', { ...manifest, window: { ...manifest.window, minWidth: 600 } }]
  ])('rejects %s', (_label, value) => {
    expect(gamePackManifestV1Schema.safeParse(value).success).toBe(false)
  })

  it('compares all three numeric version components', () => {
    expect(compareGamePackVersions('2.0.0', '1.999.999')).toBe(1)
    expect(compareGamePackVersions('1.2.10', '1.2.9')).toBe(1)
    expect(compareGamePackVersions('1.2.0', '1.2.0')).toBe(0)
    expect(compareGamePackVersions('0.9.0', '1.0.0')).toBe(-1)
  })

  it('strictly validates renderer-facing snapshots and import previews', () => {
    const item = { manifest, source: 'builtin', enabled: true, status: 'ready', sha256: 'a'.repeat(64) }
    expect(gamePackSnapshotSchema.safeParse({ revision: 'b'.repeat(64), items: [item], warnings: [] }).success).toBe(true)
    expect(gamePackSnapshotSchema.safeParse({ path: 'C:/private/registry.json', revision: 'b'.repeat(64), items: [item], warnings: [] }).success).toBe(false)
    expect(gamePackImportPreviewSchema.safeParse({
      token: '123e4567-e89b-42d3-a456-426614174000', manifest, sha256: 'c'.repeat(64), relation: 'upgrade',
      compressedBytes: 1, extractedBytes: 1, entryCount: 2, unsigned: true, expiresAt: '2026-08-14T00:00:00.000Z'
    }).success).toBe(false)
  })
})
