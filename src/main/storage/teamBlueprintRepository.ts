import { readFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'

export type TeamChannelSpec = { mode?: 'serial' | 'free'; messageLimit?: number }
export type TeamChannelDef = { name: string; mode?: 'serial' | 'free'; messageLimit?: number; members?: string[] }
export type TeamMemberDef = {
  name: string
  agent: string
  avatar?: string
  model?: string
  provider?: string
  thinking?: string
}
export type TeamRef = { name?: string; path: string }
export type TeamBlueprint = {
  name: string
  channel?: TeamChannelSpec
  channels?: TeamChannelDef[]
  members: TeamMemberDef[]
  teams?: TeamRef[]
}

export type TeamBlueprintSnapshot = { path: string; revision: string; exists: boolean; definition: TeamBlueprint | null }

export class TeamBlueprintRepository {
  constructor(private readonly projectDirectory: string) {}

  path(): string {
    return join(this.projectDirectory, '.bingo', 'team.json')
  }

  async read(): Promise<TeamBlueprintSnapshot> {
    const path = this.path()
    try {
      const source = await readFile(path, 'utf8')
      const definition = JSON.parse(source) as TeamBlueprint
      validateBlueprint(definition, path)
      return { path, revision: sha256(source), exists: true, definition }
    } catch (error) {
      if (isErrorCode(error, 'ENOENT')) return { path, revision: sha256(''), exists: false, definition: null }
      throw error
    }
  }

  async write(baseRevision: string, definition: TeamBlueprint): Promise<TeamBlueprintSnapshot> {
    const before = await this.read()
    if (before.exists && before.revision !== baseRevision) throw new Error(`TEAM_BLUEPRINT_CONFLICT: ${this.path()}`)
    validateBlueprint(definition, this.path())
    const next = `${JSON.stringify(definition, null, 2)}\n`
    const path = this.path()
    const backup = `${path}.bak-${Date.now()}`
    if (before.exists) {
      await rename(path, backup)
    } else {
      await mkdir(dirname(path), { recursive: true })
    }
    try {
      await writeFileAtomic(path, next)
      await rm(backup, { force: true })
      return { path, revision: sha256(next), exists: true, definition: JSON.parse(next) as TeamBlueprint }
    } catch (error) {
      if (before.exists) await rename(backup, path).catch(() => undefined)
      throw error
    }
  }
}

export function validateBlueprint(value: unknown, label = '.bingo/team.json'): asserts value is TeamBlueprint {
  if (typeof value !== 'object' || value === null) throw new Error(`${label}: team blueprint must be an object`)
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || !record.name.trim()) throw new Error(`${label}: name is required`)
  if (!Array.isArray(record.members) || record.members.some((member) => !isMember(member))) throw new Error(`${label}: members must be a valid array`)
  if (record.channel !== undefined && !isChannelSpec(record.channel)) throw new Error(`${label}: channel is invalid`)
  if (record.channels !== undefined && (!Array.isArray(record.channels) || record.channels.some((channel) => !isChannel(channel)))) throw new Error(`${label}: channels is invalid`)
}

function isMember(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).name === 'string' && typeof (value as Record<string, unknown>).agent === 'string'
}

function isChannelSpec(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

function isChannel(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).name === 'string'
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}

export async function teamBlueprintSize(path: string): Promise<number> {
  try { return (await stat(path)).size } catch { return 0 }
}
