import { useReducer } from 'react'
import type { AppServerNotification, ConversationSnapshot, SessionSnapshot } from '../../../shared/contracts/appServer'
import {
  applyConversationSnapshot,
  applyNotification,
  applySessionSnapshot,
  initialAppStore,
  markDesynchronized,
  type AppStore
} from './appStore'

export type AppStoreAction =
  | { type: 'reset' }
  | { type: 'session-snapshot'; snapshot: SessionSnapshot }
  | { type: 'conversation-snapshot'; conversationId: string; snapshot: ConversationSnapshot }
  | { type: 'notification'; notification: AppServerNotification }
  | { type: 'desynchronized' }

export function appStoreReducer(state: AppStore, action: AppStoreAction): AppStore {
  switch (action.type) {
    case 'reset':
      return { ...initialAppStore }
    case 'session-snapshot':
      return applySessionSnapshot(state, action.snapshot)
    case 'conversation-snapshot':
      return applyConversationSnapshot(state, action.conversationId, action.snapshot)
    case 'notification':
      return applyNotification(state, action.notification)
    case 'desynchronized':
      return markDesynchronized(state)
  }
}

export function useAppStore(): [AppStore, React.Dispatch<AppStoreAction>] {
  return useReducer(appStoreReducer, initialAppStore)
}
