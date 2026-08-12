import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WorkspaceRepository } from './workspaceRepository'

describe('WorkspaceRepository', () => {
  it('persists and restores the selected workspace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rei-workspace-'))
    const preferencePath = join(directory, 'workspace.json')
    const selected = join(directory, 'project')
    const repository = new WorkspaceRepository(preferencePath, directory)

    await repository.save(selected)

    const restored = new WorkspaceRepository(preferencePath, directory)
    await expect(restored.initialize(true)).resolves.toBe(selected)
    expect(restored.snapshot()).toEqual({ schemaVersion: 2, currentPath: selected, recentPaths: [selected, directory] })
  })
})
