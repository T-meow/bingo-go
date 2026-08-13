import type { CliEvent } from '../../../shared/contracts/cli'
import type { MessageImageAttachment, SessionHistoryItem } from '../../../shared/contracts/ipc'

export type ChatMessage = {
  id: string
  turnId: string | null
  role: 'user' | 'assistant'
  markdown: string
  attachments?: MessageImageAttachment[]
  status?: 'streaming' | 'done' | 'interrupted'
}
export type ToolActivity = { id: string; turnId: string | null; name: string; summary: string; status: 'running' | 'done' | 'error' | 'interrupted'; output?: string; durationMs?: number }
export type ChatTimelineItem =
  | { type: 'message'; value: ChatMessage }
  | { type: 'tool'; value: ToolActivity }
export type PromptRequest = Extract<CliEvent, { type: 'prompt.request' }>
export type InlineError = { code: string; msg: string }

export type ChatState = {
  turnId: string | null
  timeline: ChatTimelineItem[]
  messages: ChatMessage[]
  tools: ToolActivity[]
  prompts: PromptRequest[]
  error: InlineError | null
}

export const initialChatState: ChatState = { turnId: null, timeline: [], messages: [], tools: [], prompts: [], error: null }

export type ChatAction =
  | { type: 'reset' }
  | { type: 'restore'; history: SessionHistoryItem[] }
  | { type: 'submit'; turnId: string; prompt: string; attachments?: MessageImageAttachment[] }
  | { type: 'submit-failed'; turnId: string; code: string; msg: string }
  | { type: 'event'; event: CliEvent }
  | { type: 'transport-error'; code: string; msg: string }

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === 'reset') return initialChatState
  if (action.type === 'restore') {
    const timeline: ChatTimelineItem[] = action.history.map((item) => item.type === 'message'
      ? { type: 'message', value: { ...item.value, turnId: null, status: 'done' } }
      : { type: 'tool', value: { ...item.value, turnId: null } })
    return {
      ...initialChatState,
      timeline,
      messages: timeline.flatMap((item) => item.type === 'message' ? [item.value] : []),
      tools: timeline.flatMap((item) => item.type === 'tool' ? [item.value] : [])
    }
  }
  if (action.type === 'submit') {
    if (state.turnId) return state
    const message: ChatMessage = {
      id: `user-${action.turnId}`,
      turnId: action.turnId,
      role: 'user',
      markdown: action.prompt,
      ...(action.attachments?.length ? { attachments: action.attachments } : {})
    }
    return {
      ...state,
      turnId: action.turnId,
      error: null,
      timeline: [...state.timeline, { type: 'message', value: message }],
      messages: [...state.messages, message]
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
  if (action.type === 'transport-error') return interrupt(state, { code: action.code, msg: action.msg })

  const event = action.event
  if ('turnId' in event && event.turnId && state.turnId && event.turnId !== state.turnId) return state
  switch (event.type) {
    case 'turn.started':
      return state
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
    case 'turn.completed':
      return settle(state, 'done')
    case 'turn.cancelled':
      return settle(state, 'interrupted')
    case 'error':
      return event.scope === 'turn' ? interrupt(state, { code: event.code, msg: event.msg }) : { ...state, error: { code: event.code, msg: event.msg } }
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
