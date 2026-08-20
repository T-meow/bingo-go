import type { ActionExecuteResult, PermissionRuleDecision, ThemeChoice, ThinkingLevel } from '../../shared/contracts/appServer'
import type { AppServerSessionManager } from './appServerSessionManager'

export class AppServerActionService {
  constructor(private readonly manager: AppServerSessionManager) {}

  async setModel(originConversationId: string, model: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'modelSelect', model })
  }

  async setProvider(originConversationId: string, provider: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'providerSelect', provider })
  }

  async setThinking(originConversationId: string, level: ThinkingLevel): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'thinkingSelect', level })
  }

  async setPermissionMode(originConversationId: string, mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk' | 'plan'): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'permissionModeSet', mode })
  }

  async setTheme(originConversationId: string, theme: ThemeChoice): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'themeSet', theme })
  }

  async renameSession(originConversationId: string, name: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'sessionRename', name })
  }

  async compact(originConversationId: string, instructions?: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'conversationCompact', instructions: instructions ?? null })
  }

  async rewind(originConversationId: string, target: { type: 'item'; itemId: string } | { type: 'latest' }, mode: 'preview' | 'applied'): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'conversationRewind', target, mode })
  }

  async changeDirectory(originConversationId: string, path: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'sessionChangeDirectory', path })
  }

  async garbageCollect(originConversationId: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'sessionGarbageCollect' })
  }

  async permissionRuleAdd(originConversationId: string, decision: PermissionRuleDecision, rule: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'permissionRuleAdd', decision, rule })
  }

  async permissionRuleRemove(originConversationId: string, decision: PermissionRuleDecision, rule: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'permissionRuleRemove', decision, rule })
  }

  async mcpEnable(originConversationId: string, server: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'mcpEnable', server })
  }

  async mcpDisable(originConversationId: string, server: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'mcpDisable', server })
  }

  async mcpReconnect(originConversationId: string, server?: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'mcpReconnect', server: server ?? null })
  }

  async teamStart(originConversationId: string, members?: string[]): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'teamStart', members: members ?? null })
  }

  async teamStop(originConversationId: string, member?: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'teamStop', member: member ?? null })
  }

  async teamAssign(originConversationId: string, member: string, task: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'teamAssign', member, task })
  }

  async roomJoin(originConversationId: string, room: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'roomJoin', room })
  }

  async roomLeave(originConversationId: string, room: string): Promise<ActionExecuteResult> {
    return this.execute(originConversationId, { type: 'roomLeave', room })
  }

  private execute(originConversationId: string, action: Parameters<AppServerSessionManager['actionExecute']>[0]['action']): Promise<ActionExecuteResult> {
    return this.manager.actionExecute({ originConversationId, precondition: null, action })
  }
}
