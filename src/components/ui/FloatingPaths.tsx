'use client'
// Flowing-line backdrop. Shared by the auth brand panel and the home hero.
//
// Reference "Background Paths" look — a segment of light continuously flows
// along each curved line — but in PURE CSS (stroke-dashoffset on pathLength=1
// normalised paths) instead of 72 JS-driven path animations, which ran on the
// main thread and starved the page. The CSS lives in styles.css
// (.floating-paths) and is frozen under prefers-reduced-motion.
//
// Per line we vary delay/duration and alternate the flow direction (inline
// style) so adjacent lines move at different speeds and opposite ways — the
// field reads as organic, never a single-direction march. No preserveAspectRatio
// override — the curves keep their natural sweep (slicing flattened them).
// stroke=currentColor → the parent sets the teal via a text-* class.
import { buildFloatingPaths } from './floating-paths-util'

export function FloatingPaths({ position, strokeScale = 1 }: { position: number; strokeScale?: number }) {
  const paths = buildFloatingPaths(position)

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="floating-paths h-full w-full" viewBox="0 0 696 316" fill="none">
        <title>Background paths</title>
        {paths.map((path) => (
          <path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width * strokeScale}
            strokeOpacity={path.opacity}
            pathLength={1}
            fill="none"
            style={{
              animationDelay: `-${((path.id * 0.7) % 12).toFixed(2)}s`,
              animationDuration: `${9 + (path.id % 8)}s`,
              // Alternate adjacent lines so the field never marches one way.
              animationDirection: path.id % 2 === 0 ? 'normal' : 'reverse',
            }}
          />
        ))}
      </svg>
    </div>
  )
}
