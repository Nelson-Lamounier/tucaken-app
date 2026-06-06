'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useSummaryOrder } from './summary-order'

/** The enclosing group's title, so rows/cards can tag their selection with it. */
const SummaryGroupTitleContext = createContext<string | undefined>(undefined)

export function useSummaryGroupTitle(): string | undefined {
  return useContext(SummaryGroupTitleContext)
}

interface SummaryGroupProps {
  readonly id: string
  readonly title: string
  readonly count?: number
  readonly subtitle?: string
  readonly children: ReactNode
  /** Force the initial open state. When omitted, the group opens by default
   *  unless it sits inside a SummaryOrderProvider, where only the first group
   *  opens. */
  readonly defaultOpen?: boolean
}

/** Collapsible labelled group of SummaryRows, rendered as a bordered panel. */
export function SummaryGroup({
  id,
  title,
  count,
  subtitle,
  children,
  defaultOpen,
}: SummaryGroupProps) {
  const order = useSummaryOrder()
  const [open, setOpen] = useState(() => {
    if (defaultOpen !== undefined) return defaultOpen
    if (order) return order.registerFirst(id)
    return true
  })
  const regionId = `summary-group-${id}`

  return (
    <section className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/2">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex w-full items-center gap-2 text-left"
      >
        <ChevronDown
          className={`size-4 shrink-0 text-zinc-400 transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden
        />
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
        {typeof count === 'number' && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
            {count}
          </span>
        )}
      </button>
      {subtitle && <p className="pl-6 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={regionId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden', willChange: 'opacity' }}
            className="space-y-2 pl-6"
          >
            <SummaryGroupTitleContext.Provider value={title}>{children}</SummaryGroupTitleContext.Provider>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
