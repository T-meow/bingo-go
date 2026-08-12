// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import Markdown from 'react-markdown'
import { describe, expect, it } from 'vitest'
import { AssistantMarkdown, isSafeMarkdownImageUrl } from './features/chat/ChatPage'

describe('safe Markdown rendering', () => {
  it('renders Markdown while preventing raw HTML and dangerous links', () => {
    const markdown = '# Heading\n\n- item\n\n**bold** `code`\n\n```js\nconst safe = true\n```\n\n<script>window.__pwned = true</script>\n<img src=x onerror="window.__pwned = true">\n[jump](javascript:window.__pwned=true)'
    const { container } = render(<Markdown skipHtml>{markdown}</Markdown>)
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeTruthy()
    expect(screen.getByText('item')).toBeTruthy()
    expect(screen.getByText('bold')).toBeTruthy()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')?.getAttribute('href') ?? null).toBeNull()
    expect((window as typeof window & { __pwned?: boolean }).__pwned).not.toBe(true)
  })

  it('loads only complete HTTPS Markdown images', () => {
    expect(isSafeMarkdownImageUrl('https://images.example.test/chart.png')).toBe(true)
    expect(isSafeMarkdownImageUrl('http://images.example.test/chart.png')).toBe(false)
    expect(isSafeMarkdownImageUrl('file:///tmp/chart.png')).toBe(false)
    expect(isSafeMarkdownImageUrl('data:image/png;base64,aA==')).toBe(false)

    const rendered = render(<AssistantMarkdown markdown="![chart](https://images.example.test/chart" />)
    expect(rendered.container.querySelector('img')).toBeNull()
    rendered.rerender(<AssistantMarkdown markdown="![chart](https://images.example.test/chart.png)" />)
    expect(rendered.container.querySelector('img')?.getAttribute('src')).toBe('https://images.example.test/chart.png')
    rendered.rerender(<AssistantMarkdown markdown="![chart](http://images.example.test/chart.png)" />)
    expect(rendered.container.querySelector('img')).toBeNull()
  })
})
