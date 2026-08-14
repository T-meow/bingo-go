import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { GuiError, UserProfileAvatarInput, UserProfileSnapshot } from '../../../shared/contracts/ipc'

type UserProfileContextValue = {
  snapshot: UserProfileSnapshot | null
  error: GuiError | null
  saving: boolean
  save: (avatar: UserProfileAvatarInput) => Promise<boolean>
  reload: () => Promise<void>
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null)
const EMPTY_PROFILE: UserProfileContextValue = {
  snapshot: null,
  error: null,
  saving: false,
  save: async () => false,
  reload: async () => undefined
}

export function UserProfileProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<UserProfileSnapshot | null>(null)
  const [error, setError] = useState<GuiError | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async (): Promise<void> => {
    try {
      const result = await window.bingoGui.readProfile()
      if (result.ok) {
        setSnapshot(result.value)
        setError(null)
      } else setError(result.error)
    } catch (cause) {
      setError(profileTransportError(cause))
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const save = useCallback(async (avatar: UserProfileAvatarInput): Promise<boolean> => {
    if (!snapshot) return false
    setSaving(true)
    setError(null)
    try {
      const result = await window.bingoGui.saveProfile({ baseRevision: snapshot.revision, avatar })
      if (!result.ok) {
        setError(result.error)
        return false
      }
      setSnapshot(result.value)
      return true
    } catch (cause) {
      setError(profileTransportError(cause))
      return false
    } finally {
      setSaving(false)
    }
  }, [snapshot])

  const value = useMemo(() => ({ snapshot, error, saving, save, reload }), [snapshot, error, saving, save, reload])
  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>
}

export function useUserProfile(): UserProfileContextValue {
  return useContext(UserProfileContext) ?? EMPTY_PROFILE
}

function profileTransportError(cause: unknown): GuiError {
  return {
    code: 'OPERATION_FAILED',
    msg: cause instanceof Error ? cause.message : '无法访问本地用户资料。',
    level: 'page',
    recoverable: true,
    action: 'retry'
  }
}
