import type { CliEvent, ContextUsage } from '../../../shared/contracts/cli'
import type { MessageImageAttachment, SessionHistoryItem } from '../../../shared/contracts/ipc'

export type ChatMessage = {
  id: string
  turnId: string | null
  role: 'user' | 'assistant'
  markdown: string
  attachments?: MessageImageAttachment[]
  status?: 'streaming' | 'done' | 'interrupted'
  origin?: 'prompt' | 'assistant' | 'tool-result' | 'legacy'
  editable?: boolean
  revision?: string
  turnStatus?: 'started' | 'completed' | 'cancelled' | 'error'
}
export type ToolActivity = { id: string; turnId: string | null; name: string; summary: string; status: 'running' | 'done' | 'error' | 'interrupted'; output?: string; durationMs?: number }
export type ChatTimelineItem =
  | { type: 'message'; value: ChatMessage }
  | { type: 'tool'; value: ToolActivity }
export type PromptRequest = Extract<CliEvent, { type: 'prompt.request' }>
export type InlineError = { code: string; msg: string }
export type RecoveryAction = { kind: 'cancelled' | 'turn-error' | 'transport-crash'; turnId: string }

export type ChatState = {
  turnId: string | null
  timeline: ChatTimelineItem[]
  messages: ChatMessage[]
  tools: ToolActivity[]
  prompts: PromptRequest[]
  error: InlineError | null
  recovery: RecoveryAction | null
  contextUsage: ContextUsage | null
}

export const initialChatState: ChatState = { turnId: null, timeline: [], messages: [], tools: [], prompts: [], error: null, recovery: null, contextUsage: null }

export type ChatAction =
  | { type: 'reset' }
  | { type: 'restore'; history: SessionHistoryItem[]; contextUsage?: ContextUsage | null }
  | { type: 'submit'; turnId: string; prompt: string; attachments?: MessageImageAttachment[] }
  | { type: 'submit-failed'; turnId: string; code: string; msg: string }
  | { type: 'context'; contextUsage: ContextUsage | null }
  | { type: 'event'; event: CliEvent }
  | { type: 'transport-error'; code: string; msg: string }

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === 'reset') return initialChatState
  if (action.type === 'restore') {
    const timeline: ChatTimelineItem[] = action.history.map((item) => item.type === 'message'
      ? { type: 'message', value: { ...item.value, turnId: item.value.turnId ?? null, status: item.value.turnStatus === 'started' ? 'interrupted' : 'done' } }
      : { type: 'tool', value: { ...item.value, turnId: null } })
    const interruptedPrompt = timeline.flatMap((item) => item.type === 'message' && item.value.origin === 'prompt' && item.value.turnStatus === 'started' && item.value.turnId ? [item.value] : []).at(-1)
    return {
      ...initialChatState,
      timeline,
      messages: timeline.flatMap((item) => item.type === 'message' ? [item.value] : []),
      tools: timeline.flatMap((item) => item.type === 'tool' ? [item.value] : []),
      recovery: interruptedPrompt?.turnId ? { kind: 'transport-crash', turnId: interruptedPrompt.turnId } : null,
      contextUsage: action.contextUsage ?? null
    }
  }
  if (action.type === 'submit') {
    if (state.turnId) return state
    const message: ChatMessage = {
      id: `user-${action.turnId}`,
      turnId: action.turnId,
      role: 'user',
      markdown: action.prompt,
      origin: 'prompt',
      editable: false,
      ...(action.attachments?.length ? { attachments: action.attachments } : {})
    }
    return {
      ...state,
      turnId: action.turnId,
      error: null,
      recovery: null,
      timeline: [...state.timeline.map(clearEditable), { type: 'message', value: message }],
      messages: [...state.messages.map((item) => ({ ...item, editable: false })), message]
    }
  }
  if (action.type === 'submit-failed') {
    return {
      ...state,
      turnId: null,
      prompts: [],
      error: { code: action.code, msg: action.msg },
      timeline: state.timeline.filter((item) => item.value.turnId !== action.turnId),
      messages: state.messages.filter((message) => message.turnId !== action.turnId),
      tools: state.tools.filter((tool) => tool.turnId !== action.turnId)
    }
  }
  if (action.type === 'context') return { ...state, contextUsage: action.contextUsage }
  if (action.type === 'transport-error') {
    const turnId = state.turnId ?? state.recovery?.turnId
    return { ...interrupt(state, { code: action.code, msg: action.msg }), recovery: turnId ? { kind: 'transport-crash', turnId } : null, contextUsage: null }
  }

  const event = action.event
  if (event.type === 'context.usage' && event.turnId && event.turnId !== state.turnId) return state
  if ('turnId' in event && event.turnId && state.turnId && event.turnId !== state.turnId) return state
  switch (event.type) {
    case 'turn.started':
      return updateMessage(state, `user-${event.turnId}`, (message) => ({ ...message, revision: event.promptRevision }))
    case 'text.delta':
      return appendTextDelta(state, event.turnId, event.delta)
    case 'tool.ready':
      return appendTool(state, { id: event.toolCallId, turnId: event.turnId, name: event.name, summary: event.summary, status: 'running' })
    case 'tool.done':
      return state.tools.some((tool) => tool.id === event.toolCallId)
        ? updateTool(state, event.toolCallId, (tool) => ({ ...tool, name: event.name, summary: event.summary, status: event.status, output: event.output, durationMs: event.durationMs }))
        : appendTool(state, { id: event.toolCallId, turnId: event.turnId, name: event.name, summary: event.summary, status: event.status, output: event.output, durationMs: event.durationMs })
    case 'prompt.request':
      return { ...state, prompts: [...state.prompts, event] }
    case 'prompt.resolved':
      return { ...state, prompts: state.prompts.filter((prompt) => prompt.promptId !== event.promptId) }
    case 'context.usage':
      return { ...state, contextUsage: { usedTokens: event.usedTokens, contextWindow: event.contextWindow } }
    case 'turn.completed':
      return markLastPromptEditable(settle(state, 'done'), event.turnId, 'completed')
    case 'turn.cancelled':
      return { ...markLastPromptEditable(settle(state, 'interrupted'), event.turnId, 'cancelled'), recovery: { kind: 'cancelled', turnId: event.turnId } }
    case 'error':
      return event.scope === 'turn'
        ? { ...markLastPromptEditable(interrupt(state, { code: event.code, msg: event.msg }), event.turnId ?? state.turnId, 'error'), recovery: event.recoverable && (event.turnId ?? state.turnId) ? { kind: 'turn-error', turnId: (event.turnId ?? state.turnId) as string } : null }
        : { ...state, error: { code: event.code, msg: event.msg } }
    default:
      return state
  }
}

function settle(state: ChatState, status: 'done' | 'interrupted'): ChatState {
  const settleMessage = (message: ChatMessage): ChatMessage => message.status === 'streaming' ? { ...message, status } : message
  const settleTool = (tool: ToolActivity): ToolActivity => tool.status === 'running' ? { ...tool, status: status === 'done' ? 'error' : 'interrupted' } : tool
  return {
    ...state,
    turnId: null,
    prompts: [],
    timeline: state.timeline.map((item) => item.type === 'message' ? { ...item, value: settleMessage(item.value) } : { ...item, value: settleTool(item.value) }),
    messages: state.messages.map(settleMessage),
    tools: state.tools.map(settleTool)
  }
}

function clearEditable(item: ChatTimelineItem): ChatTimelineItem {
  return item.type === 'message' ? { ...item, value: { ...item.value, editable: false } } : item
}

function markLastPromptEditable(state: ChatState, turnId: string | null | undefined, turnStatus: 'completed' | 'cancelled' | 'error'): ChatState {
  if (!turnId) return state
  return updateMessage(state, `user-${turnId}`, (message) => ({ ...message, editable: true, turnStatus }))
}

function interrupt(state: ChatState, error: InlineError): ChatState {
  return { ...settle(state, 'interrupted'), error }
}

function appendTextDelta(state: ChatState, turnId: string, delta: string): ChatState {
  const last = state.timeline.at(-1)
  if (last?.type === 'message' && last.value.role === 'assistant' && last.value.turnId === turnId && last.value.status === 'streaming') {
    return updateMessage(state, last.value.id, (message) => ({ ...message, markdown: message.markdown + delta }))
  }
  const segment = state.messages.filter((message) => message.role === 'assistant' && message.turnId === turnId).length
  const message: ChatMessage = { id: `assistant-${turnId}-${segment}`, turnId, role: 'assistant', markdown: delta, status: 'streaming' }
  return { ...state, timeline: [...state.timeline, { type: 'message', value: message }], messages: [...state.messages, message] }
}

function appendTool(state: ChatState, tool: ToolActivity): ChatState {
  if (state.tools.some((item) => item.id === tool.id)) return state
  const finishSegment = (message: ChatMessage): ChatMessage => message.role === 'assistant' && message.turnId === tool.turnId && message.status === 'streaming'
    ? { ...message, status: 'done' }
    : message
  return {
    ...state,
    timeline: [...state.timeline.map((item) => item.type === 'message' ? { ...item, value: finishSegment(item.value) } : item), { type: 'tool', value: tool }],
    messages: state.messages.map(finishSegment),
    tools: [...state.tools, tool]
  }
}

function updateMessage(state: ChatState, id: string, update: (message: ChatMessage) => ChatMessage): ChatState {
  return {
    ...state,
    timeline: state.timeline.map((item) => item.type === 'message' && item.value.id === id ? { ...item, value: update(item.value) } : item),
    messages: state.messages.map((message) => message.id === id ? update(message) : message)
  }
}

function updateTool(state: ChatState, id: string, update: (tool: ToolActivity) => ToolActivity): ChatState {
  return {
    ...state,
    timeline: state.timeline.map((item) => item.type === 'tool' && item.value.id === id ? { ...item, value: update(item.value) } : item),
    tools: state.tools.map((tool) => tool.id === id ? update(tool) : tool)
  }
}
