import type { AgentDefinitionDocument, AgentDefinitionInput, BehaviorConstraint, CliEvent, CliSessionMetadata, ContextUsage, PromptResponse, SessionForkReason, TeamDefinition, TeamLobby, TeamPresetModelMapping, TeamPresetPreview, TeamSnapshot, TeamTask, TeamTaskSummary } from '../../shared/contracts/cli'

export type BingoSessionHandlers = {
  onEvent: (event: CliEvent) => void
  onExit: (error: Error | null, exit: BingoSessionExit) => void
}

export type BingoSessionExit = { exitCode: number | null; signal: string | null }

export class BingoCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly level: 'field' | 'page' | 'flow',
    readonly recoverable: boolean
  ) {
    super(message)
    this.name = 'BingoCommandError'
  }
}

export interface BingoSession {
  open(sessionId?: string): Promise<CliSessionMetadata>
  subscribeContext(): Promise<ContextUsage>
  addAttachment(attachmentId: string, data: string): Promise<{ attachmentId: string; marker: string; mediaType: 'image/png' | 'image/jpeg' }>
  sendTurn(turnId: string, prompt: string): Promise<void>
  cancelTurn(turnId: string): Promise<void>
  respondToPrompt(turnId: string, promptId: string, response: PromptResponse): Promise<void>
  listProviders(): Promise<Extract<CliEvent, { type: 'providers.result' }>['providers']>
  listModels(provider: string): Promise<string[]>
  readTeam(): Promise<TeamSnapshot>
  validateTeam(): Promise<{ valid: boolean; msg: string }>
  saveTeam(baseRevision: string, definition: TeamDefinition): Promise<TeamSnapshot>
  startTeam(): Promise<TeamSnapshot>
  stopTeam(): Promise<TeamSnapshot>
  getTeamLobby(beforeSeq?: number, limit?: number): Promise<TeamLobby>
  postTeamLobby(text: string, targets?: string[]): Promise<TeamLobby>
  importTeamAvatar(fileName: string, data: string): Promise<{ avatar: string; snapshot: TeamSnapshot }>
  getTeamAvatar(avatar: string): Promise<{ avatar: string; dataUrl: string }>
  inspectTeamPreset(data: string): Promise<TeamPresetPreview>
  importTeamPreset(data: string, baseRevision: string, resolutions: Record<string, 'update' | 'keep'>, modelMappings: Record<string, TeamPresetModelMapping>): Promise<{ preview: TeamPresetPreview; snapshot: TeamSnapshot }>
  exportTeamPreset(): Promise<{ fileName: string; data: string }>
  restartTeamMember(member: string): Promise<TeamSnapshot>
  markTeamMemberUseful(member: string): Promise<TeamSnapshot>
  promoteTeamMember(member: string, baseRevision: string): Promise<{ memberId?: string; snapshot: TeamSnapshot }>
  listTeamTasks(): Promise<{ branch: string; tasks: TeamTaskSummary[] }>
  getTeamTask(taskId: string, beforeSeq?: number, limit?: number): Promise<TeamTask>
  createTeamTask(input: { title: string; description: string; participants?: string[]; leader?: string; contextMessageSeqs?: number[]; additionalConstraints?: BehaviorConstraint[] }): Promise<TeamTask>
  postTeamTask(taskId: string, text: string): Promise<TeamTaskSummary>
  pauseTeamTask(taskId: string): Promise<TeamTaskSummary>
  resumeTeamTask(taskId: string, message?: string): Promise<TeamTaskSummary>
  completeTeamTask(taskId: string): Promise<TeamTaskSummary>
  cancelTeamTask(taskId: string): Promise<TeamTaskSummary>
  messageTeamMember(member: string, message: string): Promise<TeamSnapshot>
  stopTeamMember(member: string): Promise<TeamSnapshot>
  removeTeamMember(member: string): Promise<TeamSnapshot>
  readTeamActivity(member: string): Promise<{ member: string; activity: Array<{ id: string; kind: string; summary: string; status: string }> }>
  listAgentDefinitions(): Promise<AgentDefinitionDocument[]>
  getAgentDefinition(scope: 'user' | 'project', id: string): Promise<AgentDefinitionDocument>
  saveAgentDefinition(scope: 'user' | 'project', id: string, baseRevision: string | undefined, definition: AgentDefinitionInput): Promise<AgentDefinitionDocument>
  archiveAgentDefinition(scope: 'user' | 'project', id: string, baseRevision: string): Promise<{ definition: AgentDefinitionDocument; archivePath?: string }>
  postTeamChannel(channel: string, text: string): Promise<TeamSnapshot>
  readTeamChannel(channel: string): Promise<TeamSnapshot>
  rename(name: string): Promise<CliSessionMetadata>
  delete(): Promise<string>
  fork(reason: SessionForkReason, sourceTurnId?: string, sourceRevision?: string): Promise<Extract<CliEvent, { type: 'session.forked' }>>
  close(): Promise<void>
}
