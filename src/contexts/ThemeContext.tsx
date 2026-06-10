import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

/** Supported theme values. */
export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'tucaken-app-theme'
// Legacy key written by the app prior to the start-admin → tucaken-app rename.
// Read once on first load to migrate the user's theme without forcing a reset,
// then deleted to free the slot. Safe to drop after one release cycle.
const LEGACY_STORAGE_KEY = 'start-admin-theme'
const DEFAULT_THEME: Theme = 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  toggleTheme: () => {},
})

/**
 * Reads the stored theme from localStorage synchronously.
 * Returns DEFAULT_THEME on the server (no `window`) or when no preference is stored.
 * Called as a lazy `useState` initializer so the client's first render already
 * has the correct theme — no two-render flicker.
 */
function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
    // Migrate legacy key from the start-admin era (one-time, then cleared).
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy === 'light' || legacy === 'dark') {
      localStorage.setItem(STORAGE_KEY, legacy)
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      return legacy
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
  return DEFAULT_THEME
}

/**
 * Toggles the `.dark` class on `<html>` to match `next`. No persistence —
 * called on every commit to re-assert the class (see the provider effect).
 */
function syncDomClass(next: Theme): void {
  document.documentElement.classList.toggle('dark', next === 'dark')
}

/**
 * Applies `next` as the active theme by toggling `.dark` on `<html>`
 * and persisting to `localStorage`.
 */
function applyThemeToDom(next: Theme): void {
  syncDomClass(next)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Provides the application theme to all descendant components.
 *
 * - Reads the stored preference from `localStorage` synchronously during
 *   client hydration so the React state matches the DOM from the very first
 *   render (eliminates the two-render flicker caused by `useEffect` reads).
 * - The anti-flash `<script>` in `__root.tsx` handles the CSS paint before
 *   React hydrates; this provider keeps React state in sync afterwards.
 * - Persists preference changes to `localStorage` and syncs the `.dark` class
 *   on `document.documentElement`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer: on the client this reads localStorage synchronously,
  // so state is correct from the first render — no extra render cycle needed.
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  const applyTheme = useCallback((next: Theme) => {
    applyThemeToDom(next)
    setTheme(next)
  }, [])

  // Re-assert the `.dark` class after EVERY commit, not just on mount. The
  // document shell (`<html className="h-full antialiased">` in __root.tsx) is
  // React-controlled; when it re-renders (router revalidation, error/pending
  // boundaries, devtools) React reconciles the className back to the static
  // literal and strips the imperatively-added `.dark`, leaving the page in the
  // wrong theme until a full reload re-runs the anti-flash script. Re-syncing
  // on every render heals that immediately. No deps array = run on each commit.
  useEffect(() => {
    syncDomClass(theme)
  })

  const toggleTheme = useCallback(() => {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, applyTheme])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Returns the current theme and toggle callback from the nearest `ThemeProvider`.
 *
 * @example
 * ```tsx
 * const { theme, toggleTheme } = useTheme()
 * ```
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
