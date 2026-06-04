'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type RailTab = 'detail' | 'notes' | 'timeline'

export interface RailSelection {
  /** Stable row id — matches the `?focus` param and the SummaryRow id. */
  readonly id: string
  /** Short label shown in the Detail tab header. */
  readonly label: string
  /** Full-text detail node rendered in the rail. */
  readonly node: ReactNode
}

export interface DetailRailValue {
  readonly tab: RailTab
  readonly selected: RailSelection | null
  /** Focus id read from the URL on first paint, consumed by SummaryRow auto-select. */
  readonly pendingFocus: string | undefined
  readonly setTab: (tab: RailTab) => void
  readonly select: (selection: RailSelection) => void
  readonly clear: () => void
}

const DetailRailContext = createContext<DetailRailValue | null>(null)

interface DetailRailProviderProps {
  readonly initialFocus: string | undefined
  /** Called whenever the selected row id changes (incl. null on clear). */
  readonly onFocusChange?: (id: string | null) => void
  readonly children: ReactNode
}

export function DetailRailProvider({
  initialFocus,
  onFocusChange,
  children,
}: DetailRailProviderProps) {
  const [tab, setTab] = useState<RailTab>('detail')
  const [selected, setSelected] = useState<RailSelection | null>(null)

  const select = useCallback(
    (selection: RailSelection) => {
      setSelected(selection)
      setTab('detail')
      onFocusChange?.(selection.id)
    },
    [onFocusChange],
  )

  const clear = useCallback(() => {
    setSelected(null)
    onFocusChange?.(null)
  }, [onFocusChange])

  const value = useMemo<DetailRailValue>(
    () => ({ tab, selected, pendingFocus: initialFocus, setTab, select, clear }),
    [tab, selected, initialFocus, select, clear],
  )

  return <DetailRailContext.Provider value={value}>{children}</DetailRailContext.Provider>
}

export function useDetailRail(): DetailRailValue {
  const ctx = useContext(DetailRailContext)
  if (!ctx) throw new Error('useDetailRail must be used within a DetailRailProvider')
  return ctx
}
