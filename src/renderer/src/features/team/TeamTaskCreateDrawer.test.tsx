// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamSnapshot, TeamTaskMember, TeamTaskSummary } from '../../../../shared/contracts/cli'
import { initialTeamState, type TeamState } from '../../state/teamReducer'
import { TeamTaskCreateDrawer } from './TeamTaskCreateDrawer'

const taskMember = (name: string): TeamTaskMember => ({
  memberId: `member-${name}`,
  name,
  agent: name,
  description: `${name} role`,
  system: `Act as ${name}.`,
  inheritSystem: true,
  profile: { constraints: [], preferences: [] },
  team: 'core-team',
  directory: '/workspace'
})

const snapshot: TeamSnapshot = {
  available: true,
  path: '/workspace/.bingo/team.json',
  revision: 'a'.repeat(64),
  branch: 'main',
  validation: null,
  definition: {
    schemaVersion: 1,
    name: 'core-team',
    leader: 'reviewer',
    members: [
      { name: 'reviewer', agent: 'reviewer' },
      { name: 'builder', agent: 'builder' }
    ]
  },
  agentDefinitions: [
    { name: 'reviewer', description: 'Reviews work', source: 'project' },
    { name: 'builder', description: 'Builds work', source: 'project' }
  ],
  avatars: [],
  members: [
    { name: 'reviewer', agent: 'reviewer', status: 'standby', pending: 0, unacked: 0, model: 'model-a', provider: 'default' },
    { name: 'builder', agent: 'builder', status: 'standby', pending: 0, unacked: 0, model: 'model-a', provider: 'default' }
  ],
  channels: []
}

const occupiedTask: TeamTaskSummary = {
  id: 'task-busy',
  title: 'Occupied task',
  status: 'running',
  participants: [taskMember('reviewer')],
  leader: 'reviewer',
  projectPath: '/workspace',
  branch: 'main',
  createdAt: 1,
  updatedAt: 2,
  messageCount: 1,
  reviewSummary: null
}

const stateWithTasks = (tasks: TeamTaskSummary[]): TeamState => ({
  ...initialTeamState,
  snapshot,
  tasks
})

describe('TeamTaskCreateDrawer', () => {
  beforeEach(() => {
    class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('selects every idle member and uses the configured leader by default', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(<TeamTaskCreateDrawer open state={stateWithTasks([])} busy={false} onClose={vi.fn()} onCreate={onCreate} />)

    const checkboxes = await screen.findAllByRole('checkbox')
    await waitFor(() => {
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(true)
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(true)
    })
    fireEvent.change(screen.getByPlaceholderText('例如：检查发布阻塞问题'), { target: { value: 'Review release' } })
    fireEvent.change(screen.getByPlaceholderText('描述目标、边界和交付标准'), { target: { value: 'Check the release.' } })
    fireEvent.click(screen.getByRole('button', { name: /创建并开始/ }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      title: 'Review release',
      description: 'Check the release.',
      participants: ['reviewer', 'builder'],
      leader: 'reviewer',
      contextMessageSeqs: [],
      additionalConstraints: []
    }))
  })

  it('disables occupied members and submits only the remaining participants', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(<TeamTaskCreateDrawer open state={stateWithTasks([occupiedTask])} busy={false} onClose={onClose} onCreate={onCreate} />)

    expect(await screen.findByText('Occupied task')).toBeTruthy()
    const checkboxes = screen.getAllByRole('checkbox')
    await waitFor(() => {
      expect((checkboxes[0] as HTMLInputElement).disabled).toBe(true)
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(false)
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(true)
    })

    fireEvent.change(screen.getByPlaceholderText('例如：检查发布阻塞问题'), { target: { value: 'Fix blockers' } })
    fireEvent.change(screen.getByPlaceholderText('描述目标、边界和交付标准'), { target: { value: 'Resolve every P0 blocker.' } })
    fireEvent.click(screen.getByRole('button', { name: /创建并开始/ }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      title: 'Fix blockers',
      description: 'Resolve every P0 blocker.',
      participants: ['builder'],
      leader: 'builder',
      contextMessageSeqs: [],
      additionalConstraints: []
    }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
