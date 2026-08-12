import type { CliEvent, CliSessionMetadata, PromptResponse, TeamDefinition, TeamSnapshot } from '../../shared/contracts/cli'

export type BingoSessionHandlers = {
  onEvent: (event: CliEvent) => void
  onExit: (error: Error | null) => void
}

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
  messageTeamMember(member: string, message: string): Promise<TeamSnapshot>
  stopTeamMember(member: string): Promise<TeamSnapshot>
  removeTeamMember(member: string): Promise<TeamSnapshot>
  readTeamActivity(member: string): Promise<{ member: string; activity: Array<{ id: string; kind: string; summary: string; status: string }> }>
  postTeamChannel(channel: string, text: string): Promise<TeamSnapshot>
  readTeamChannel(channel: string): Promise<TeamSnapshot>
  rename(name: string): Promise<CliSessionMetadata>
  delete(): Promise<string>
  close(): Promise<void>
}
