import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

export type SessionSummary = { id: string; name: string; preview: string; updatedAt: string; messageCount: number }
export type HistoryAttachment = { id: string; mediaType: 'image/png' | 'image/jpeg'; dataUrl: string }
export type HistoryItem = {
  type: 'message'
  value: { id: string; role: 'user' | 'assistant'; markdown: string; attachments?: HistoryAttachment[] }
}
export type SessionListOutput = { sessions: SessionSummary[]; warnings: string[] }

const MAX_HISTORY_IMAGE_BASE64 = 5 * 1024 * 1024

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
      const parsed = this.parse(await readFile(path, 'utf8'), id)
      warnings.push(...parsed.warnings)
      const firstUser = parsed.messages.find((m) => m.value.role === 'user')?.value
      const title = id.includes('--')
        ? displayName(id)
        : firstUser?.markdown
          ? stripMarkdown(firstUser.markdown).slice(0, 60)
          : firstUser?.attachments?.length
            ? '图片对话'
            : 'New conversation'
      const lastMessage = parsed.messages.at(-1)?.value
      const preview = lastMessage?.markdown
        ? stripMarkdown(lastMessage.markdown).replace(/\s+/g, ' ').trim().slice(0, 120)
        : lastMessage?.attachments?.length
          ? `${lastMessage.attachments.length} 张图片`
          : ''
      return { id, name: title, preview, updatedAt: metadata.mtime.toISOString(), messageCount: parsed.messages.length }
    }))
    return { sessions, warnings }
  }

  async load(sessionId: string): Promise<{ history: HistoryItem[]; warnings: string[] }> {
    if (!validSessionId(sessionId)) throw new Error('Invalid session ID')
    return this.parse(await readFile(join(this.directory, `${sessionId}.jsonl`), 'utf8'), sessionId)
  }

  private parse(source: string, sessionId: string): { messages: HistoryItem[]; history: HistoryItem[]; warnings: string[] } {
    const messages: HistoryItem[] = []
    const warnings: string[] = []
    source.split('\n').forEach((line, index) => {
      if (!line.trim()) return
      try {
        const raw = JSON.parse(line) as { role?: unknown; content?: unknown }
        if (raw.role !== 'user' && raw.role !== 'assistant') return
        const attachments = imageContent(raw.content, `${sessionId}:${index + 1}`)
        const text = textContent(raw.content)
        const markdown = raw.role === 'user' ? stripTrailingImageMarkers(text, attachments.length) : text
        if (!markdown && attachments.length === 0) return
        messages.push({
          type: 'message',
          value: {
            id: `${sessionId}:${index + 1}`,
            role: raw.role,
            markdown,
            ...(attachments.length > 0 ? { attachments } : {})
          }
        })
      } catch { warnings.push(`${sessionId}: skipped corrupt line ${index + 1}`) }
    })
    return { messages, history: messages, warnings }
  }
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
function displayName(id: string): string { const marker = id.lastIndexOf('--'); return marker >= 0 ? id.slice(marker + 2) : 'New conversation' }

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
