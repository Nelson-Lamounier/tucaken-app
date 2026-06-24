'use client'
// Animated flowing-line backdrop for the auth brand panel. Ported from a
// framer-motion reference to motion/react. stroke=currentColor so the parent
// sets the colour via a text-* class. Per-path duration derives from the index
// (no Math.random). Frozen under prefers-reduced-motion.
import { motion, useReducedMotion } from 'motion/react'
import { buildFloatingPaths } from './floating-paths-util'

export function FloatingPaths({ position }: { position: number }) {
  const reduce = useReducedMotion() ?? false
  const paths = buildFloatingPaths(position)

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="h-full w-full" viewBox="0 0 696 316" fill="none">
        <title>Background paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={path.opacity}
            style={{ willChange: 'opacity' }}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={
              reduce
                ? undefined
                : { pathLength: 1, opacity: [0.3, 0.6, 0.3], pathOffset: [0, 1, 0] }
            }
            transition={
              reduce
                ? undefined
                : { duration: 20 + (path.id % 10), repeat: Infinity, ease: 'linear' }
            }
          />
        ))}
      </svg>
    </div>
  )
}
