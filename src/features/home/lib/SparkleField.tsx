"use client"
// Decorative twinkling sparkle layer for the pricing reveal. Positions, sizes
// and timings are deterministically seeded (no Math.random — SonarLint S2245),
// so SSR and client markup match and keys are stable. Twinkle animates
// opacity/scale only; static under reduced motion.
import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'

// Deterministic pseudo-random in [0,1) from an integer seed.
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

interface Sparkle {
  id: number
  left: number
  top: number
  size: number
  delay: number
  duration: number
}

function buildSparkles(count: number): Sparkle[] {
  const out: Sparkle[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      id: i,
      left: seeded(i * 3 + 1) * 100,
      top: seeded(i * 3 + 2) * 100,
      size: 1 + seeded(i * 3 + 3) * 2.5,
      delay: seeded(i + 7) * 4,
      duration: 2.5 + seeded(i + 11) * 2.5,
    })
  }
  return out
}

interface Props {
  count?: number
  className?: string
}

export function SparkleField({ count = 36, className = '' }: Props) {
  const reduce = useReducedMotion() ?? false
  const sparkles = useMemo(() => buildSparkles(count), [count])
  return (
    <div
      aria-hidden="true"
      className={[
        'pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]',
        className,
      ].join(' ')}
    >
      {sparkles.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full bg-teal-300"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            willChange: 'opacity, transform',
          }}
          initial={{ opacity: 0.15 }}
          animate={reduce ? { opacity: 0.2 } : { opacity: [0.15, 0.8, 0.15], scale: [1, 1.6, 1] }}
          transition={
            reduce
              ? undefined
              : { duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      ))}
    </div>
  )
}
