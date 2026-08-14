import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, normalize } from 'node:path'
import { conversationTitle, manualConversationTitle } from '../../shared/conversationTitle'
import type { SessionForkReason } from '../../shared/contracts/cli'

export type SessionSummary = { id: string; name: string; preview: string; updatedAt: string; messageCount: number; workspacePath: string | null; parentSessionId?: string; forkReason?: SessionForkReason }
export type HistoryAttachment = { id: string; mediaType: 'image/png' | 'image/jpeg'; dataUrl: string }
export type HistoryItem = {
  type: 'message'
  value: {
    id: string; role: 'user' | 'assistant'; markdown: string; attachments?: HistoryAttachment[]
    turnId?: string; origin?: 'prompt' | 'assistant' | 'tool-result' | 'legacy'; editable?: boolean; revision?: string
    turnStatus?: 'started' | 'completed' | 'cancelled' | 'error'
  }
} | {
  type: 'tool'
  value: { id: string; name: string; summary: string; status: 'done' | 'error' | 'interrupted'; output?: string }
}
export type SessionListOutput = { sessions: SessionSummary[]; warnings: string[] }

const MAX_HISTORY_IMAGE_BASE64 = 5 * 1024 * 1024
const MAX_HISTORY_TOOL_OUTPUT = 100_000
type TurnIndex = {
  schemaVersion: 1
  transcriptRevision: string
  parentSessionId?: string
  forkReason?: SessionForkReason
  turns: Array<{ turnId: string; promptLine: number; status: 'started' | 'completed' | 'cancelled' | 'error'; contentRevision: string }>
}

export class TranscriptRepository {
  constructor(private readonly directory: string) {}

  async list(): Promise<SessionListOutput> {
    let names: string[]
    try { names = await readdir(this.directory) } catch { return { sessions: [], warnings: [] } }
    const entries = await Promise.all(names.filter((name) => extname(name) === '.jsonl').map(async (name) => {
      const path = join(this.directory, name)
      return { name, path, metadata: await stat(path) }
    }))
    entries.sort((a, b) => b.metadata.mtimeMs - a.metadata.mtimeMs)
    const warnings: string[] = []
    const sessions = await Promise.all(entries.map(async ({ name, path, metadata }) => {
      const id = basename(name, '.jsonl')
      const source = await readFile(path, 'utf8')
      const indexed = await this.readTurnIndex(id)
      const parsed = this.parse(source, id, indexed.index)
      warnings.push(...indexed.warnings)
      warnings.push(...parsed.warnings)
      const messageItems = parsed.history.filter((item): item is Extract<HistoryItem, { type: 'message' }> => item.type === 'message')
      const title = sessionPresentation(id, parsed.history).displayName
      const lastMessage = messageItems.at(-1)?.value
      const preview = lastMessage?.markdown
        ? stripMarkdown(lastMessage.markdown).replace(/\s+/g, ' ').trim().slice(0, 120)
        : lastMessage?.attachments?.length
          ? `${lastMessage.attachments.length} 张图片`
          : ''
      return {
        id,
        name: title,
        preview,
        updatedAt: metadata.mtime.toISOString(),
        messageCount: messageItems.length,
        workspacePath: parsed.workspacePath,
        ...(indexed.index?.parentSessionId ? { parentSessionId: indexed.index.parentSessionId } : {}),
        ...(indexed.index?.forkReason ? { forkReason: indexed.index.forkReason } : {})
      }
    }))
    return { sessions, warnings }
  }

  async load(sessionId: string): Promise<{ history: HistoryItem[]; workspacePath: string | null; warnings: string[] }> {
    if (!validSessionId(sessionId)) throw new Error('Invalid session ID')
    const [source, indexed] = await Promise.all([
      readFile(join(this.directory, `${sessionId}.jsonl`), 'utf8'),
      this.readTurnIndex(sessionId)
    ])
    const parsed = this.parse(source, sessionId, indexed.index)
    return { history: parsed.history, workspacePath: parsed.workspacePath, warnings: [...indexed.warnings, ...parsed.warnings] }
  }

  private async readTurnIndex(sessionId: string): Promise<{ index?: TurnIndex; warnings: string[] }> {
    try {
      const raw = JSON.parse(await readFile(join(this.directory, `${sessionId}.turns.json`), 'utf8')) as unknown
      if (!isTurnIndex(raw)) return { warnings: [`${sessionId}: ignored invalid turn index`] }
      return { index: raw, warnings: [] }
    } catch (error) {
      const code = isRecord(error) && typeof error.code === 'string' ? error.code : undefined
      return code === 'ENOENT' ? { warnings: [] } : { warnings: [`${sessionId}: could not read turn index`] }
    }
  }

  private parse(source: string, sessionId: string, index?: TurnIndex): { history: HistoryItem[]; workspacePath: string | null; warnings: string[] } {
    const history: HistoryItem[] = []
    const tools = new Map<string, Extract<HistoryItem, { type: 'tool' }>>()
    const warnings: string[] = []
    const indexedPrompts = new Map(index?.turns.map((turn) => [turn.promptLine, turn]) ?? [])
    const legacyPromptLines: number[] = []
    let workspacePath: string | null = null
    source.split('\n').forEach((line, index) => {
      if (!line.trim()) return
      try {
        const raw = JSON.parse(line) as { type?: unknown; schemaVersion?: unknown; cwd?: unknown; role?: unknown; content?: unknown }
        if (raw.type === 'session') {
          if (raw.schemaVersion === 1 && typeof raw.cwd === 'string' && isAbsolute(raw.cwd)) workspacePath = normalize(raw.cwd)
          else warnings.push(`${sessionId}: ignored invalid session metadata on line ${index + 1}`)
          return
        }
        if (raw.role !== 'user' && raw.role !== 'assistant') return
        const attachments = imageContent(raw.content, `${sessionId}:${index + 1}`)
        const text = textContent(raw.content)
        const markdown = raw.role === 'user' ? stripTrailingImageMarkers(text, attachments.length) : text
        const hasToolResult = Array.isArray(raw.content) && raw.content.some((block) => isRecord(block) && block.type === 'tool_result')
        const turn = indexedPrompts.get(index + 1)
        const origin = raw.role === 'assistant' ? 'assistant' : turn ? 'prompt' : hasToolResult ? 'tool-result' : 'legacy'
        if (raw.role === 'user' && !hasToolResult && (markdown || attachments.length > 0) && !turn) legacyPromptLines.push(index + 1)
        if (markdown || attachments.length > 0) {
          history.push({
            type: 'message',
            value: {
              id: `${sessionId}:${index + 1}`,
              role: raw.role,
              markdown,
              ...(attachments.length > 0 ? { attachments } : {}),
              origin,
              ...(turn ? { turnId: turn.turnId, revision: turn.contentRevision, turnStatus: turn.status } : {})
            }
          })
        }
        if (!Array.isArray(raw.content)) return
        for (const [blockIndex, block] of raw.content.entries()) {
          if (!isRecord(block)) continue
          if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
            const tool: Extract<HistoryItem, { type: 'tool' }> = {
              type: 'tool',
              value: { id: block.id, name: block.name, summary: summarizeToolInput(block.name, block.input), status: 'interrupted' }
            }
            tools.set(block.id, tool)
            history.push(tool)
          } else if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
            const tool = tools.get(block.tool_use_id)
            if (!tool) {
              warnings.push(`${sessionId}: skipped orphan tool result on line ${index + 1}, block ${blockIndex + 1}`)
              continue
            }
            tool.value.status = isInterruptedToolResult(block.content) ? 'interrupted' : block.is_error === true ? 'error' : 'done'
            tool.value.output = toolResultText(block.content)
          }
        }
      } catch { warnings.push(`${sessionId}: skipped corrupt line ${index + 1}`) }
    })
    const lastTurn = index?.turns.at(-1)
    const indexedLastPromptExists = Boolean(lastTurn && history.some((item) => item.type === 'message' && item.value.id === `${sessionId}:${lastTurn.promptLine}` && item.value.origin === 'prompt'))
    const editableLine = lastTurn && indexedLastPromptExists && lastTurn.status !== 'started' ? lastTurn.promptLine : undefined
    const legacyEditableLine = index ? undefined : legacyPromptLines.length === 1 ? legacyPromptLines[0] : undefined
    for (const item of history) {
      if (item.type !== 'message' || item.value.role !== 'user') continue
      const line = Number(item.value.id.slice(item.value.id.lastIndexOf(':') + 1))
      if (line === editableLine || line === legacyEditableLine) item.value.editable = true
    }
    return { history, workspacePath, warnings }
  }
}

function isTurnIndex(value: unknown): value is TurnIndex {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.transcriptRevision !== 'string' || !Array.isArray(value.turns)) return false
  if (value.parentSessionId !== undefined && typeof value.parentSessionId !== 'string') return false
  if (value.forkReason !== undefined && value.forkReason !== 'edit-last-prompt' && value.forkReason !== 'recover-interrupted') return false
  return value.turns.every((turn) => isRecord(turn)
    && typeof turn.turnId === 'string'
    && typeof turn.promptLine === 'number'
    && Number.isInteger(turn.promptLine)
    && turn.promptLine > 0
    && (turn.status === 'started' || turn.status === 'completed' || turn.status === 'cancelled' || turn.status === 'error')
    && typeof turn.contentRevision === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function summarizeToolInput(name: string, input: unknown): string {
  if (isRecord(input)) {
    for (const key of ['command', 'path', 'query', 'pattern', 'url']) {
      const value = input[key]
      if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 240)
    }
  }
  return name
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return truncateToolOutput(content)
  if (!Array.isArray(content)) {
    try { return content === undefined ? '' : truncateToolOutput(JSON.stringify(content)) } catch { return '' }
  }
  return truncateToolOutput(content.flatMap((block) => isRecord(block) && block.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n'))
}

function truncateToolOutput(output: string): string {
  return output.length <= MAX_HISTORY_TOOL_OUTPUT ? output : `${output.slice(0, MAX_HISTORY_TOOL_OUTPUT)}\n[输出已截断]`
}

function isInterruptedToolResult(content: unknown): boolean {
  const output = toolResultText(content).trim().toLowerCase()
  return output === 'interrupted'
    || output.includes('interrupted by the user before this tool produced a result')
    || output.includes('interrupted by a runtime failure before this tool produced a result')
}

function textContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap((block) => typeof block === 'object' && block !== null && 'type' in block && block.type === 'text' && 'text' in block && typeof block.text === 'string' ? [block.text] : []).join('\n')
}

function imageContent(content: unknown, messageId: string): HistoryAttachment[] {
  if (!Array.isArray(content)) return []
  return content.flatMap((block, index) => {
    if (typeof block !== 'object' || block === null || !('type' in block) || block.type !== 'image' || !('source' in block)) return []
    const source = block.source
    if (typeof source !== 'object' || source === null) return []
    const mediaType = 'media_type' in source ? source.media_type : undefined
    const data = 'data' in source ? source.data : undefined
    if ((mediaType !== 'image/png' && mediaType !== 'image/jpeg') || typeof data !== 'string') return []
    if (data.length === 0 || data.length > MAX_HISTORY_IMAGE_BASE64 || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return []
    return [{ id: `${messageId}:image:${index}`, mediaType, dataUrl: `data:${mediaType};base64,${data}` }]
  })
}

function stripTrailingImageMarkers(markdown: string, imageCount: number): string {
  if (!markdown || imageCount === 0) return markdown
  const lines = markdown.split('\n')
  let cursor = lines.length - 1
  for (let index = 0; index < imageCount; index += 1) {
    while (cursor >= 0 && !lines[cursor].trim()) cursor -= 1
    if (cursor < 0 || !/^#\[image \d+\]$/.test(lines[cursor].trim())) return markdown
    cursor -= 1
  }
  return lines.slice(0, cursor + 1).join('\n').trimEnd()
}

function validSessionId(id: string): boolean { return id.length > 0 && id.length <= 255 && !id.includes('/') && !id.includes('\\') && id !== '.' && id !== '..' }
export function sessionPresentation(sessionId: string, history: HistoryItem[]): { displayName: string; autoTitleEligible: boolean } {
  const manualTitle = manualConversationTitle(sessionId)
  const firstUser = history.find((item): item is Extract<HistoryItem, { type: 'message' }> => item.type === 'message' && item.value.role === 'user')?.value
  return {
    displayName: conversationTitle({ manualTitle, text: firstUser?.markdown, hasAttachments: Boolean(firstUser?.attachments?.length) }),
    autoTitleEligible: !manualTitle && !firstUser
  }
}

/** Light Markdown normalization for nav titles/previews: no code fences,
 * inline code, links, emphasis, or heading markers in the sidebar. */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[#>*_~-]{1,3}\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}
