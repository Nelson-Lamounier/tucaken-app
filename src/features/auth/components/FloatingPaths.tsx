'use client'
// Animated flowing-line backdrop for the auth brand panel.
//
// PERF: the lines are painted ONCE as static <path> elements. The whole field
// is drifted by a SINGLE compositor transform on the wrapper (x/y) rather than
// animating pathLength/pathOffset on every path — those are non-compositable
// SVG attributes and animating 36+ of them per instance hammers the main
// thread, which stalled the auth form's own enter animations and made typing
// janky. One transform per instance keeps the effect off the main thread.
//
// stroke=currentColor so the parent sets the colour via a text-* class.
// Frozen under prefers-reduced-motion.
import { motion, useReducedMotion } from 'motion/react'
import { buildFloatingPaths } from './floating-paths-util'

export function FloatingPaths({ position }: { position: number }) {
  const reduce = useReducedMotion() ?? false
  const paths = buildFloatingPaths(position)

  return (
    <motion.div
      // Oversized so the gentle drift never exposes the panel edges.
      className="pointer-events-none absolute -inset-12"
      style={{ willChange: 'transform' }}
      animate={reduce ? undefined : { x: [0, 14 * position, 0], y: [0, -10, 0] }}
      transition={reduce ? undefined : { duration: 26, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg className="h-full w-full" viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice">
        <title>Background paths</title>
        {paths.map((path) => (
          <path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={path.opacity}
            fill="none"
          />
        ))}
      </svg>
    </motion.div>
  )
}
