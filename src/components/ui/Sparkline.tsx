interface SparklineProps {
  /** trend series; needs ≥2 points to render */
  readonly points: number[]
  readonly className?: string
}

/** Inline area+line sparkline tinted with the brand accent. Pure SVG, no deps.
 *  Stroke/fill use var(--accent) so it tracks the theme automatically. */
export function Sparkline({ points, className }: SparklineProps) {
  if (!points || points.length < 2) return null

  const w = 64
  const h = 22
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const step = w / (points.length - 1)

  const coords = points.map(
    (p, i) => [i * step, h - ((p - min) / span) * (h - 4) - 2] as const,
  )
  const line = coords
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const gradientId = `sparkline-${points.join('-')}`

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
