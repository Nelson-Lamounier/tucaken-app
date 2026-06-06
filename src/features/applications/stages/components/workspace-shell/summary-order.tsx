'use client'

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'

interface SummaryOrderValue {
  /** Returns true for the first group that registers an id, false thereafter. */
  readonly registerFirst: (id: string) => boolean
}

const SummaryOrderContext = createContext<SummaryOrderValue | null>(null)

/**
 * Opt-in "open only the first group" coordinator. When a workspace's summary
 * groups render inside this provider, the first SummaryGroup to register (in
 * render order) starts open and the rest start collapsed — regardless of which
 * group is structurally first, so conditional lead groups still win.
 *
 * Outside a provider, SummaryGroup falls back to open-by-default (legacy), so
 * groups mounted bare (e.g. in unit tests) are unaffected.
 *
 * Key this provider by the active stage so the registry resets per stage.
 */
export function SummaryOrderProvider({ children }: { readonly children: ReactNode }) {
  const firstId = useRef<string | null>(null)
  const value = useMemo<SummaryOrderValue>(
    () => ({
      registerFirst: (id: string) => {
        firstId.current ??= id
        return firstId.current === id
      },
    }),
    [],
  )
  return <SummaryOrderContext.Provider value={value}>{children}</SummaryOrderContext.Provider>
}

export function useSummaryOrder(): SummaryOrderValue | null {
  return useContext(SummaryOrderContext)
}
