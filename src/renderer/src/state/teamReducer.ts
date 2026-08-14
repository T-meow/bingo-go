import type {
  AgentDefinitionDocument,
  TeamSnapshot,
  TeamLobby,
  TeamLobbyMessage,
  TeamTask,
  TeamTaskMessage,
  TeamTaskSummary
} from '../../../shared/contracts/cli'

export type TeamSection = 'lobby' | 'tasks' | 'rooms' | 'roles'
export type TeamSelection =
  | { kind: 'lobby'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'channel'; id: string }
  | { kind: 'member'; id: string }
  | { kind: 'role'; id: string; scope: 'user' | 'project' }

export type TeamMemberRuntime = { status: 'running' | 'idle' | 'stopped' | 'offline'; taskId?: string }

export type TeamState = {
  snapshot: TeamSnapshot | null
  section: TeamSection
  selection: TeamSelection | null
  taskBranch: string
  tasks: TeamTaskSummary[]
  taskDetails: Record<string, TeamTask>
  pendingTaskMessages: Record<string, TeamTaskMessage[]>
  memberRuntime: Record<string, TeamMemberRuntime>
  definitions: AgentDefinitionDocument[]
  lobby: TeamLobby | null
  selectedLobbyMessageSeqs: number[]
}

export const initialTeamState: TeamState = {
  snapshot: null,
  section: 'lobby',
  selection: null,
  taskBranch: '',
  tasks: [],
  taskDetails: {},
  pendingTaskMessages: {},
  memberRuntime: {},
  definitions: [],
  lobby: null,
  selectedLobbyMessageSeqs: []
}

export type TeamAction =
  | { type: 'reset' }
  | { type: 'snapshot'; snapshot: TeamSnapshot }
  | { type: 'section'; section: TeamSection }
  | { type: 'select'; selection: TeamSelection | null }
  | { type: 'tasks'; branch: string; tasks: TeamTaskSummary[] }
  | { type: 'task-detail'; task: TeamTask }
  | { type: 'task-summary'; task: TeamTaskSummary }
  | { type: 'task-message'; taskId: string; message: TeamTaskMessage }
  | { type: 'channel-message'; channel: string; message: TeamSnapshot['channels'][number]['messages'][number] }
  | { type: 'member'; member: string; runtime: TeamMemberRuntime }
  | { type: 'definitions'; definitions: AgentDefinitionDocument[] }
  | { type: 'definition-upsert'; definition: AgentDefinitionDocument }
  | { type: 'definition-remove'; scope: 'user' | 'project'; id: string }
  | { type: 'lobby'; lobby: TeamLobby }
  | { type: 'lobby-message'; message: TeamLobbyMessage }
  | { type: 'lobby-selection'; seqs: number[] }

export function teamReducer(state: TeamState, action: TeamAction): TeamState {
  switch (action.type) {
    case 'reset':
      return initialTeamState
    case 'snapshot':
      return { ...state, snapshot: action.snapshot, selection: validSelection(state.selection, action.snapshot, state.tasks, state.definitions) }
    case 'lobby': {
      const messages = uniqueLobbyMessages([...(state.lobby?.messages ?? []), ...action.lobby.messages])
      return { ...state, lobby: { ...action.lobby, messages }, selection: state.selection ?? { kind: 'lobby', id: action.lobby.id } }
    }
    case 'lobby-message': {
      if (!state.lobby || state.lobby.messages.some((message) => message.seq === action.message.seq)) return state
      return { ...state, lobby: { ...state.lobby, messages: uniqueLobbyMessages([...state.lobby.messages, action.message]) } }
    }
    case 'lobby-selection':
      return { ...state, selectedLobbyMessageSeqs: [...new Set(action.seqs)].sort((left, right) => left - right) }
    case 'section': {
      if (action.section === state.section) return state
      return { ...state, section: action.section, selection: defaultSelection(action.section, state.snapshot, state.tasks, state.definitions) }
    }
    case 'select':
      return { ...state, selection: action.selection }
    case 'tasks': {
      const tasks = sortTasks(action.tasks)
      const selection = state.section === 'tasks'
        ? validSelection(state.selection, state.snapshot, tasks, state.definitions) ?? (tasks[0] ? { kind: 'task' as const, id: tasks[0].id } : null)
        : state.selection
      return { ...state, taskBranch: action.branch, tasks, selection }
    }
    case 'task-detail': {
      const current = state.taskDetails[action.task.id]
      const pending = state.pendingTaskMessages[action.task.id] ?? []
      const detail = mergeTaskDetail(current, { ...action.task, messages: [...action.task.messages, ...pending] })
      const tasks = upsertTask(state.tasks, summaryFromDetail(detail))
      const pendingTaskMessages = { ...state.pendingTaskMessages }
      delete pendingTaskMessages[action.task.id]
      return {
        ...state,
        tasks,
        taskDetails: { ...state.taskDetails, [detail.id]: detail },
        pendingTaskMessages,
        section: state.section,
        selection: state.selection ?? { kind: 'task', id: detail.id }
      }
    }
    case 'task-summary': {
      const current = state.taskDetails[action.task.id]
      return {
        ...state,
        tasks: upsertTask(state.tasks, action.task),
        taskDetails: current ? { ...state.taskDetails, [action.task.id]: applySummary(current, action.task) } : state.taskDetails
      }
    }
    case 'task-message': {
      const current = state.taskDetails[action.taskId]
      if (!current) return {
        ...state,
        pendingTaskMessages: {
          ...state.pendingTaskMessages,
          [action.taskId]: uniqueMessages([...(state.pendingTaskMessages[action.taskId] ?? []), action.message])
        },
        tasks: state.tasks.map((task) => task.id === action.taskId
          ? { ...task, messageCount: Math.max(task.messageCount, action.message.seq), updatedAt: Math.max(task.updatedAt, action.message.at) }
          : task)
      }
      if (current.messages.some((message) => message.seq === action.message.seq)) return state
      const messages = [...current.messages, action.message].sort((left, right) => left.seq - right.seq)
      const detail = { ...current, messages, updatedAt: Math.max(current.updatedAt, action.message.at) }
      const tasks = upsertTask(state.tasks, { ...summaryFromDetail(detail), messageCount: Math.max(summaryFromDetail(detail).messageCount, action.message.seq) })
      return { ...state, tasks, taskDetails: { ...state.taskDetails, [action.taskId]: detail } }
    }
    case 'channel-message': {
      if (!state.snapshot) return state
      return {
        ...state,
        snapshot: {
          ...state.snapshot,
          channels: state.snapshot.channels.map((channel) => channel.name === action.channel && !channel.messages.some((message) => message.seq === action.message.seq)
            ? { ...channel, seq: Math.max(channel.seq, action.message.seq), messages: [...channel.messages, action.message] }
            : channel)
        }
      }
    }
    case 'member':
      return { ...state, memberRuntime: { ...state.memberRuntime, [action.member]: action.runtime } }
    case 'definitions': {
      const definitions = sortDefinitions(action.definitions)
      const selection = state.section === 'roles'
        ? validSelection(state.selection, state.snapshot, state.tasks, definitions) ?? (definitions[0] ? roleSelection(definitions[0]) : null)
        : state.selection
      return { ...state, definitions, selection }
    }
    case 'definition-upsert': {
      const definitions = sortDefinitions([
        ...state.definitions.filter((definition) => definition.id !== action.definition.id || definition.source !== action.definition.source),
        action.definition
      ])
      return { ...state, definitions }
    }
    case 'definition-remove': {
      const definitions = state.definitions.filter((definition) => definition.id !== action.id || definition.source !== action.scope)
      const selection = state.selection?.kind === 'role' && state.selection.id === action.id && state.selection.scope === action.scope
        ? (definitions[0] ? roleSelection(definitions[0]) : null)
        : state.selection
      return { ...state, definitions, selection }
    }
  }
}

function mergeTaskDetail(current: TeamTask | undefined, incoming: TeamTask): TeamTask {
  if (!current) return { ...incoming, messages: uniqueMessages(incoming.messages) }
  return {
    ...incoming,
    messages: uniqueMessages([...current.messages, ...incoming.messages])
  }
}

function uniqueMessages(messages: TeamTaskMessage[]): TeamTaskMessage[] {
  const bySeq = new Map<number, TeamTaskMessage>()
  messages.forEach((message) => bySeq.set(message.seq, message))
  return [...bySeq.values()].sort((left, right) => left.seq - right.seq)
}

function uniqueLobbyMessages(messages: TeamLobbyMessage[]): TeamLobbyMessage[] {
  const bySeq = new Map<number, TeamLobbyMessage>()
  messages.forEach((message) => bySeq.set(message.seq, message))
  return [...bySeq.values()].sort((left, right) => left.seq - right.seq)
}

function applySummary(task: TeamTask, summary: TeamTaskSummary): TeamTask {
  return {
    ...task,
    title: summary.title,
    status: summary.status,
    participants: summary.participants,
    leader: summary.leader,
    projectPath: summary.projectPath,
    branch: summary.branch,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    reviewSummary: summary.reviewSummary ?? undefined
  }
}

function summaryFromDetail(task: TeamTask): TeamTaskSummary {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    participants: task.participants,
    leader: task.leader,
    projectPath: task.projectPath,
    branch: task.branch,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    messageCount: Math.max(task.messages.at(-1)?.seq ?? 0, task.messages.length),
    reviewSummary: task.reviewSummary ?? null
  }
}

function upsertTask(tasks: TeamTaskSummary[], task: TeamTaskSummary): TeamTaskSummary[] {
  return sortTasks([...tasks.filter((item) => item.id !== task.id), task])
}

function sortTasks(tasks: TeamTaskSummary[]): TeamTaskSummary[] {
  return [...tasks].sort((left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id))
}

function sortDefinitions(definitions: AgentDefinitionDocument[]): AgentDefinitionDocument[] {
  return [...definitions].sort((left, right) => left.source.localeCompare(right.source) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

function validSelection(selection: TeamSelection | null, snapshot: TeamSnapshot | null, tasks: TeamTaskSummary[], definitions: AgentDefinitionDocument[]): TeamSelection | null {
  if (!selection) return null
  if (selection.kind === 'lobby') return selection
  if (selection.kind === 'task') return tasks.some((task) => task.id === selection.id) ? selection : null
  if (selection.kind === 'channel') return snapshot?.channels.some((channel) => channel.name === selection.id) ? selection : null
  if (selection.kind === 'member') return snapshot?.members.some((member) => member.name === selection.id) ? selection : null
  return definitions.some((definition) => definition.id === selection.id && definition.source === selection.scope) ? selection : null
}

function defaultSelection(section: TeamSection, snapshot: TeamSnapshot | null, tasks: TeamTaskSummary[], definitions: AgentDefinitionDocument[]): TeamSelection | null {
  if (section === 'lobby') return { kind: 'lobby', id: 'team-lobby' }
  if (section === 'tasks') return tasks[0] ? { kind: 'task', id: tasks[0].id } : null
  if (section === 'roles') return definitions[0] ? roleSelection(definitions[0]) : null
  if (snapshot?.channels[0]) return { kind: 'channel', id: snapshot.channels[0].name }
  if (snapshot?.members[0]) return { kind: 'member', id: snapshot.members[0].name }
  return null
}

function roleSelection(definition: AgentDefinitionDocument): TeamSelection {
  return { kind: 'role', id: definition.id, scope: definition.source }
}
