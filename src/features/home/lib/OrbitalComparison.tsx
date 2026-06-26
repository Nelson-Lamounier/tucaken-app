"use client"
// src/features/home/lib/OrbitalComparison.tsx
// Radial comparison orbital: nodes orbit a teal Tucaken hub on lg+ (CSS-transform
// spin, no per-frame React re-render); an accessible static list is shown on
// mobile and under reduced motion. Only the real q/o/t data is rendered.
import { motion, AnimatePresence, useReducedMotion, useScroll, useTransform, animate, svgEffect, motionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { FileSearch, Target, FileWarning, Fingerprint, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { nodeAngles, nodeTransform } from './orbital-geometry'
import type { ComparisonItem } from '../content'

const ICONS: Record<string, LucideIcon> = { FileSearch, Target, FileWarning, Fingerprint }
const OUTER_RADIUS = 200
const SCROLL_SCALE_RANGE = [0.82, 1.06] as const

// Infinity (lemniscate) path traced by the hub, in a 0 0 24 24 viewBox.
const INFINITY_PATH = 'M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8'

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
            'absolute left-0 top-0 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 transition-colors',
            expanded
              ? 'border-teal-400 bg-teal-400 text-zinc-950'
              : 'border-white/30 bg-zinc-900 text-white hover:border-teal-400/60',
          )}
        >
          <Icon size={18} />
        </button>
        <div className="absolute left-0 top-7 -translate-x-1/2 whitespace-nowrap text-center font-mono text-[11px] uppercase tracking-widest text-white/70">
          {item.label}
        </div>
      </div>
    </div>
  )
}

function InfinityHub() {
  const pathRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const path = pathRef.current
    // svgEffect needs SVG path geometry (getTotalLength); skip in environments
    // that lack it (e.g. SSR is already handled by useEffect, this covers jsdom).
    if (!path || typeof path.getTotalLength !== 'function') return
    // A 25%-length window (pathLength) whose start (pathOffset) slides 0 -> 1 on
    // a linear loop, tracing a segment continuously around the infinity symbol.
    const pathOffset = motionValue(0)
    const cleanup = svgEffect(path, {
      opacity: motionValue(1),
      pathLength: motionValue(0.25),
      pathOffset,
    })
    const controls = animate(pathOffset, 1, {
      duration: 2,
      repeat: Infinity,
      ease: 'linear',
    })
    return () => {
      controls.stop()
      cleanup()
    }
  }, [])

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-testid="infinity-hub"
      className="h-16 w-16"
      style={{ filter: 'drop-shadow(0 0 5px rgba(45,212,191,0.6))' }}
    >
      <path
        d={INFINITY_PATH}
        fill="none"
        className="stroke-teal-400/15"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        ref={pathRef}
        d={INFINITY_PATH}
        fill="none"
        className="stroke-teal-400"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0}
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
        <div className="absolute left-1/2 top-1/2">
          <div className="orbit-spin-anim group-hover/orbit:[animation-play-state:paused]" data-paused={paused ? 'true' : undefined}>
            {/* Outer ring rides the same rotating group as the nodes, so ring +
                CTAs turn as one. A dashed teal stroke makes the rotation read. */}
            <div
              aria-hidden="true"
              data-testid="orbit-ring-outer"
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-teal-400/15"
              style={{ width: 2 * OUTER_RADIUS, height: 2 * OUTER_RADIUS }}
            />
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
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
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
