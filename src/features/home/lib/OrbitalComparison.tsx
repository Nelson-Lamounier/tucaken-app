"use client"
// src/features/home/lib/OrbitalComparison.tsx
// Radial comparison orbital: nodes orbit a teal Tucaken hub on lg+ (CSS-transform
// spin, no per-frame React re-render); an accessible static list is shown on
// mobile and under reduced motion. Only the real q/o/t data is rendered.
import { motion, AnimatePresence, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef, useState } from 'react'
import { FileSearch, Target, FileWarning, Fingerprint, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { nodeAngles, nodeTransform } from './orbital-geometry'
import type { ComparisonItem } from '../content'

const ICONS: Record<string, LucideIcon> = { FileSearch, Target, FileWarning, Fingerprint }
const OUTER_RADIUS = 200
const INNER_RADIUS = 120
const INNER_DOTS = 6
const SCROLL_SCALE_RANGE = [0.82, 1.06] as const

// Lemniscate (figure-eight) traced by the hub.
const INFINITY_PATH =
  'M 50 25 C 50 10 75 10 75 25 C 75 40 50 40 50 25 C 50 10 25 10 25 25 C 25 40 50 40 50 25'

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
        className="orbit-counter-spin-anim group-hover/orbit:[animation-play-state:paused]"
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

function OrbitRing({
  diameter,
  className,
  testId,
}: {
  diameter: number
  className: string
  testId: string
}) {
  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      className={cn(
        'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border',
        className,
      )}
      style={{ width: diameter, height: diameter }}
    />
  )
}

function InnerRing({ paused }: { paused: boolean }) {
  const angles = nodeAngles(INNER_DOTS)
  return (
    <div className="absolute left-1/2 top-1/2" aria-hidden="true">
      <div
        className="orbit-spin-slow-anim group-hover/orbit:[animation-play-state:paused]"
        style={{ willChange: 'transform' }}
        data-paused={paused ? 'true' : undefined}
      >
        {angles.map((a) => (
          <span
            key={a}
            data-testid="orbit-inner-dot"
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-400/50"
            style={{ transform: nodeTransform(a, INNER_RADIUS) }}
          />
        ))}
      </div>
    </div>
  )
}

function InfinityHub() {
  return (
    <svg
      viewBox="0 0 100 50"
      aria-hidden="true"
      data-testid="infinity-hub"
      className="h-8 w-12"
      style={{ filter: 'drop-shadow(0 0 6px rgba(45,212,191,0.6))' }}
    >
      <motion.path
        d={INFINITY_PATH}
        fill="none"
        stroke="#2dd4bf"
        strokeWidth={4}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  )
}

export function OrbitalComparison({ items }: { items: readonly ComparisonItem[] }) {
  const reduce = useReducedMotion() ?? false
  const [activeId, setActiveId] = useState<string | null>(null)
  const orbitRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: reduce ? undefined : orbitRef,
    offset: ['start end', 'end start'],
  })
  const scale = useTransform(scrollYProgress, [0, 1], [...SCROLL_SCALE_RANGE])
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

      <div ref={orbitRef} className="relative hidden lg:block">
        <motion.div
          style={{ scale, willChange: 'transform' }}
          className="group/orbit relative h-[520px] w-full"
          onClick={() => setActiveId(null)}
        >
        <OrbitRing diameter={2 * OUTER_RADIUS} className="border-teal-400/15" testId="orbit-ring-outer" />
        <OrbitRing diameter={2 * INNER_RADIUS} className="border-white/5" testId="orbit-ring-inner" />
        <InnerRing paused={paused} />

        <div className="absolute left-1/2 top-1/2">
          <div className="orbit-spin-anim group-hover/orbit:[animation-play-state:paused]" data-paused={paused ? 'true' : undefined}>
            {items.map((item, i) => (
              <OrbitalNode
                key={item.label}
                item={item}
                transform={nodeTransform(angles[i], OUTER_RADIUS)}
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
          <InfinityHub />
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
        </motion.div>
      </div>
    </div>
  )
}
