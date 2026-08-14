import { describe, expect, it } from 'vitest'
import type { TeamTask, TeamTaskSummary } from '../../../shared/contracts/cli'
import { initialTeamState, teamReducer } from './teamReducer'

const member = { memberId: 'member-reviewer', name: 'reviewer', agent: 'reviewer', description: '', system: 'Review.', inheritSystem: true, profile: { constraints: [], preferences: [] }, team: 'core', directory: '/workspace' }
const summary: TeamTaskSummary = {
  id: 'task-1', title: 'Review', status: 'running', participants: [member], leader: 'reviewer', projectPath: '/workspace', branch: 'main',
  createdAt: 1, updatedAt: 1, messageCount: 1, reviewSummary: null
}
const detail: TeamTask = {
  schemaVersion: 1, id: 'task-1', projectKey: 'project', projectPath: '/workspace', branch: 'main', team: 'core', title: 'Review',
  description: 'Review changes', status: 'running', participants: [member], leader: 'reviewer', channel: '__task_1', createdAt: 1, updatedAt: 1,
  messages: [{ seq: 1, kind: 'user', from: 'user', text: 'Review changes', at: 1 }]
}

describe('teamReducer', () => {
  it('merges task messages by task and sequence without duplicates', () => {
    let state = teamReducer(initialTeamState, { type: 'tasks', branch: 'main', tasks: [summary] })
    state = teamReducer(state, { type: 'task-detail', task: detail })
    state = teamReducer(state, { type: 'task-message', taskId: 'task-1', message: { seq: 2, kind: 'member', from: 'reviewer', text: 'Done', at: 2 } })
    state = teamReducer(state, { type: 'task-message', taskId: 'task-1', message: { seq: 2, kind: 'member', from: 'reviewer', text: 'Done', at: 2 } })
    expect(state.taskDetails['task-1'].messages.map((message) => message.seq)).toEqual([1, 2])
    expect(state.tasks[0].messageCount).toBe(2)
  })

  it('prepends an older page while preserving newer messages', () => {
    const newer = { ...detail, messages: [{ seq: 3, kind: 'member' as const, from: 'reviewer', text: 'Latest', at: 3 }] }
    const older = { ...detail, messages: [{ seq: 1, kind: 'user' as const, from: 'user', text: 'Start', at: 1 }, { seq: 2, kind: 'member' as const, from: 'reviewer', text: 'Working', at: 2 }] }
    let state = teamReducer(initialTeamState, { type: 'task-detail', task: newer })
    state = teamReducer(state, { type: 'task-detail', task: older })
    expect(state.taskDetails['task-1'].messages.map((message) => message.seq)).toEqual([1, 2, 3])
  })

  it('keeps an async message that arrives before the task detail', () => {
    const asyncMessage = { seq: 2, kind: 'member' as const, from: 'reviewer', text: 'Ready', at: 2 }
    let state = teamReducer(initialTeamState, { type: 'tasks', branch: 'main', tasks: [summary] })
    state = teamReducer(state, { type: 'task-message', taskId: 'task-1', message: asyncMessage })
    state = teamReducer(state, { type: 'task-message', taskId: 'task-1', message: asyncMessage })
    state = teamReducer(state, { type: 'task-detail', task: detail })

    expect(state.taskDetails['task-1'].messages.map((message) => message.seq)).toEqual([1, 2])
    expect(state.pendingTaskMessages['task-1']).toBeUndefined()
  })

  it('merges lobby pages and async events by lobby sequence', () => {
    const lobby = {
      schemaVersion: 1 as const,
      id: 'lobby-project',
      projectKey: 'project',
      projectPath: '/workspace',
      branch: 'main',
      messages: [{ seq: 3, kind: 'member' as const, from: 'reviewer', targets: [], text: 'Latest', at: 3 }]
    }
    let state = teamReducer(initialTeamState, { type: 'lobby', lobby })
    state = teamReducer(state, { type: 'lobby-message', message: { seq: 4, kind: 'system', targets: [], text: 'Busy member skipped', at: 4 } })
    state = teamReducer(state, { type: 'lobby-message', message: { seq: 4, kind: 'system', targets: [], text: 'Busy member skipped', at: 4 } })
    state = teamReducer(state, { type: 'lobby', lobby: { ...lobby, messages: [
      { seq: 1, kind: 'user', from: 'user', targets: [], text: 'Start', at: 1 },
      { seq: 2, kind: 'member', from: 'lead', targets: [], text: 'Working', at: 2 }
    ] } })

    expect(state.lobby?.messages.map((message) => message.seq)).toEqual([1, 2, 3, 4])
    expect(state.selection).toEqual({ kind: 'lobby', id: 'lobby-project' })
  })

  it('normalizes selected lobby context sequences', () => {
    const state = teamReducer(initialTeamState, { type: 'lobby-selection', seqs: [3, 1, 3, 2] })
    expect(state.selectedLobbyMessageSeqs).toEqual([1, 2, 3])
  })
})
