// src/features/github/components/SyncProgressBar.tsx
//
// Recreation of Motion+'s "Loading progress bar" effect (motion-plus is a
// paid pkg and not installed). Indeterminate: a highlight segment sweeps
// across the track on a loop while a repo is syncing — replaces the static
// "syncing" badge until the sync completes. Honours reduced-motion.

import { motion, useReducedMotion } from 'motion/react'

export function SyncProgressBar() {
  const reduce = useReducedMotion()

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300"
      role="status"
      aria-label="Syncing repository"
    >
      <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-indigo-500/15">
        {reduce ? (
          <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-indigo-400" />
        ) : (
          <motion.span
            className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-linear-to-r from-indigo-500/40 via-indigo-400 to-indigo-500/40"
            style={{ willChange: 'transform' }}
            animate={{ x: ['-40%', '340%'] }}
            transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
          />
        )}
      </span>
      syncing
    </span>
  )
}
