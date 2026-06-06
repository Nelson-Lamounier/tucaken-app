'use client'

import { ChevronRight } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useDetailRail } from './selection'
import { useSummaryGroupTitle } from './SummaryGroup'

interface SummaryRowProps {
  readonly id: string
  readonly label: string
  /** Full-text content shown in the rail's Detail tab when this row is active. */
  readonly detail: ReactNode
  /** Optional strength/priority indicator (e.g. <EvidenceIndicator/>). */
  readonly indicator?: ReactNode
  /** Optional one-line preview under the label. */
  readonly preview?: string
}

/** One scannable line in a SummaryGroup. Click → publishes `detail` to the rail. */
export function SummaryRow({ id, label, detail, indicator, preview }: SummaryRowProps) {
  const { selected, select, pendingFocus } = useDetailRail()
  const section = useSummaryGroupTitle()
  const isActive = selected?.id === id
  const autoSelected = useRef(false)

  useEffect(() => {
    if (!autoSelected.current && pendingFocus === id && !selected) {
      autoSelected.current = true
      select({ id, label, node: detail, section })
    }
  }, [pendingFocus, id, selected, select, label, detail, section])

  return (
    <button
      type="button"
      onClick={() => select({ id, label, node: detail, section })}
      aria-current={isActive ? 'true' : undefined}
      aria-controls="detail-rail-panel"
      className={[
        'group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        isActive
          ? 'border-accent/40 bg-accent/8'
          : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-white/2 dark:hover:bg-white/5',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'h-8 w-0.5 shrink-0 rounded-full transition-colors',
          isActive ? 'bg-accent' : 'bg-transparent',
        ].join(' ')}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {label}
        </span>
        {preview && (
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{preview}</span>
        )}
      </span>
      {indicator}
      <ChevronRight className="size-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  )
}
