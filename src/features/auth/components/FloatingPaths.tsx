'use client'
// Flowing-line backdrop for the auth brand panel.
//
// Matches the reference "Background Paths" look — each line draws itself in
// (stroke-dashoffset 1 -> 0) and then gently breathes in opacity — but in PURE
// CSS instead of 72 JS-driven framer-motion path animations (which ran on the
// main thread and starved the auth form). The CSS lives in styles.css
// (.auth-paths) and is frozen under prefers-reduced-motion.
//
// Each path is normalised with pathLength={1} so the draw is a clean 1 -> 0
// dash-offset regardless of the curve's real length; a per-line animationDelay
// staggers the draw + breathe so the field reads as organic. No
// preserveAspectRatio override — the curves keep their natural sweep (slicing
// flattened them). stroke=currentColor → the parent sets the teal via text-*.
import { buildFloatingPaths } from './floating-paths-util'

export function FloatingPaths({ position }: { position: number }) {
  const paths = buildFloatingPaths(position)

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="auth-paths h-full w-full" viewBox="0 0 696 316" fill="none">
        <title>Background paths</title>
        {paths.map((path) => (
          <path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={path.opacity}
            pathLength={1}
            fill="none"
            style={{ animationDelay: `-${((path.id % 18) * 0.5).toFixed(2)}s` }}
          />
        ))}
      </svg>
    </div>
  )
}
