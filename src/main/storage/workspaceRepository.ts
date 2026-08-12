import { chmod, mkdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { workspacePreferencesSchema, type WorkspacePreferencesV2 } from '../../shared/contracts/ipc'

const MAX_RECENT_WORKSPACES = 8

export class WorkspaceRepository {
  private workspacePath: string
  private recentPaths: string[]

  constructor(private readonly path: string, fallbackPath: string) {
    this.workspacePath = fallbackPath
    this.recentPaths = [fallbackPath]
  }

  async initialize(loadPersisted: boolean): Promise<string> {
    if (!loadPersisted) return this.workspacePath
    try {
      const parsed = workspacePreferencesSchema.parse(JSON.parse(await readFile(this.path, 'utf8')))
      if (parsed.schemaVersion === 1) {
        if (isAbsolute(parsed.path)) this.use(parsed.path)
      } else if (isAbsolute(parsed.currentPath)) {
        this.workspacePath = parsed.currentPath
        this.recentPaths = uniquePaths([parsed.currentPath, ...parsed.recentPaths.filter(isAbsolute)])
          .slice(0, MAX_RECENT_WORKSPACES)
      }
    } catch {
      // A missing, stale, or malformed preference must not prevent startup.
    }
    return this.workspacePath
  }

  current(): string {
    return this.workspacePath
  }

  snapshot(): WorkspacePreferencesV2 {
    return { schemaVersion: 2, currentPath: this.workspacePath, recentPaths: [...this.recentPaths] }
  }

  use(path: string): void {
    if (!isAbsolute(path)) throw new Error(`Workspace path must be absolute: ${path}`)
    this.workspacePath = path
    this.recentPaths = uniquePaths([path, ...this.recentPaths]).slice(0, MAX_RECENT_WORKSPACES)
  }

  async save(path: string): Promise<void> {
    if (!isAbsolute(path)) throw new Error(`Workspace path must be absolute: ${path}`)
    const next = {
      schemaVersion: 2 as const,
      currentPath: path,
      recentPaths: uniquePaths([path, ...this.recentPaths]).slice(0, MAX_RECENT_WORKSPACES)
    }
    await mkdir(dirname(this.path), { recursive: true })
    await writeFileAtomic(this.path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, fsync: true })
    await chmod(this.path, 0o600).catch(() => undefined)
    this.workspacePath = path
    this.recentPaths = next.recentPaths
  }
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  return paths.filter((path) => {
    const key = process.platform === 'win32' ? path.toLocaleLowerCase() : path
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
