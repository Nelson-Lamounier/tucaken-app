"use client"
// src/features/home/lib/PipelineCards.tsx
// Foreground glassmorphism status cards. Independent continuous y-float via
// Framer Motion so they stay alive when the cursor is still. reduce collapses
// the float to a static position.

import { motion } from 'motion/react'

const CARDS = [
  { label: 'Lead Discovered', dot: 'bg-teal-400', pos: 'left-0 top-4', dur: 5, delay: 0 },
  { label: 'Call Initiated', dot: 'bg-cyan-400', pos: 'right-2 top-16', dur: 6, delay: 0.5 },
  { label: 'Resume Grounded', dot: 'bg-emerald-400', pos: 'left-10 bottom-6', dur: 7, delay: 1 },
] as const

export function CardLayer({ reduce }: { reduce: boolean }) {
  return (
    <div className="absolute inset-0">
      {CARDS.map((c) => (
        <motion.div
          key={c.label}
          data-card="float"
          className={`absolute ${c.pos} rounded-xl border border-white/15 bg-white/5 px-3 py-2 shadow-xl shadow-black/30 backdrop-blur-xl`}
          style={{ willChange: 'transform' }}
          animate={reduce ? { y: 0 } : { y: [0, -10, 0] }}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: c.dur, delay: c.delay, repeat: Infinity, ease: 'easeInOut' }
          }
        >
          <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${c.dot} shadow-[0_0_8px_currentColor]`} />
          <span className="font-mono text-[11px] text-zinc-100">{c.label}</span>
        </motion.div>
      ))}
    </div>
  )
}
