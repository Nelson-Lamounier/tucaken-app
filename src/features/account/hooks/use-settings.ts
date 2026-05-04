import { useCallback, useState } from 'react'
import type { Settings } from '../types'
import { DEFAULT_SETTINGS } from '../defaults'

// TODO: swap with React Query + server fns once `/me/settings` endpoint lands.
// See `features/account/README.md` §Wiring for the controlled-component contract.
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return { settings, update }
}
