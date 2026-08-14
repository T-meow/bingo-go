import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { TranscriptRepository } from './transcriptRepository'

describe('TranscriptRepository', () => {
  it('lists newest first, projects messages, and warns on corrupt lines', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-transcripts-')); await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'older.jsonl'), `${JSON.stringify({ role: 'user', content: [{ type: 'text', text: 'old' }] })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await writeFile(join(directory, 'newer--Named.jsonl'), `${JSON.stringify({ role: 'user', content: [{ type: 'text', text: 'hello' }] })}\nnot-json\n${JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'final  answer' }] })}\n`)
    const result = await new TranscriptRepository(directory).list()
    expect(result.sessions.map((session) => session.id)).toEqual(['newer--Named', 'older'])
    expect(result.sessions[0]).toMatchObject({ name: 'Named', preview: 'final answer', messageCount: 2, workspacePath: null })
    expect(result.warnings).toHaveLength(1)
  })

  it('rejects path-like session IDs', async () => {
    const repository = new TranscriptRepository('/tmp')
    await expect(repository.load('../secret')).rejects.toThrow('Invalid session ID')
  })

  it('titles a session from its first user message and strips markdown from previews', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bingo-go-summary-'))
    await writeFile(join(dir, 'demo-1.jsonl'), [
      JSON.stringify({ role: 'user', content: [{ type: 'text', text: '**First question** about X' }] }),
      JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'Answer with `inline` code.' }] }),
    ].join('\n'))
    const repo = new TranscriptRepository(dir)
    const { sessions } = await repo.list()
    expect(sessions[0].name).toBe('First question about X')
    expect(sessions[0].preview).toBe('Answer with inline code.')
  })

  it('uses an image fallback and keeps a manual transcript name ahead of the first prompt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bingo-go-title-priority-'))
    const imageMessage = JSON.stringify({ role: 'user', content: [{ type: 'image', source: { media_type: 'image/png', data: 'aA==' } }] })
    const namedMessage = JSON.stringify({ role: 'user', content: [{ type: 'text', text: '应被手工名称覆盖' }] })
    await writeFile(join(dir, 'image-only.jsonl'), `${imageMessage}\n`)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await writeFile(join(dir, 'named--Manual_title.jsonl'), `${namedMessage}\n`)

    const { sessions } = await new TranscriptRepository(dir).list()

    expect(sessions.find((session) => session.id === 'image-only')?.name).toBe('图片对话')
    expect(sessions.find((session) => session.id === 'named--Manual_title')?.name).toBe('Manual_title')
  })

  it('restores image blocks and removes only matching trailing GUI markers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bingo-go-images-'))
    const source = {
      role: 'user',
      content: [
        { type: 'text', text: '看看这个\n\n#[image 7]' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aA==' } }
      ]
    }
    await writeFile(join(dir, 'images.jsonl'), `${JSON.stringify(source)}\n`)
    const { history } = await new TranscriptRepository(dir).load('images')
    expect(history[0]).toMatchObject({ type: 'message', value: { markdown: '看看这个', attachments: [{ mediaType: 'image/png', dataUrl: 'data:image/png;base64,aA==' }] } })
  })

  it('removes multiple GUI markers separated by blank lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bingo-go-images-'))
    await writeFile(join(dir, 'images.jsonl'), `${JSON.stringify({
      role: 'user',
      content: [
        { type: 'text', text: '比较图片\n\n#[image 2]\n\n#[image 3]' },
        { type: 'image', source: { media_type: 'image/png', data: 'aA==' } },
        { type: 'image', source: { media_type: 'image/jpeg', data: 'aA==' } }
      ]
    })}\n`)
    const { history } = await new TranscriptRepository(dir).load('images')
    expect(history[0]).toMatchObject({ type: 'message', value: { markdown: '比较图片' } })
    expect(history[0]?.type === 'message' ? history[0].value.attachments : []).toHaveLength(2)
  })

  it('does not remove marker-looking assistant text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bingo-go-images-'))
    await writeFile(join(dir, 'assistant.jsonl'), `${JSON.stringify({
      role: 'assistant',
      content: [
        { type: 'text', text: '引用 #[image 4]' },
        { type: 'image', source: { media_type: 'image/png', data: 'aA==' } }
      ]
    })}\n`)
    const { history } = await new TranscriptRepository(dir).load('assistant')
    expect(history[0]).toMatchObject({ type: 'message', value: { markdown: '引用 #[image 4]' } })
  })

  it('restores tool calls in transcript order and pairs their results', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bingo-go-tools-'))
    await writeFile(join(dir, 'tools.jsonl'), [
      JSON.stringify({ role: 'user', content: [{ type: 'text', text: '检查项目' }] }),
      JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: '我先查看文件。' }, { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'Get-ChildItem -Force' } }] }),
      JSON.stringify({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: [{ type: 'text', text: 'README.md' }], is_error: false }] }),
      JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: '检查完成。' }] })
    ].join('\n'))

    const { history, warnings } = await new TranscriptRepository(dir).load('tools')

    expect(warnings).toEqual([])
    expect(history).toMatchObject([
      { type: 'message', value: { role: 'user', markdown: '检查项目' } },
      { type: 'message', value: { role: 'assistant', markdown: '我先查看文件。' } },
      { type: 'tool', value: { id: 'tool-1', name: 'Bash', summary: 'Get-ChildItem -Force', status: 'done', output: 'README.md' } },
      { type: 'message', value: { role: 'assistant', markdown: '检查完成。' } }
    ])
  })

  it('marks an unanswered or interrupted transcript tool as interrupted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bingo-go-tools-'))
    await writeFile(join(dir, 'tools.jsonl'), [
      JSON.stringify({ role: 'assistant', content: [{ type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'long-task' } }, { type: 'tool_use', id: 'tool-2', name: 'Read', input: { path: 'README.md' } }, { type: 'tool_use', id: 'tool-3', name: 'Read', input: { path: 'package.json' } }] }),
      JSON.stringify({ role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'tool-1', content: '<tool_use_error>interrupted by the user before this tool produced a result</tool_use_error>', is_error: true },
        { type: 'tool_result', tool_use_id: 'tool-3', content: '<tool_use_error>interrupted by a runtime failure before this tool produced a result</tool_use_error>', is_error: true }
      ] })
    ].join('\n'))

    const { history } = await new TranscriptRepository(dir).load('tools')
    expect(history.filter((item) => item.type === 'tool').map((item) => item.value.status)).toEqual(['interrupted', 'interrupted', 'interrupted'])
  })

  it('uses the last valid workspace record while preserving physical message lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bingo-go-workspaces-'))
    const first = join(dir, 'first-project')
    const second = join(dir, 'second-project')
    await writeFile(join(dir, 'workspace.jsonl'), [
      JSON.stringify({ type: 'session', schemaVersion: 1, cwd: first }),
      JSON.stringify({ role: 'user', content: [{ type: 'text', text: 'first' }] }),
      JSON.stringify({ type: 'session', schemaVersion: 2, cwd: 'relative' }),
      JSON.stringify({ type: 'session', schemaVersion: 1, cwd: second }),
      JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'last' }] })
    ].join('\n'))
    await writeFile(join(dir, 'workspace.turns.json'), JSON.stringify({
      schemaVersion: 1,
      transcriptRevision: 'a'.repeat(64),
      turns: [{ turnId: 'turn-1', promptLine: 2, status: 'completed', contentRevision: 'b'.repeat(64) }]
    }))

    const loaded = await new TranscriptRepository(dir).load('workspace')

    expect(loaded.workspacePath).toBe(second)
    expect(loaded.warnings).toEqual(['workspace: ignored invalid session metadata on line 3'])
    expect(loaded.history[0]).toMatchObject({ type: 'message', value: { id: 'workspace:2', turnId: 'turn-1', origin: 'prompt' } })
    expect(loaded.history[1]).toMatchObject({ type: 'message', value: { id: 'workspace:5' } })
  })

  it('marks only the final indexed prompt editable and exposes branch metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bingo-go-turn-index-'))
    const sessionId = 'child-session'
    await writeFile(join(dir, `${sessionId}.jsonl`), [
      JSON.stringify({ type: 'session', schemaVersion: 1, cwd: dir }),
      JSON.stringify({ role: 'user', content: [{ type: 'text', text: 'first prompt' }] }),
      JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'first answer' }] }),
      JSON.stringify({ role: 'user', content: [{ type: 'text', text: 'last prompt' }] }),
      JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'last answer' }] })
    ].join('\n'))
    await writeFile(join(dir, `${sessionId}.turns.json`), JSON.stringify({
      schemaVersion: 1,
      transcriptRevision: 'a'.repeat(64),
      parentSessionId: 'source-session',
      forkReason: 'edit-last-prompt',
      turns: [
        { turnId: 'turn-1', promptLine: 2, status: 'completed', contentRevision: 'b'.repeat(64) },
        { turnId: 'turn-2', promptLine: 4, status: 'cancelled', contentRevision: 'c'.repeat(64) }
      ]
    }))
    const repository = new TranscriptRepository(dir)

    const { history } = await repository.load(sessionId)
    const prompts = history.filter((item) => item.type === 'message' && item.value.role === 'user')
    const { sessions } = await repository.list()

    expect(prompts[0]).toMatchObject({ type: 'message', value: { turnId: 'turn-1', origin: 'prompt', revision: 'b'.repeat(64), turnStatus: 'completed' } })
    expect(prompts[0]?.type === 'message' ? prompts[0].value.editable : undefined).toBeUndefined()
    expect(prompts[1]).toMatchObject({ type: 'message', value: { turnId: 'turn-2', origin: 'prompt', editable: true, revision: 'c'.repeat(64), turnStatus: 'cancelled' } })
    expect(sessions[0]).toMatchObject({ id: sessionId, parentSessionId: 'source-session', forkReason: 'edit-last-prompt' })
  })

  it('does not guess an earlier edit point when the final indexed prompt is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bingo-go-turn-index-broken-'))
    await writeFile(join(dir, 'broken.jsonl'), [
      JSON.stringify({ role: 'user', content: [{ type: 'text', text: 'first prompt' }] }),
      JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'answer' }] })
    ].join('\n'))
    await writeFile(join(dir, 'broken.turns.json'), JSON.stringify({
      schemaVersion: 1,
      transcriptRevision: 'a'.repeat(64),
      turns: [
        { turnId: 'turn-1', promptLine: 1, status: 'completed', contentRevision: 'b'.repeat(64) },
        { turnId: 'turn-2', promptLine: 99, status: 'completed', contentRevision: 'c'.repeat(64) }
      ]
    }))

    const { history } = await new TranscriptRepository(dir).load('broken')

    expect(history.some((item) => item.type === 'message' && item.value.editable)).toBe(false)
  })
})
