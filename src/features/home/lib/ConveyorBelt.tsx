// src/features/home/lib/ConveyorBelt.tsx
// Full-bleed decorative backdrop: an "application conveyor" scrolling
// right→left through processing stations. Pure CSS animation (compositor
// only); prefers-reduced-motion freezes it via styles.css kill-switch.
// No pointer interaction, no motion values — deliberately dependency-free.

const ITEMS = [
  'network-policies.yaml',
  'Kafka migration · ADR-007',
  'spot-fleet · cost −38%',
  'EKS autoscaling',
  'PR #284 · zero-trust',
  '99.95% uptime',
]

const STATIONS = ['Ingest', 'Ground', 'Qualified']

function Item({ label, index, count }: { label: string; index: number; count: number }) {
  // Negative stagger spreads items across the item-state cycle so different
  // tiles read as inbound / scanning / qualified simultaneously.
  const delay = `-${((index / count) * 32).toFixed(2)}s`
  return (
    <div
      data-belt="item"
      className="relative mx-6 flex h-16 w-44 shrink-0 items-center rounded-lg border border-white/10 bg-zinc-900/70 px-3 backdrop-blur-sm"
      style={{ willChange: 'transform' }}
    >
      <span className="font-mono text-[11px] leading-tight text-zinc-400">{label}</span>
      <span
        className="item-state-anim pointer-events-none absolute inset-0 rounded-lg border border-emerald-400/60 bg-emerald-400/10"
        style={{ willChange: 'opacity', animationDelay: delay }}
      />
    </div>
  )
}

function Group() {
  return (
    <div data-belt="group" className="flex shrink-0 items-center">
      {ITEMS.map((label, i) => (
        <Item key={`${label}-${i}`} label={label} index={i} count={ITEMS.length} />
      ))}
    </div>
  )
}

export function ConveyorBelt() {
  return (
    <div data-belt="root" aria-hidden className="absolute inset-0 overflow-hidden bg-zinc-950">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
        <div className="belt-scroll-anim flex w-max" style={{ willChange: 'transform' }}>
          <Group />
          <Group />
        </div>
        <div className="absolute inset-x-0 top-1/2 -z-10 h-px -translate-y-1/2 bg-white/10" />
      </div>

      {STATIONS.map((name, i) => (
        <div
          key={name}
          data-belt="station"
          className="absolute top-0 bottom-0 flex w-px flex-col items-center justify-center"
          style={{ left: `${25 + i * 25}%` }}
        >
          <div
            className="scan-sweep-anim h-2/3 w-px bg-gradient-to-b from-transparent via-teal-300/70 to-transparent"
            style={{ willChange: 'opacity, transform', animationDelay: `${i * 0.5}s` }}
          />
          <span className="absolute bottom-8 font-mono text-[9px] uppercase tracking-widest text-teal-300/50">
            {name}
          </span>
        </div>
      ))}

      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/60 to-zinc-950/30" />
      <div className="absolute inset-0 bg-zinc-950/40" />
    </div>
  )
}
