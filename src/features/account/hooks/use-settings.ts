import { useCallback, useEffect, useState } from 'react'
import type { Settings } from '../types'
import { DEFAULT_SETTINGS } from '../defaults'

// Settings persist to localStorage until a /me/settings backend endpoint exists.
// Key must be stable across deploys — changing it resets user preferences.
const LS_KEY = 'tucaken-user-settings-v1'

function readStorage(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    // Shallow merge so new default fields survive upgrades.
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useSettings() {
  // SSR-safe: start with defaults, hydrate from localStorage after mount.
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    setSettings(readStorage())
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try { globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  return { settings, update }
}
