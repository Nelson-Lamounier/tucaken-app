// src/features/home/lib/pipeline-svg.tsx
// Pure SVG depth layers for the hero pipeline. No motion values here —
// the depth camera is static. reduce disables the pulse/glow.

const NODES = [
  { x: 60, y: 120 },
  { x: 200, y: 80 },
  { x: 200, y: 170 },
  { x: 340, y: 120 },
  { x: 470, y: 120 },
]

const CABLES = [
  'M60 120 C 130 120, 130 80, 200 80',
  'M60 120 C 130 120, 130 170, 200 170',
  'M200 80 C 270 80, 270 120, 340 120',
  'M200 170 C 270 170, 270 120, 340 120',
  'M340 120 L 470 120',
]

export function BgLayer({ reduce }: { reduce: boolean }) {
  void reduce
  return (
    <svg viewBox="0 0 520 240" className="h-full w-full" aria-hidden>
      <defs>
        <pattern id="pipe-grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0 H0 V26" fill="none" stroke="oklch(0.7 0.05 220 / 0.12)" strokeWidth="1" />
        </pattern>
        <radialGradient id="pipe-ambient" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="oklch(0.7 0.18 175 / 0.22)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect data-pipeline="grid" width="520" height="240" fill="url(#pipe-grid)" />
      <rect width="520" height="240" fill="url(#pipe-ambient)" />
    </svg>
  )
}

export function CoreLayer({ reduce }: { reduce: boolean }) {
  const pulseClass = reduce ? '' : 'pipe-pulse-anim'
  const glowClass = reduce ? '' : 'node-glow-anim'
  return (
    <svg viewBox="0 0 520 240" className="h-full w-full" aria-hidden>
      {CABLES.map((d, i) => (
        <g key={`c${i}`}>
          <path data-pipeline="cable" d={d} fill="none" stroke="oklch(0.5 0.04 220)" strokeWidth="2" />
          <path
            className={pulseClass}
            d={d}
            fill="none"
            stroke="oklch(0.85 0.16 175)"
            strokeWidth="2.5"
            strokeDasharray="14 50"
            strokeLinecap="round"
            style={{
              filter: 'drop-shadow(0 0 4px oklch(0.85 0.16 175))',
              willChange: 'filter',
              animationDelay: `${i * 0.4}s`,
            }}
          />
        </g>
      ))}
      {NODES.map((n, i) => (
        <rect
          key={`n${i}`}
          data-pipeline="node"
          className={glowClass}
          x={n.x - 11}
          y={n.y - 11}
          width="22"
          height="22"
          rx="4"
          transform={`rotate(45 ${n.x} ${n.y})`}
          fill="oklch(0.22 0.03 220)"
          stroke="oklch(0.7 0.14 175)"
          strokeWidth="1.5"
          style={{ animationDelay: `${i * 0.5}s` }}
        />
      ))}
    </svg>
  )
}
