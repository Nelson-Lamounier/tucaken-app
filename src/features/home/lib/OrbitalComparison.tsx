"use client"
// src/features/home/lib/OrbitalComparison.tsx
// Radial comparison orbital: nodes orbit a teal Tucaken hub on lg+ (CSS-transform
// spin, no per-frame React re-render); an accessible static list is shown on
// mobile and under reduced motion. Only the real q/o/t data is rendered.
import { motion, AnimatePresence } from 'motion/react'
import { useState, useEffect } from 'react'
import { FileSearch, Target, FileWarning, Fingerprint, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { nodeAngles, nodeTransform } from './orbital-geometry'
import type { ComparisonItem } from '../content'

const ICONS: Record<string, LucideIcon> = { FileSearch, Target, FileWarning, Fingerprint }
const RADIUS = 200

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const handler = () => setReduce(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduce
}

function ComparisonDetail({ item }: { item: ComparisonItem }) {
  return (
    <div className="text-left">
      <p className="text-sm font-medium text-white">{item.q}</p>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-zinc-500">
          <span className="font-mono text-[11px] uppercase tracking-widest">Other tools</span>
          <br />
          {item.o}
        </p>
        <p className="text-zinc-100">
          <span className="font-mono text-[11px] uppercase tracking-widest text-teal-300">Tucaken</span>
          <br />
          <span className="text-teal-400">✓ </span>
          {item.t}
        </p>
      </div>
    </div>
  )
}

// Accessible, motion-free list — mobile and reduced-motion.
function ComparisonList({ items }: { items: readonly ComparisonItem[] }) {
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.label} className="rounded-md border border-white/10 bg-white/[0.02] p-5">
          <div className="font-mono text-[11px] uppercase tracking-widest text-teal-400">{item.label}</div>
          <div className="mt-3">
            <ComparisonDetail item={item} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function OrbitalNode({
  item,
  transform,
  expanded,
  paused,
  onToggle,
}: {
  item: ComparisonItem
  transform: string
  expanded: boolean
  paused: boolean
  onToggle: () => void
}) {
  const Icon = ICONS[item.icon] ?? FileSearch
  return (
    <div className="absolute" style={{ transform, willChange: 'transform' }}>
      <div
        className="orbit-counter-spin-anim"
        style={{ willChange: 'transform' }}
        data-paused={paused ? 'true' : undefined}
      >
        <button
          type="button"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className={cn(
            'grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 transition-colors',
            expanded
              ? 'border-teal-400 bg-teal-400 text-zinc-950'
              : 'border-white/30 bg-zinc-900 text-white hover:border-teal-400/60',
          )}
        >
          <Icon size={18} />
        </button>
        <div className="-translate-x-1/2 whitespace-nowrap text-center font-mono text-[11px] uppercase tracking-widest text-white/70">
          {item.label}
        </div>
      </div>
    </div>
  )
}

export function OrbitalComparison({ items }: { items: readonly ComparisonItem[] }) {
  const reduce = useReducedMotion()
  const [activeId, setActiveId] = useState<string | null>(null)
  const angles = nodeAngles(items.length)
  const activeItem = items.find((x) => x.label === activeId) ?? null
  const paused = activeId !== null

  if (reduce) {
    return <ComparisonList items={items} />
  }

  return (
    <div>
      <div className="block lg:hidden">
        <ComparisonList items={items} />
      </div>

      <div
        className="relative hidden h-[520px] w-full lg:block"
        onClick={() => setActiveId(null)}
      >
        <div className="absolute left-1/2 top-1/2">
          <div className="orbit-spin-anim" data-paused={paused ? 'true' : undefined}>
            {items.map((item, i) => (
              <OrbitalNode
                key={item.label}
                item={item}
                transform={nodeTransform(angles[i], RADIUS)}
                expanded={activeId === item.label}
                paused={paused}
                onToggle={() => setActiveId(activeId === item.label ? null : item.label)}
              />
            ))}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600"
        >
          <div className="h-7 w-7 rounded-full bg-white/80 backdrop-blur-md" />
        </div>

        <AnimatePresence>
          {activeItem && (
            <motion.div
              key={activeItem.label}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              style={{ willChange: 'transform, opacity' }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-1/2 w-80 -translate-x-1/2 rounded-md border border-white/15 bg-zinc-950/90 p-5 backdrop-blur-lg"
            >
              <ComparisonDetail item={activeItem} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
