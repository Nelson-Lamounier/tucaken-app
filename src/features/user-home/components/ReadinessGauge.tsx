'use client'

import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from 'motion/react'
import { tierOf, TIER_TEXT, TIER_STROKE } from '../lib/tier'

// 270° arc opening at the bottom: sweeps from 135° clockwise to 405° (=45°).
const CENTER = 100
const ARC_R = 80
const START = 135
const SWEEP = 270

// Smooth settle, ~no overshoot — tuned via the Motion MCP spring visualiser.
const SCORE_SPRING = { type: 'spring', visualDuration: 0.8, bounce: 0.1 } as const

function polar(angleDeg: number, radius: number): readonly [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)]
}

const [ARC_SX, ARC_SY] = polar(START, ARC_R)
const [ARC_EX, ARC_EY] = polar(START + SWEEP, ARC_R)
// large-arc-flag=1 (>180°), sweep-flag=1 (clockwise)
const ARC_PATH = `M ${ARC_SX} ${ARC_SY} A ${ARC_R} ${ARC_R} 0 1 1 ${ARC_EX} ${ARC_EY}`

/** Animated radial readiness score (0–100): a colour-coded arc that draws to
 *  the value with the number counting up in the centre. Respects reduced-motion. */
export function ReadinessGauge({ value }: { readonly value: number }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)

  // Read only inside useTransform callbacks / as rendered children — never in render.
  const rounded = useTransform(() => Math.round(mv.get()))
  const arcLength = useTransform(mv, v => Math.max(0.001, Math.min(1, v / 100)))

  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, SCORE_SPRING)
    return () => controls.stop()
  }, [value, reduce, mv])

  const tier = tierOf(value)

  return (
    <div className="relative mx-auto aspect-square w-52">
      <svg viewBox="0 0 200 200" className="h-full w-full">
        {/* Track */}
        <path
          d={ARC_PATH}
          fill="none"
          strokeWidth={12}
          strokeLinecap="round"
          className="stroke-zinc-200 dark:stroke-white/10"
        />

        {/* Progress arc — pathLength drives the draw as the value counts up */}
        <motion.path
          d={ARC_PATH}
          fill="none"
          strokeWidth={12}
          strokeLinecap="round"
          className={TIER_STROKE[tier]}
          style={{ pathLength: arcLength, willChange: 'stroke-dashoffset' }}
        />

      </svg>

      {/* Centred score read-out */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="flex items-baseline">
          <motion.span className={`text-5xl font-semibold tabular-nums ${TIER_TEXT[tier]}`}>
            {rounded}
          </motion.span>
          <span className="text-base font-normal text-zinc-400 dark:text-zinc-500">/100</span>
        </span>
      </div>
    </div>
  )
}
