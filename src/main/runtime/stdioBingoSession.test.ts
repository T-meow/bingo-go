import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import type { TeamDefinition, TeamSnapshot } from '../../shared/contracts/cli'
import { StdioBingoSession } from './stdioBingoSession'

const sessionId = 'session-1'
const turnId = '123e4567-e89b-42d3-a456-426614174000'

async function fixture(source: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bingo-go-session-'))
  const path = join(directory, 'fake-bingo.mjs')
  await writeFile(path, source)
  await chmod(path, 0o755)
  return path
}

describe('StdioBingoSession', () => {
  it('parses split lines and writes validated commands', async () => {
    const binary = await fixture(`#!/usr/bin/env node
const ready = JSON.stringify({protocolVersion:1,seq:1,sessionId:${JSON.stringify(sessionId)},type:'session.ready',metadata:{bingoVersion:'1.0',protocolVersion:1,sessionId:${JSON.stringify(sessionId)},displayName:'Test',transcriptPath:'/tmp/test',resumed:false,cwd:process.cwd(),provider:'default',model:'test',thinkingLevel:'off',permissionMode:'default',theme:'auto',supportsImages:false}})+'\\n'
process.stdout.write(ready.slice(0, 30)); setTimeout(() => process.stdout.write(ready.slice(30)), 5)
process.stdin.once('data', data => { const c=JSON.parse(data); process.stdout.write(JSON.stringify({protocolVersion:1,seq:2,sessionId:${JSON.stringify(sessionId)},type:'turn.started',commandId:c.commandId,turnId:c.turnId})+'\\n') })
`)
    const events = vi.fn()
    const session = new StdioBingoSession(binary, process.cwd(), { onEvent: events, onExit: vi.fn() })
    await expect(session.open()).resolves.toMatchObject({ sessionId })
    await session.sendTurn(turnId, 'hello')
    await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(2))
  })

  it('closes on sequence gaps', async () => {
    const binary = await fixture(`#!/usr/bin/env node
console.log(JSON.stringify({protocolVersion:1,seq:2,sessionId:null,type:'warning',msg:'gap'})); setTimeout(()=>{}, 1000)
`)
    const onExit = vi.fn()
    const session = new StdioBingoSession(binary, process.cwd(), { onEvent: vi.fn(), onExit })
    await expect(session.open()).rejects.toThrow('sequence mismatch')
    expect(onExit).toHaveBeenCalled()
  })

  it('accepts opaque prompt IDs emitted by bingo', async () => {
    const binary = await fixture(`#!/usr/bin/env node
let seq=1, id=${JSON.stringify(sessionId)}
console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.ready',metadata:{bingoVersion:'1.0',protocolVersion:1,sessionId:id,displayName:'Test',transcriptPath:'/tmp/test',resumed:false,cwd:process.cwd(),provider:'default',model:'test',thinkingLevel:'off',permissionMode:'default',theme:'auto',supportsImages:false}}))
let buffer=''; process.stdin.on('data', chunk => { buffer += chunk; let i; while ((i=buffer.indexOf('\\n')) >= 0) { const line=buffer.slice(0,i); buffer=buffer.slice(i+1); if (!line) continue; const c=JSON.parse(line); if(c.type==='turn.start'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'turn.started',commandId:c.commandId,turnId:c.turnId})); console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'prompt.request',turnId:c.turnId,promptId:'prompt-1',kind:'permission',title:'Allow running Bash',question:'Bash needs permission',options:[{id:'allow',label:'Allow'}],allowFreeText:false})); } else if(c.type==='prompt.respond'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'prompt.resolved',turnId:c.turnId,promptId:c.promptId,commandId:c.commandId,reason:'responded'})); } else if(c.type==='session.close'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.closed',commandId:c.commandId})); process.exit(0); } } })
`)
    const events = vi.fn()
    const onExit = vi.fn()
    const session = new StdioBingoSession(binary, process.cwd(), { onEvent: events, onExit })
    await session.open()
    await session.sendTurn(turnId, 'inspect')
    await vi.waitFor(() => expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'prompt.request', promptId: 'prompt-1' })))
    await session.respondToPrompt(turnId, 'prompt-1', { kind: 'option', optionId: 'allow' })
    await vi.waitFor(() => expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'prompt.resolved', promptId: 'prompt-1' })))
    expect(onExit).not.toHaveBeenCalled()
    await session.close()
  })

  it('waits for bingo-owned rename and delete responses', async () => {
    const binary = await fixture(`#!/usr/bin/env node
let seq=1, id=${JSON.stringify(sessionId)}
console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.ready',metadata:{bingoVersion:'1.0',protocolVersion:1,sessionId:id,displayName:'Test',transcriptPath:'/tmp/test',resumed:true,cwd:process.cwd(),provider:'default',model:'test',thinkingLevel:'off',permissionMode:'default',theme:'auto',supportsImages:false}}))
let buffer=''; process.stdin.on('data', chunk => { buffer += chunk; let i; while ((i=buffer.indexOf('\\n')) >= 0) { const line=buffer.slice(0,i); buffer=buffer.slice(i+1); if (!line) continue; const c=JSON.parse(line); if(c.type==='session.rename'){ const previous=id; id=id+'--Renamed'; console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.renamed',commandId:c.commandId,previousSessionId:previous,metadata:{bingoVersion:'1.0',protocolVersion:1,sessionId:id,displayName:'Renamed',transcriptPath:'/tmp/renamed',resumed:true,cwd:process.cwd(),provider:'default',model:'test',thinkingLevel:'off',permissionMode:'default',theme:'auto',supportsImages:false}})); } else if(c.type==='session.delete'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.deleted',commandId:c.commandId,deletedSessionId:id})); process.exit(0); } } })
`)
    const session = new StdioBingoSession(binary, process.cwd(), { onEvent: vi.fn(), onExit: vi.fn() })
    await session.open(sessionId)
    await expect(session.rename('Renamed')).resolves.toMatchObject({ sessionId: `${sessionId}--Renamed` })
    await expect(session.delete()).resolves.toBe(`${sessionId}--Renamed`)
    await session.close()
  })

  it('registers an image before sending a turn', async () => {
    const binary = await fixture(`#!/usr/bin/env node
let seq=1, id=${JSON.stringify(sessionId)}
console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.ready',metadata:{bingoVersion:'1.0',protocolVersion:1,sessionId:id,displayName:'Images',transcriptPath:'/tmp/images',resumed:false,cwd:process.cwd(),provider:'default',model:'test',thinkingLevel:'off',permissionMode:'default',theme:'auto',supportsImages:true,capabilities:['attachments.input.v1']}}))
let buffer=''; process.stdin.on('data', chunk => { buffer += chunk; let i; while ((i=buffer.indexOf('\\n')) >= 0) { const line=buffer.slice(0,i); buffer=buffer.slice(i+1); if (!line) continue; const c=JSON.parse(line); if(c.type==='attachment.add'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'attachment.ready',commandId:c.commandId,attachmentId:c.attachmentId,marker:'#[image 1]',mediaType:'image/png'})); } else if(c.type==='session.close'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.closed',commandId:c.commandId})); process.exit(0); } } })
`)
    const session = new StdioBingoSession(binary, process.cwd(), { onEvent: vi.fn(), onExit: vi.fn() })
    await session.open()
    await expect(session.addAttachment('image-1', 'aA==')).resolves.toEqual({ attachmentId: 'image-1', marker: '#[image 1]', mediaType: 'image/png' })
    await session.close()
  })

  it('round-trips Team workspace snapshots and saves through command responses', async () => {
    const definition: TeamDefinition = {
      schemaVersion: 1,
      name: 'reviewers',
      members: [{ name: 'reviewer', agent: 'reviewer' }]
    }
    const snapshot: TeamSnapshot = {
      available: true,
      path: '/tmp/.bingo/team.json',
      revision: 'a'.repeat(64),
      branch: 'main',
      validation: null,
      definition,
      agentDefinitions: [{ name: 'reviewer', description: 'Reviews code', source: 'project' }],
      avatars: [],
      members: [{ name: 'reviewer', agent: 'reviewer', status: 'offline', pending: 0, unacked: 0, model: '', provider: '' }],
      channels: []
    }
    const binary = await fixture([
      'let seq=1, id=' + JSON.stringify(sessionId),
      'let snapshot=' + JSON.stringify(snapshot),
      "console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.ready',metadata:{bingoVersion:'1.0',protocolVersion:1,sessionId:id,displayName:'Team',transcriptPath:'/tmp/team',resumed:false,cwd:process.cwd(),provider:'default',model:'test',thinkingLevel:'off',permissionMode:'default',theme:'auto',supportsImages:false,capabilities:['team.workspace.v1']}}))",
      "let buffer=''; process.stdin.on('data', chunk => { buffer += chunk; let i; while ((i=buffer.indexOf('\\n')) >= 0) { const line=buffer.slice(0,i); buffer=buffer.slice(i+1); if (!line) continue; const c=JSON.parse(line); if(c.type==='team.refresh'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'team.snapshot',commandId:c.commandId,snapshot})); } else if(c.type==='team.save'){ snapshot={...snapshot,definition:c.definition,revision:'b'.repeat(64)}; console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'team.updated',commandId:c.commandId,action:'saved',msg:'saved',snapshot})); } else if(c.type==='session.close'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.closed',commandId:c.commandId})); process.exit(0); } } })"
    ].join('\n'))
    const session = new StdioBingoSession(binary, process.cwd(), { onEvent: vi.fn(), onExit: vi.fn() })

    await session.open()
    await expect(session.readTeam()).resolves.toMatchObject({ available: true, definition: { name: 'reviewers' } })
    await expect(session.saveTeam('a'.repeat(64), { ...definition, futureField: { keep: true } })).resolves.toMatchObject({
      revision: 'b'.repeat(64),
      definition: { futureField: { keep: true } }
    })
    await session.close()
  })
})
