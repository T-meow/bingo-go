// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stableGeometricAvatarId } from '../../../shared/avatars'
import { AvatarDataProvider, IdentityAvatar } from './IdentityAvatar'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('IdentityAvatar', () => {
  it('falls back to a stable geometric avatar when custom image rendering fails', async () => {
    render(<IdentityAvatar identity="alice" avatar="project:0123456789abcdef01234567" avatarDataUrl="data:image/png;base64,broken" />)
    fireEvent.error(screen.getByAltText('alice 的头像'))

    await waitFor(() => expect(screen.getByAltText('alice 的头像').getAttribute('src')).toBe(`./avatars/${stableGeometricAvatarId('alice')}.png`))
  })

  it('keeps the stable fallback when a project avatar resolver rejects', async () => {
    const resolve = vi.fn().mockRejectedValue(new Error('unavailable'))
    render(<AvatarDataProvider resolve={resolve}><IdentityAvatar identity="reviewer" avatar="project:0123456789abcdef01234567" /></AvatarDataProvider>)

    expect(screen.getByAltText('reviewer 的头像').getAttribute('src')).toBe(`./avatars/${stableGeometricAvatarId('reviewer')}.png`)
    await waitFor(() => expect(resolve).toHaveBeenCalledOnce())
  })
})
