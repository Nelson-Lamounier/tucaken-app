'use client'

import { useEffect } from 'react'
import { motion, useReducedMotion, useMotionValue, useTransform, animate } from 'motion/react'
import { PieChart } from 'lucide-react'
import { TONE, type Tone } from '@/components/ui/tone'
import type { ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { stageGlanceTiles, type GlanceTileData } from '../lib/stage-glance'

/** Shared card surface — rounded-md per the project radius convention. */
const SURFACE =
  'rounded-md bg-white p-5 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none'

const GRID = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } } as const
const TILE = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } } as const

/** Tone → bar fill colour for the level meter. */
const TONE_BAR: Record<Tone, string> = {
  good: 'bg-emerald-500 dark:bg-emerald-400',
  warn: 'bg-amber-500 dark:bg-amber-400',
  bad: 'bg-red-500 dark:bg-red-400',
  muted: 'bg-zinc-300 dark:bg-white/15',
  accent: 'bg-[var(--accent)]',
}

const BAR_SPRING = { type: 'spring', visualDuration: 0.5, bounce: 0.25 } as const

/** Number of thin equalizer bars the meter is divided into. */
const BAR_COUNT = 28

interface LevelMeterProps {
  readonly level: number
  readonly max: number
  readonly tone: Tone
  readonly reduce: boolean
}

/** A thin equalizer-style meter: `BAR_COUNT` bars whose heights ramp left→right,
 *  filled up to the `level / max` share in the tone colour, each rising from the
 *  baseline on mount. Fills its container in both axes. */
function LevelMeter({ level, max, tone, reduce }: LevelMeterProps) {
  const filledCount = Math.round((level / max) * BAR_COUNT)
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => ({
    heightPct: 28 + (i * 72) / (BAR_COUNT - 1),
    filled: i < filledCount,
    delay: i * 0.02,
  }))

  return (
    <div className="flex h-full min-h-16 items-end gap-0.5" aria-hidden>
      {bars.map(bar => (
        <motion.span
          key={bar.heightPct}
          className={`flex-1 rounded-sm ${bar.filled ? TONE_BAR[tone] : 'bg-zinc-200 dark:bg-white/10'}`}
          style={{ height: `${bar.heightPct}%`, transformOrigin: 'bottom', willChange: 'transform' }}
          initial={{ scaleY: reduce ? 1 : 0 }}
          animate={{ scaleY: 1 }}
          transition={{ ...BAR_SPRING, delay: reduce ? 0 : bar.delay }}
        />
      ))}
    </div>
  )
}

const COUNT_SPRING = { type: 'spring', visualDuration: 0.8, bounce: 0 } as const
const BAR_FILL_SPRING = { type: 'spring', visualDuration: 0.7, bounce: 0.1 } as const

/** Hero number that counts up 0 → value on mount. */
function CountUpValue({ value, className }: { readonly value: number; readonly className: string }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)
  const rounded = useTransform(() => Math.round(mv.get()))

  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, COUNT_SPRING)
    return () => controls.stop()
  }, [mv, value, reduce])

  return <motion.span className={className}>{rounded}</motion.span>
}

interface ShareBarProps {
  readonly value: number
  readonly total: number
  readonly tone: Tone
  readonly reduce: boolean
}

/** Thin track filling to value/total of the assessed skills, growing from the left. */
function ShareBar({ value, total, tone, reduce }: ShareBarProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
        <motion.div
          className={`h-full rounded-full ${TONE_BAR[tone]}`}
          style={{ width: `${pct}%`, transformOrigin: 'left', willChange: 'transform' }}
          initial={{ scaleX: reduce ? 1 : 0 }}
          animate={{ scaleX: 1 }}
          transition={BAR_FILL_SPRING}
        />
      </div>
      <span className="text-[11px] font-medium tabular-nums text-zinc-400">{pct}%</span>
    </div>
  )
}

const HERO_VALUE = 'font-semibold leading-none tracking-tight tabular-nums text-zinc-900 dark:text-zinc-100'

/** Body of a tile — one of three shapes: level meter (ordinal), count-up + share
 *  bar (proportional count), or a plain hero value. if/else avoids nested ternaries. */
function TileBody({ tile, reduce }: { readonly tile: GlanceTileData; readonly reduce: boolean }) {
  const isNumeric = !Number.isNaN(Number(tile.value))
  const valueSize = isNumeric ? 'text-4xl' : 'text-3xl'
  const nameBlock = (
    <div>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{tile.name}</p>
      {tile.sub && <p className={`mt-0.5 text-[11px] font-medium ${TONE[tile.tone].text}`}>{tile.sub}</p>}
    </div>
  )

  if (tile.meter) {
    return (
      <>
        <div className="flex-1 pt-1">
          <LevelMeter level={tile.meter.level} max={tile.meter.max} tone={tile.tone} reduce={reduce} />
        </div>
        <p className={`text-lg font-semibold leading-tight ${TONE[tile.tone].text}`}>{tile.value}</p>
      </>
    )
  }

  if (tile.share) {
    return (
      <>
        <CountUpValue value={tile.share.value} className={`${HERO_VALUE} ${valueSize}`} />
        <ShareBar value={tile.share.value} total={tile.share.total} tone={tile.tone} reduce={reduce} />
        {nameBlock}
      </>
    )
  }

  return (
    <>
      <p className={`${HERO_VALUE} ${valueSize}`}>{tile.value}</p>
      {nameBlock}
    </>
  )
}

/** A single at-a-glance KPI tile — icon + label, then its body (value / meter / share). */
function GlanceTile({ tile }: { readonly tile: GlanceTileData }) {
  const reduce = useReducedMotion()
  const Icon = tile.icon

  return (
    <div className={`flex h-full flex-col gap-3 ${SURFACE}`}>
      <div className="flex items-center gap-2">
        <Icon className={`size-5 ${TONE[tile.tone].dot}`} />
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          {tile.label}
        </span>
      </div>

      <TileBody tile={tile} reduce={Boolean(reduce)} />
    </div>
  )
}

interface CompareRow {
  readonly key: string
  readonly name: string
  readonly count: number
  /** Tailwind bg-* for the legend dot. */
  readonly dot: string
  /** Tailwind stroke-* for the donut arc. */
  readonly stroke: string
}

const DONUT_SIZE = 120
const DONUT_STROKE = 14
const DONUT_R = (DONUT_SIZE - DONUT_STROKE) / 2
const DONUT_C = 2 * Math.PI * DONUT_R
const DONUT_MID = DONUT_SIZE / 2

/** Fill-on-mount spring — mirrors the Resume-Readiness gauge. */
const FILL_SPRING = { type: 'spring', visualDuration: 0.9, bounce: 0.12 } as const

interface Arc {
  readonly key: string
  readonly stroke: string
  /** full arc length in stroke-dash units (DONUT_C × fraction) */
  readonly len: number
  /** start offset around the ring in stroke-dash units */
  readonly offset: number
}

/** Cumulative dash arcs for the non-empty segments. */
function buildArcs(rows: readonly CompareRow[], total: number): Arc[] {
  if (total === 0) return []
  const arcs: Arc[] = []
  let acc = 0
  for (const row of rows) {
    if (row.count === 0) continue
    const fraction = row.count / total
    arcs.push({ key: row.key, stroke: row.stroke, len: fraction * DONUT_C, offset: acc * DONUT_C })
    acc += fraction
  }
  return arcs
}

interface ArcSegmentProps {
  readonly len: number
  readonly offset: number
  readonly stroke: string
  readonly delay: number
  readonly reduce: boolean
}

/** One donut segment that fills from 0 → its length on mount (dash-length spring). */
function ArcSegment({ len, offset, stroke, delay, reduce }: ArcSegmentProps) {
  const progress = useMotionValue(reduce ? 1 : 0)
  // Animate the dash length while the gap takes the remainder, so a single
  // segment grows in place. Read the MotionValue only inside the callback.
  const dash = useTransform(() => {
    const p = progress.get()
    return `${len * p} ${DONUT_C - len * p}`
  })

  useEffect(() => {
    if (reduce) {
      progress.set(1)
      return
    }
    const controls = animate(progress, 1, { ...FILL_SPRING, delay })
    return () => controls.stop()
  }, [progress, reduce, delay])

  return (
    <motion.circle
      cx={DONUT_MID}
      cy={DONUT_MID}
      r={DONUT_R}
      fill="none"
      strokeWidth={DONUT_STROKE}
      strokeLinecap="butt"
      className={stroke}
      strokeDasharray={dash}
      strokeDashoffset={-offset}
      transform={`rotate(-90 ${DONUT_MID} ${DONUT_MID})`}
    />
  )
}

/**
 * Skill-coverage donut correlating Verified / Partial / Gaps as shares of the
 * total assessed skills, with a counted, percentaged legend. The taller left
 * panel of the glance dashboard.
 */
function ResearchCompareGraphic({ detail }: { readonly detail: ApplicationDetail }) {
  const reduce = useReducedMotion()
  const research = detail.research
  const rows: CompareRow[] = [
    { key: 'verified', name: 'Verified matches', count: research?.verifiedMatches?.length ?? 0, dot: 'bg-emerald-500 dark:bg-emerald-400', stroke: 'stroke-emerald-500 dark:stroke-emerald-400' },
    { key: 'partial', name: 'Partial matches', count: research?.partialMatches?.length ?? 0, dot: 'bg-amber-500 dark:bg-amber-400', stroke: 'stroke-amber-500 dark:stroke-amber-400' },
    { key: 'gaps', name: 'Skills gaps', count: research?.gaps?.length ?? 0, dot: 'bg-red-500 dark:bg-red-400', stroke: 'stroke-red-500 dark:stroke-red-400' },
  ]
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const arcs = buildArcs(rows, total)

  return (
    <div className={`flex h-full flex-col ${SURFACE}`}>
      <div className="flex items-center gap-2">
        <PieChart className="size-5 text-accent" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Skill coverage
        </span>
      </div>

      <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-6">
        <svg viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} className="size-44 shrink-0" role="img" aria-label="Skill coverage breakdown">
          <circle
            cx={DONUT_MID}
            cy={DONUT_MID}
            r={DONUT_R}
            fill="none"
            strokeWidth={DONUT_STROKE}
            className="stroke-zinc-100 dark:stroke-white/10"
          />
          {arcs.map(arc => (
            <ArcSegment
              key={arc.key}
              len={arc.len}
              offset={arc.offset}
              stroke={arc.stroke}
              delay={reduce ? 0 : (arc.offset / DONUT_C) * 0.45}
              reduce={Boolean(reduce)}
            />
          ))}
          <text
            x={DONUT_MID}
            y={DONUT_MID - 4}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-zinc-900 font-bold dark:fill-zinc-100"
            style={{ fontSize: 22 }}
          >
            {total}
          </text>
          <text
            x={DONUT_MID}
            y={DONUT_MID + 15}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-zinc-400 uppercase"
            style={{ fontSize: 9, letterSpacing: 0.5 }}
          >
            skills
          </text>
        </svg>

        <ul className="w-full space-y-3">
          {rows.map(row => {
            const pct = total > 0 ? Math.round((row.count / total) * 100) : 0
            return (
              <li key={row.key} className="flex items-center gap-2.5 text-sm">
                <span className={`size-2.5 shrink-0 rounded-full ${row.dot}`} aria-hidden />
                <span className="flex-1 truncate text-zinc-600 dark:text-zinc-300">{row.name}</span>
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{row.count}</span>
                <span className="w-9 text-right text-xs tabular-nums text-zinc-400">{pct}%</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

interface StageGlancePanelProps {
  readonly detail: ApplicationDetail
  readonly stage: InterviewStage
}

/**
 * KB-style "at a glance" dashboard panel for the active stage. A taller
 * skill-coverage graphic on the left correlates Verified / Partial / Gaps; the
 * four stat tiles fill a 2×2 block on the right at matching height. Tiles are
 * dynamic per stage (see stageGlanceTiles) and re-stagger on stage change.
 */
export function StageGlancePanel({ detail, stage }: StageGlancePanelProps) {
  const tiles = stageGlanceTiles(stage, detail)
  return (
    <motion.div
      key={stage}
      className="grid gap-4 lg:grid-cols-3"
      variants={GRID}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={TILE} style={{ willChange: 'transform' }} className="lg:col-span-1">
        <ResearchCompareGraphic detail={detail} />
      </motion.div>

      <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:grid-rows-2 lg:col-span-2">
        {tiles.map(tile => (
          <motion.div key={tile.key} variants={TILE} style={{ willChange: 'transform' }}>
            <GlanceTile tile={tile} />
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
