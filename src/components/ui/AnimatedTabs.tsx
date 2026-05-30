'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'

export interface AnimatedTabItem {
  readonly id: string
  readonly title: string
  /** Optional small count/label shown next to the title. */
  readonly badge?: ReactNode
  readonly content: ReactNode
}

interface AnimatedTabsProps {
  readonly items: readonly AnimatedTabItem[]
  /** Tab selected on first render. Defaults to the first item. */
  readonly defaultId?: string
}

/**
 * Horizontal tab bar (titles on one line) with a shared `layoutId` underline
 * that slides to the active tab, and a cross-fading content region below.
 */
export function AnimatedTabs({ items, defaultId }: AnimatedTabsProps) {
  const [activeId, setActiveId] = useState<string>(defaultId ?? items[0]?.id ?? '')
  const active = items.find(item => item.id === activeId) ?? items[0]

  if (!active) return null

  return (
    <MotionConfig transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/2">
        {/* Tab bar — titles on a single line */}
        <div
          role="tablist"
          aria-label="Profile insights"
          className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-2 dark:border-white/10"
        >
          {items.map(item => {
            const isActive = item.id === active.id
            return (
              <button
                key={item.id}
                role="tab"
                type="button"
                id={`tab-${item.id}`}
                aria-selected={isActive}
                aria-controls={`tabpanel-${item.id}`}
                onClick={() => setActiveId(item.id)}
                className={`relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 ${
                  isActive ? 'text-accent' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  {item.title}
                  {item.badge != null && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
                      {item.badge}
                    </span>
                  )}
                </span>
                {isActive && (
                  <motion.span
                    layoutId="animated-tabs-underline"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
                    style={{ willChange: 'transform' }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Active panel — cross-fades on selection */}
        <div className="p-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.id}
              role="tabpanel"
              id={`tabpanel-${active.id}`}
              aria-labelledby={`tab-${active.id}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              style={{ willChange: 'transform, opacity' }}
            >
              {active.content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  )
}
