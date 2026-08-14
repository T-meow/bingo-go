export const DEFAULT_CONVERSATION_TITLE = '新对话'
export const IMAGE_CONVERSATION_TITLE = '图片对话'
export const MAX_CONVERSATION_TITLE_LENGTH = 60

export type ConversationTitleSource = {
  manualTitle?: string | null
  text?: string | null
  hasAttachments?: boolean
}

export function conversationTitle(source: ConversationTitleSource): string {
  const manualTitle = source.manualTitle?.trim()
  if (manualTitle) return manualTitle
  const normalized = normalizeConversationTitleText(source.text ?? '')
  if (normalized) return truncateConversationTitle(normalized)
  return source.hasAttachments ? IMAGE_CONVERSATION_TITLE : DEFAULT_CONVERSATION_TITLE
}

export function normalizeConversationTitleText(text: string): string {
  return text
    .replace(/^\s*(?:```|~~~).*$/gm, ' ')
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/^\s*(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^\s*#{1,6}\s*$/gm, ' ')
    .replace(/(^|\s)[*_~]+|[*_~]+(?=\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function manualConversationTitle(sessionId: string): string | null {
  const marker = sessionId.lastIndexOf('--')
  if (marker < 0) return null
  const title = sessionId.slice(marker + 2).trim()
  return title || null
}

export function conversationTitleLength(value: string): number {
  return graphemes(value).length
}

export function truncateConversationTitle(value: string, maximum = MAX_CONVERSATION_TITLE_LENGTH): string {
  return graphemes(value).slice(0, maximum).join('')
}

function graphemes(value: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(value), (entry) => entry.segment)
}
