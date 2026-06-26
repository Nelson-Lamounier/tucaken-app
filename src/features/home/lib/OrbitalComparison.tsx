"use client"
// src/features/home/lib/OrbitalComparison.tsx
// Radial comparison orbital: nodes orbit a teal Tucaken hub driven by a
// rotation MotionValue (no CSS spin); click snaps the node to the top and
// opens a centre card (spin pauses, infinity hidden); scroll flies nodes in
// from outside onto the ring. An accessible static list shows on mobile and
// under reduced motion.
import { motion, AnimatePresence, useReducedMotion, useScroll, useTransform, useMotionValue, animate, svgEffect, motionValue } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { FileSearch, Target, FileWarning, Fingerprint, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { baseNodeAngle, nodeX, nodeY, rotationToTop, shortestEquivalentAngle } from './orbital-geometry'
import type { ComparisonItem } from '../content'

const ICONS: Record<string, LucideIcon> = { FileSearch, Target, FileWarning, Fingerprint }
const OUTER_RADIUS = 200
const FLY_IN_RADIUS = 520

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
  baseAngle,
  rotation,
  radius,
  expanded,
  onToggle,
}: {
  item: ComparisonItem
  baseAngle: number
  rotation: MotionValue<number>
  radius: MotionValue<number>
  expanded: boolean
  onToggle: () => void
}) {
  const Icon = ICONS[item.icon] ?? FileSearch
  const x = useTransform(() => nodeX(baseAngle, rotation.get(), radius.get()))
  const y = useTransform(() => nodeY(baseAngle, rotation.get(), radius.get()))
  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{ x, y, willChange: 'transform' }}
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
    </motion.div>
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
  const rotation = useMotionValue(0)
  const { scrollYProgress } = useScroll({
    target: reduce ? undefined : orbitRef,
    offset: ['start end', 'end start'],
  })
  // Nodes fly in from outside (FLY_IN_RADIUS) and settle on the ring by the
  // scroll midpoint; useTransform clamps past 0.5 so they stay on the ring.
  const radius = useTransform(scrollYProgress, [0, 0.5], [FLY_IN_RADIUS, OUTER_RADIUS])
  const activeItem = items.find((x) => x.label === activeId) ?? null

  // Continuous spin while nothing is open; stopped on cleanup (and never started
  // under reduced motion or while a node is anchored open).
  useEffect(() => {
    if (reduce || activeId !== null) return
    const controls = animate(rotation, rotation.get() + 360, {
      duration: 48,
      ease: 'linear',
      repeat: Infinity,
    })
    return () => controls.stop()
  }, [reduce, activeId, rotation])

  const handleToggle = (index: number, label: string) => {
    if (activeId === label) {
      setActiveId(null)
      return
    }
    const target = shortestEquivalentAngle(rotationToTop(index, items.length), rotation.get())
    animate(rotation, target, { type: 'spring', stiffness: 120, damping: 20 })
    setActiveId(label)
  }

  if (reduce) {
    return <ComparisonList items={items} />
  }

  return (
    <div>
      <div className="block lg:hidden">
        <ComparisonList items={items} />
      </div>

      <div
        ref={orbitRef}
        className="relative hidden h-[520px] w-full lg:block"
        onClick={() => setActiveId(null)}
      >
        <div
          aria-hidden="true"
          data-testid="orbit-ring-outer"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-teal-400/15"
          style={{ width: 2 * OUTER_RADIUS, height: 2 * OUTER_RADIUS }}
        />

        {items.map((item, i) => (
          <OrbitalNode
            key={item.label}
            item={item}
            baseAngle={baseNodeAngle(i, items.length)}
            rotation={rotation}
            radius={radius}
            expanded={activeId === item.label}
            onToggle={() => handleToggle(i, item.label)}
          />
        ))}

        {activeId === null && (
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <InfinityHub />
          </div>
        )}

        <AnimatePresence>
          {activeItem && (
            <motion.div
              key={activeItem.label}
              data-testid="orbit-detail-card"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              style={{ willChange: 'transform, opacity' }}
              onClick={(e) => e.stopPropagation()}
              className="absolute left-1/2 top-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/15 bg-zinc-950/90 p-5 backdrop-blur-lg"
            >
              <ComparisonDetail item={activeItem} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
