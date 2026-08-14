import { describe, expect, it } from 'vitest'
import type { SessionSummary, WorkspacePreferencesV2 } from '../../../../shared/contracts/ipc'
import { groupSessionsByProject, sessionMatchesSearch } from './ConversationSidebar'

const preferences: WorkspacePreferencesV2 = {
  schemaVersion: 2,
  currentPath: 'D:\\Projects\\current',
  recentPaths: ['D:\\Projects\\current', 'D:\\Projects\\recent']
}

const session = (id: string, workspacePath: string | null, updatedAt: string): SessionSummary => ({
  id,
  name: `${id} conversation`,
  preview: `${id} answer`,
  updatedAt,
  messageCount: 1,
  workspacePath
})

describe('conversation project grouping', () => {
  it('orders current, recent, other, and unclassified projects with newest sessions first', () => {
    const groups = groupSessionsByProject([
      session('unclassified', null, '2026-08-14T08:00:00.000Z'),
      session('other-old', 'D:\\Projects\\other', '2026-08-10T08:00:00.000Z'),
      session('current-old', 'd:\\projects\\current\\', '2026-08-11T08:00:00.000Z'),
      session('recent', 'D:\\Projects\\recent', '2026-08-12T08:00:00.000Z'),
      session('current-new', 'D:\\Projects\\current', '2026-08-13T08:00:00.000Z')
    ], preferences)

    expect(groups.map((group) => group.kind)).toEqual(['current', 'recent', 'other', 'unclassified'])
    expect(groups[0].sessions.map((item) => item.id)).toEqual(['current-new', 'current-old'])
  })

  it('searches the project name and full path in addition to conversation text', () => {
    const target = session('alpha', 'D:\\Projects\\BillingConsole', '2026-08-14T08:00:00.000Z')
    expect(sessionMatchesSearch(target, 'billingconsole')).toBe(true)
    expect(sessionMatchesSearch(target, 'projects\\billing')).toBe(true)
    expect(sessionMatchesSearch(target, 'missing')).toBe(false)
  })
})
