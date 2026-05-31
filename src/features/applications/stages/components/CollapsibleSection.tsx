'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleSectionProps {
  readonly title: string
  readonly children: ReactNode
  readonly defaultOpen?: boolean
}

/** Expandable title row revealing its children. Used for the System Design
 *  framework steps; keyboard-accessible via the native button. */
export function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-zinc-200 last:border-0 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-zinc-800 dark:text-zinc-200"
      >
        {title}
        <ChevronDown className={`size-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && <div className="pb-3 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>}
    </div>
  )
}
