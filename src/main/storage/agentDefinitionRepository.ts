import { readFile, readdir, mkdir, rename, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'

export type AgentDefinitionSource = 'user' | 'project'
export type AgentDefinitionDocument = {
  id: string
  source: AgentDefinitionSource
  name: string
  description: string
  model?: string
  provider?: string
  thinking?: string
  system: string
  inheritSystem: boolean
  revision: string
  path: string
}

export class AgentDefinitionRepository {
  constructor(
    private readonly userDirectory: string,
    private readonly projectDirectory: string
  ) {}

  async list(): Promise<AgentDefinitionDocument[]> {
    return [...await this.listDirectory(this.userDirectory, 'user'), ...await this.listDirectory(this.projectDirectory, 'project')]
  }

  async get(source: AgentDefinitionSource, id: string): Promise<AgentDefinitionDocument | null> {
    const path = this.pathFor(source, id)
    try {
      return await this.parse(path, source)
    } catch (error) {
      if (isErrorCode(error, 'ENOENT')) return null
      throw error
    }
  }

  async save(source: AgentDefinitionSource, id: string, document: Omit<AgentDefinitionDocument, 'id' | 'source' | 'revision' | 'path'>, baseRevision?: string): Promise<AgentDefinitionDocument> {
    const path = this.pathFor(source, id)
    const existing = await this.get(source, id).catch(() => null)
    if (existing && baseRevision && existing.revision !== baseRevision) throw new Error(`AGENT_DEFINITION_CONFLICT: ${path}`)
    const body = serializeDefinition(document)
    if (existing) {
      const backup = `${path}.bak-${Date.now()}`
      await rename(path, backup)
      try {
        await writeFileAtomic(path, body)
        await rm(backup, { force: true })
      } catch (error) {
        await rename(backup, path).catch(() => undefined)
        throw error
      }
    } else {
      await mkdir(dirname(path), { recursive: true })
      await writeFileAtomic(path, body)
    }
    return (await this.parse(path, source))!
  }

  async archive(source: AgentDefinitionSource, id: string, baseRevision?: string): Promise<string> {
    const path = this.pathFor(source, id)
    const existing = await this.get(source, id)
    if (!existing) throw new Error(`AGENT_DEFINITION_NOT_FOUND: ${path}`)
    if (baseRevision && existing.revision !== baseRevision) throw new Error(`AGENT_DEFINITION_CONFLICT: ${path}`)
    const archivePath = `${path}.archived-${Date.now()}`
    await rename(path, archivePath)
    return archivePath
  }

  private async listDirectory(directory: string, source: AgentDefinitionSource): Promise<AgentDefinitionDocument[]> {
    let entries: string[]
    try {
      entries = await readdir(directory)
    } catch {
      return []
    }
    const documents: AgentDefinitionDocument[] = []
    for (const entry of entries.filter((name) => name.endsWith('.md')).sort()) {
      const path = join(directory, entry)
      try {
        documents.push(await this.parse(path, source))
      } catch {
        continue
      }
    }
    return documents
  }

  private async parse(path: string, source: AgentDefinitionSource): Promise<AgentDefinitionDocument> {
    const sourceText = await readFile(path, 'utf8')
    const { frontmatter, body } = parseFrontmatter(sourceText)
    const id = basename(path, '.md')
    const stringField = (value: string | boolean | undefined): string | undefined => typeof value === 'string' ? value : undefined
    return {
      id,
      source,
      name: stringField(frontmatter.name) ?? id,
      description: stringField(frontmatter.description) ?? '',
      model: stringField(frontmatter.model),
      provider: stringField(frontmatter.provider),
      thinking: stringField(frontmatter.thinking),
      system: body.trimEnd(),
      inheritSystem: frontmatter.inheritSystem !== false,
      revision: sha256(sourceText),
      path
    }
  }

  private pathFor(source: AgentDefinitionSource, id: string): string {
    const directory = source === 'user' ? this.userDirectory : join(this.projectDirectory, '.bingo', 'agents')
    return join(directory, `${id}.md`)
  }
}

function serializeDefinition(document: Omit<AgentDefinitionDocument, 'id' | 'source' | 'revision' | 'path'>): string {
  const frontmatter = [
    `name: ${document.name}`,
    `description: ${document.description}`
  ]
  if (document.model) frontmatter.push(`model: ${document.model}`)
  if (document.provider) frontmatter.push(`provider: ${document.provider}`)
  if (document.thinking) frontmatter.push(`thinking: ${document.thinking}`)
  if (!document.inheritSystem) frontmatter.push('inherit_system: false')
  return `---\n${frontmatter.join('\n')}\n---\n\n${document.system.trimEnd()}\n`
}

function parseFrontmatter(source: string): { frontmatter: Record<string, string | boolean | undefined>; body: string } {
  const frontmatter: Record<string, string | boolean | undefined> = {}
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
  if (!match) return { frontmatter, body: source }
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    if (key === 'inherit_system') frontmatter.inheritSystem = !['false', 'no', 'off', '0'].includes(value.toLowerCase())
    else frontmatter[key] = value
  }
  return { frontmatter, body: source.slice(match[0].length) }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}

export async function agentDefinitionSize(path: string): Promise<number> {
  try { return (await stat(path)).size } catch { return 0 }
}
