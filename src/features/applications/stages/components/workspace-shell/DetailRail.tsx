'use client'

import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import type { InterviewStage, ApplicationDetail } from '@/lib/types/applications.types'
import { useDetailRail, type RailTab } from './selection'
import { NotesTab } from './rail-tabs/NotesTab'
import { TimelineTab } from './rail-tabs/TimelineTab'

const TABS: readonly { id: RailTab; label: string }[] = [
  { id: 'detail', label: 'Detail' },
  { id: 'notes', label: 'Notes' },
  { id: 'timeline', label: 'Timeline' },
]

interface DetailRailProps {
  readonly detail: ApplicationDetail
  readonly activeStage: InterviewStage
}

function DetailPane({ detail, activeStage }: DetailRailProps) {
  const { tab, selected } = useDetailRail()
  if (tab === 'notes') return <NotesTab detail={detail} activeStage={activeStage} />
  if (tab === 'timeline') return <TimelineTab detail={detail} />
  if (!selected) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Select an item on the left to see its full prep here.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selected.label}</h3>
      <div className="text-sm text-zinc-600 dark:text-zinc-400">{selected.node}</div>
    </div>
  )
}

/** Unified right rail: Detail · Notes · Timeline. */
export function DetailRail({ detail, activeStage }: DetailRailProps) {
  const { tab, setTab } = useDetailRail()
  return (
    <MotionConfig transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      <aside
        id="detail-rail-panel"
        className="flex w-full flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/2 lg:w-96"
      >
        <div role="tablist" aria-label="Detail rail" className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-white/5">
          {TABS.map(t => {
            const isActive = t.id === tab
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                className={`relative flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="rail-tab"
                    className="absolute inset-0 rounded-md bg-white shadow-sm dark:bg-white/10"
                    style={{ willChange: 'transform' }}
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            )
          })}
        </div>
        <div className="min-h-40">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{ willChange: 'opacity' }}
            >
              <DetailPane detail={detail} activeStage={activeStage} />
            </motion.div>
          </AnimatePresence>
        </div>
      </aside>
    </MotionConfig>
  )
}
