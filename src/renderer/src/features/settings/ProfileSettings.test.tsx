// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileSettings } from './ProfileSettings'

const profile = vi.hoisted(() => ({
  snapshot: {
    path: 'C:/profile.json', revision: 'a'.repeat(64),
    values: { schemaVersion: 1 as const, avatar: 'identicon-01' }
  },
  error: null,
  saving: false,
  save: vi.fn(),
  reload: vi.fn()
}))

vi.mock('../../profile/UserProfileProvider', () => ({ useUserProfile: () => profile }))

beforeEach(() => {
  profile.save.mockReset().mockResolvedValue(true)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ProfileSettings', () => {
  it('selects and saves a built-in avatar', async () => {
    render(<ProfileSettings />)
    fireEvent.click(screen.getByTitle('identicon-02'))
    expect(screen.getByTitle('identicon-02').classList.contains('selected')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /保存个人资料/ }))

    await waitFor(() => expect(profile.save).toHaveBeenCalledWith({ kind: 'builtin', id: 'identicon-02' }))
  })

  it('restores the saved avatar when changes are discarded', () => {
    render(<ProfileSettings />)
    fireEvent.click(screen.getByTitle('identicon-02'))
    fireEvent.click(screen.getByRole('button', { name: /放弃更改/ }))

    expect(screen.getByTitle('identicon-01').classList.contains('selected')).toBe(true)
    expect((screen.getByRole('button', { name: /保存个人资料/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
