'use client'
// Flowing-line backdrop for the auth brand panel.
//
// The reference component animates each path's pathLength/pathOffset with
// framer-motion — 72 JS-driven SVG animations on the main thread, which
// starved the auth form. This reproduces the same flowing-along-the-line look
// in PURE CSS (stroke-dashoffset, which is exactly what Motion's pathLength
// compiles to) so it runs off the JS main thread and never touches the form.
//
// Each path is normalised with pathLength={1} so the dash/offset values are in
// a 0..1 scale regardless of the curve's real length; a per-line animationDelay
// staggers the flow into a wave. stroke=currentColor → the parent sets the teal
// via a text-* class. The CSS lives in styles.css (.auth-paths) and is frozen
// under prefers-reduced-motion.
import { buildFloatingPaths } from './floating-paths-util'

export function FloatingPaths({ position }: { position: number }) {
  const paths = buildFloatingPaths(position)

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        // position 1 vs -1 flow in opposite directions (see .auth-paths CSS),
        // so the two mirrored line-sets cross instead of marching in lockstep.
        data-flow={position > 0 ? 'fwd' : 'rev'}
        className="auth-paths h-full w-full"
        viewBox="0 0 696 316"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
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
            style={{
              // Per-line stagger + varied speed (index-derived, no Math.random)
              // so lines drift out of phase and the field feels organic.
              animationDelay: `-${((path.id % 18) * 0.6).toFixed(2)}s`,
              animationDuration: `${(14 + (path.id % 9)).toFixed(0)}s`,
            }}
          />
        ))}
      </svg>
    </div>
  )
}
