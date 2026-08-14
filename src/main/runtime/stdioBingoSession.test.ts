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

  it('round-trips bingo-owned session forks without switching the source process', async () => {
    const childId = 'session-child'
    const binary = await fixture(`#!/usr/bin/env node
let seq=1, id=${JSON.stringify(sessionId)}
const metadata={bingoVersion:'1.0',protocolVersion:1,sessionId:id,displayName:'Source',transcriptPath:'/tmp/source',resumed:true,cwd:process.cwd(),provider:'default',model:'test',thinkingLevel:'off',permissionMode:'default',theme:'auto',supportsImages:false,capabilities:['session.fork.v1'],transcriptRevision:'${'a'.repeat(64)}'}
console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.ready',metadata}))
let buffer=''; process.stdin.on('data', chunk => { buffer += chunk; let i; while ((i=buffer.indexOf('\\n')) >= 0) { const line=buffer.slice(0,i); buffer=buffer.slice(i+1); if (!line) continue; const c=JSON.parse(line); if(c.type==='session.fork'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.forked',commandId:c.commandId,sourceSessionId:id,reason:c.reason,metadata:{...metadata,sessionId:${JSON.stringify(childId)},displayName:'Branch',transcriptPath:'/tmp/child',parentSessionId:id,forkReason:c.reason},warnings:['repaired 1 interrupted tool call(s)']})); } else if(c.type==='session.close'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.closed',commandId:c.commandId})); process.exit(0); } } })
`)
    const session = new StdioBingoSession(binary, process.cwd(), { onEvent: vi.fn(), onExit: vi.fn() })
    await session.open(sessionId)

    await expect(session.fork('recover-interrupted')).resolves.toMatchObject({
      sourceSessionId: sessionId,
      reason: 'recover-interrupted',
      metadata: { sessionId: childId, parentSessionId: sessionId, forkReason: 'recover-interrupted' },
      warnings: ['repaired 1 interrupted tool call(s)']
    })
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

  it('subscribes to context usage and enables explicit workspace binding', async () => {
    const binary = await fixture(`#!/usr/bin/env node
let seq=1, id=${JSON.stringify(sessionId)}
if (!process.argv.includes('--bind-session-workspace')) process.exit(9)
console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.ready',metadata:{bingoVersion:'1.0',protocolVersion:1,sessionId:id,displayName:'Context',transcriptPath:'/tmp/context',resumed:true,cwd:process.cwd(),provider:'default',model:'test',thinkingLevel:'off',permissionMode:'default',theme:'auto',supportsImages:false,capabilities:['session.context.v1','session.workspace.v1']}}))
process.stdin.on('data', data => { for (const line of data.toString().trim().split('\\n')) { const c=JSON.parse(line); if(c.type==='context.subscribe') console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'context.usage',commandId:c.commandId,usedTokens:420,contextWindow:128000})); else if(c.type==='session.close'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.closed',commandId:c.commandId})); process.exit(0); } } })
`)
    const session = new StdioBingoSession(binary, process.cwd(), { onEvent: vi.fn(), onExit: vi.fn() }, process.env, true)

    await session.open(sessionId)
    await expect(session.subscribeContext()).resolves.toEqual({ usedTokens: 420, contextWindow: 128_000 })
    await session.close()
  })

  it('round-trips Team workspace snapshots and saves through command responses', async () => {
    const definition: TeamDefinition = {
      schemaVersion: 2,
      teamId: 'team-reviewers',
      name: 'reviewers',
      members: [{
        memberId: 'member-reviewer',
        name: 'reviewer',
        agent: 'reviewer',
        profile: { constraints: [], preferences: [] }
      }]
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

  it('round-trips team-task commands and forwards commandless task messages', async () => {
    const member = { memberId: 'member-reviewer', name: 'reviewer', agent: 'reviewer', description: 'Reviews code', system: 'Review.', inheritSystem: true, profile: { constraints: [], preferences: [] }, team: 'reviewers', directory: '/tmp' }
    const summary = { id: 'task-1', title: 'Review', status: 'running', participants: [member], leader: 'reviewer', projectPath: '/tmp', branch: 'main', createdAt: 1, updatedAt: 1, messageCount: 1, reviewSummary: null }
    const task = { schemaVersion: 1, ...summary, projectKey: 'project', team: 'reviewers', description: 'Review changes', channel: '__task_task-1', messages: [{ seq: 1, kind: 'user', from: 'user', text: 'Review changes', at: 1 }] }
    delete (task as Partial<typeof summary>).messageCount
    delete (task as Partial<typeof summary>).reviewSummary
    const binary = await fixture([
      'let seq=1, id=' + JSON.stringify(sessionId),
      'const summary=' + JSON.stringify(summary),
      'const task=' + JSON.stringify(task),
      "console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.ready',metadata:{bingoVersion:'1.0',protocolVersion:1,sessionId:id,displayName:'Tasks',transcriptPath:'/tmp/tasks',resumed:false,cwd:process.cwd(),provider:'default',model:'test',thinkingLevel:'off',permissionMode:'default',theme:'auto',supportsImages:false,capabilities:['team.workspace.v1','team.tasks.v1']}}))",
      "let buffer=''; process.stdin.on('data', chunk => { buffer += chunk; let i; while ((i=buffer.indexOf('\\n')) >= 0) { const line=buffer.slice(0,i); buffer=buffer.slice(i+1); if (!line) continue; const c=JSON.parse(line); if(c.type==='team.task.list'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'team.task.message',taskId:'task-1',message:{seq:2,kind:'member',from:'reviewer',text:'Working',at:2}})); console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'team.tasks.snapshot',commandId:c.commandId,branch:'main',tasks:[summary]})); } else if(c.type==='team.task.get'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'team.task.updated',commandId:c.commandId,action:'loaded',task:summary,detail:task})); } else if(c.type==='team.task.post'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'team.task.updated',commandId:c.commandId,action:'posted',task:{...summary,messageCount:2}})); } else if(c.type==='session.close'){ console.log(JSON.stringify({protocolVersion:1,seq:seq++,sessionId:id,type:'session.closed',commandId:c.commandId})); process.exit(0); } } })"
    ].join('\n'))
    const events = vi.fn()
    const session = new StdioBingoSession(binary, process.cwd(), { onEvent: events, onExit: vi.fn() })

    await session.open()
    await expect(session.listTeamTasks()).resolves.toEqual({ branch: 'main', tasks: [summary] })
    await vi.waitFor(() => expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'team.task.message', taskId: 'task-1' })))
    await expect(session.getTeamTask('task-1', undefined, 100)).resolves.toMatchObject({ id: 'task-1', messages: [{ seq: 1 }] })
    await expect(session.postTeamTask('task-1', 'Continue')).resolves.toMatchObject({ id: 'task-1', messageCount: 2 })
    await session.close()
  })
})
