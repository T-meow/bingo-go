import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { App as AntApp, theme as antTheme, type ThemeConfig } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { XProvider } from '@ant-design/x'
import zhCNX from '@ant-design/x/locale/zh_CN'
import type { AppearancePreferencesV1, AppearanceSnapshot, GuiError } from '../../../shared/contracts/ipc'

const DEFAULT_APPEARANCE: AppearancePreferencesV1 = {
  schemaVersion: 1,
  colorMode: 'system',
  accentColor: '#756AA8',
  density: 'comfortable',
  motion: 'system',
  inspectorCollapsed: false
}

type AppearanceContextValue = {
  snapshot: AppearanceSnapshot | null
  values: AppearancePreferencesV1
  error: GuiError | null
  saving: boolean
  save: (values: AppearancePreferencesV1) => Promise<boolean>
  preview: (values: AppearancePreferencesV1) => void
  resetPreview: () => void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

export function AppearanceProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AppearanceSnapshot | null>(null)
  const [values, setValues] = useState(DEFAULT_APPEARANCE)
  const [previewValues, setPreviewValues] = useState<AppearancePreferencesV1 | null>(null)
  const [error, setError] = useState<GuiError | null>(null)
  const [saving, setSaving] = useState(false)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

  useEffect(() => {
    let live = true
    void window.bingoGui.readAppearance().then((result) => {
      if (!live) return
      if (result.ok) {
        setSnapshot(result.value)
        setValues(result.value.values)
        setPreviewValues(null)
      } else setError(result.error)
    })
    return () => { live = false }
  }, [])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const changed = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    media.addEventListener?.('change', changed)
    return () => media.removeEventListener?.('change', changed)
  }, [])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    const changed = (event: MediaQueryListEvent): void => setSystemReduced(event.matches)
    media.addEventListener?.('change', changed)
    return () => media.removeEventListener?.('change', changed)
  }, [])

  const appliedValues = previewValues ?? values
  const dark = appliedValues.colorMode === 'dark' || (appliedValues.colorMode === 'system' && systemDark)
  const reducedMotion = appliedValues.motion === 'reduced' || (appliedValues.motion === 'system' && systemReduced)
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.density = appliedValues.density
    root.dataset.motion = reducedMotion ? 'reduced' : 'full'
    root.style.setProperty('--rei-accent', appliedValues.accentColor)
    root.style.setProperty('--rei-on-accent', readableForeground(appliedValues.accentColor))
  }, [appliedValues.accentColor, appliedValues.density, dark, reducedMotion])

  const save = useCallback(async (next: AppearancePreferencesV1): Promise<boolean> => {
    if (!snapshot) return false
    setSaving(true)
    setError(null)
    const result = await window.bingoGui.saveAppearance({ baseRevision: snapshot.revision, values: next })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setSnapshot(result.value)
    setValues(result.value.values)
    setPreviewValues(null)
    return true
  }, [snapshot])
  const preview = useCallback((next: AppearancePreferencesV1): void => {
    setError(null)
    setPreviewValues(next)
  }, [])
  const resetPreview = useCallback((): void => setPreviewValues(null), [])

  const theme = useMemo<ThemeConfig>(() => {
    const algorithms = [dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm]
    if (appliedValues.density === 'compact') algorithms.push(antTheme.compactAlgorithm)
    return {
      algorithm: algorithms,
      cssVar: { prefix: 'rei' },
      token: {
        colorPrimary: appliedValues.accentColor,
        colorInfo: appliedValues.accentColor,
        colorTextLightSolid: readableForeground(appliedValues.accentColor),
        colorBgLayout: dark ? '#171719' : '#F6F7F6',
        colorBgContainer: dark ? '#202024' : '#FFFFFF',
        colorBgElevated: dark ? '#252529' : '#FFFFFF',
        colorFillAlter: dark ? '#29292D' : '#F3F4F3',
        colorTextSecondary: dark ? '#ADAFB3' : '#666B67',
        colorBorderSecondary: dark ? '#343438' : '#E4E5E4',
        borderRadius: 6,
        borderRadiusLG: 8,
        fontSize: 14,
        controlHeight: appliedValues.density === 'compact' ? 30 : 36,
        motion: !reducedMotion
      },
      components: {
        Button: { borderRadius: 6 },
        Drawer: { borderRadiusLG: 6 },
        Modal: { borderRadiusLG: 8 },
        Menu: { itemBorderRadius: 6, itemMarginInline: 0 },
        Table: { headerBg: dark ? '#29292D' : '#F3F4F3' }
      }
    }
  }, [appliedValues, dark, reducedMotion])

  const context = useMemo(() => ({ snapshot, values, error, saving, save, preview, resetPreview }), [snapshot, values, error, saving, save, preview, resetPreview])
  return (
    <AppearanceContext.Provider value={context}>
      <XProvider locale={{ ...zhCNX, ...zhCN }} theme={theme}>
        <AntApp className="rei-ant-app">{children}</AntApp>
      </XProvider>
    </AppearanceContext.Provider>
  )
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext)
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider')
  return value
}

function readableForeground(hex: string): '#111111' | '#FFFFFF' {
  const rgb = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((part) => Number.parseInt(part, 16) / 255)
  const luminance = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.42 ? '#111111' : '#FFFFFF'
}
