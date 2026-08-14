import { describe, expect, it } from 'vitest'
import {
  conversationTitle,
  conversationTitleLength,
  DEFAULT_CONVERSATION_TITLE,
  IMAGE_CONVERSATION_TITLE,
  manualConversationTitle,
  normalizeConversationTitleText
} from './conversationTitle'

describe('conversationTitle', () => {
  it('normalizes Chinese, English, Markdown, code, links, and whitespace', () => {
    expect(conversationTitle({ text: '  ## 检查 **Bingo Go**\n\n是否可用  ' })).toBe('检查 Bingo Go 是否可用')
    expect(conversationTitle({ text: 'Use [`npm test`](https://example.test) and `tsc`' })).toBe('Use npm test and tsc')
    expect(normalizeConversationTitleText('```ts\nconst value = 1\n```')).toBe('const value = 1')
  })

  it('uses image and empty fallbacks', () => {
    expect(conversationTitle({ text: '', hasAttachments: true })).toBe(IMAGE_CONVERSATION_TITLE)
    expect(conversationTitle({ text: ' \n ' })).toBe(DEFAULT_CONVERSATION_TITLE)
    expect(conversationTitle({ text: '---\n\n###' })).toBe(DEFAULT_CONVERSATION_TITLE)
  })

  it('truncates at 60 graphemes without splitting emoji', () => {
    const family = '👨‍👩‍👧‍👦'
    const title = conversationTitle({ text: `${'a'.repeat(59)}${family}tail` })
    expect(conversationTitleLength(title)).toBe(60)
    expect(title.endsWith(family)).toBe(true)
  })

  it('keeps a manual name ahead of generated content', () => {
    expect(manualConversationTitle('project-1--Release_review')).toBe('Release_review')
    expect(conversationTitle({ manualTitle: '手工名称', text: '自动标题' })).toBe('手工名称')
    expect(conversationTitle({ manualTitle: 'm'.repeat(80), text: '自动标题' })).toHaveLength(80)
  })
})
