import type { PermissionRuleDecision, SessionSnapshot, ThemeChoice, ThinkingLevel } from '../../shared/contracts/appServer'
import { AppServerActionService } from './appServerActionService'
import type { AppServerSessionManager } from './appServerSessionManager'

export type RuntimeSelectionPatch = {
  provider?: string
  model?: string
  thinking?: ThinkingLevel
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk' | 'plan'
  theme?: ThemeChoice
}

export class AppServerSettingsAdapter {
  private readonly actions: AppServerActionService

  constructor(private readonly manager: AppServerSessionManager) {
    this.actions = new AppServerActionService(manager)
  }

  async applyRuntimeSelection(originConversationId: string, patch: RuntimeSelectionPatch): Promise<void> {
    if (patch.provider !== undefined) await this.actions.setProvider(originConversationId, patch.provider)
    if (patch.model !== undefined) await this.actions.setModel(originConversationId, patch.model)
    if (patch.thinking !== undefined) await this.actions.setThinking(originConversationId, patch.thinking)
    if (patch.permissionMode !== undefined) await this.actions.setPermissionMode(originConversationId, patch.permissionMode)
    if (patch.theme !== undefined) await this.actions.setTheme(originConversationId, patch.theme)
  }

  async addPermissionRule(originConversationId: string, decision: PermissionRuleDecision, rule: string): Promise<void> {
    await this.actions.permissionRuleAdd(originConversationId, decision, rule)
  }

  async removePermissionRule(originConversationId: string, decision: PermissionRuleDecision, rule: string): Promise<void> {
    await this.actions.permissionRuleRemove(originConversationId, decision, rule)
  }

  async reloadAfterDefinitionWrite(): Promise<SessionSnapshot> {
    return this.manager.restartCurrent()
  }
}
