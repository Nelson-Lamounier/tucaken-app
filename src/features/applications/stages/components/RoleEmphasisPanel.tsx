import { SlidersHorizontal } from 'lucide-react'
import type { DimensionMix } from '@/lib/types/applications.types'

/**
 * Role Emphasis panel — visualises the JD's `dimensionMix`: how the job
 * description splits its emphasis across role dimensions (customer-facing,
 * technical, AI/ML, ops & support, observability). Each weight is an integer
 * 0-100, the set ~sums to 100. Rendered as labelled horizontal bars in a
 * responsive grid, sorted descending by weight, with zero-weight dimensions
 * hidden. Returns null when there is no signal (every weight is 0). Rendered
 * full-width in the at-a-glance dashboard (StageGlancePanel). Data comes from
 * `detail.research.dimensionMix`.
 */

/** Shared glance-card surface — matches StageGlancePanel's SURFACE. */
const SURFACE =
  'rounded-md bg-white p-5 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none'

interface DimensionRow {
  readonly key: keyof DimensionMix
  readonly label: string
  readonly weight: number
}

const DIMENSION_LABELS: Record<keyof DimensionMix, string> = {
  customerFacing: 'Customer-facing',
  technical: 'Technical',
  aiMl: 'AI / ML',
  supportOps: 'Ops & support',
  monitoring: 'Observability',
}

const DIMENSION_KEYS: readonly (keyof DimensionMix)[] = [
  'customerFacing',
  'technical',
  'aiMl',
  'supportOps',
  'monitoring',
]

export function RoleEmphasisPanel({ mix }: { readonly mix: DimensionMix }) {
  const rows: DimensionRow[] = []
  for (const key of DIMENSION_KEYS) {
    const weight = mix[key]
    if (weight > 0) {
      rows.push({ key, label: DIMENSION_LABELS[key], weight })
    }
  }
  rows.sort((a, b) => b.weight - a.weight)

  // No signal — render nothing.
  if (rows.length === 0) return null

  return (
    <div className={`flex h-full flex-col ${SURFACE}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-5 text-accent" />
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Role emphasis
          </span>
        </div>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">From the job description</span>
      </div>

      <ul className="mt-4 grid flex-1 gap-x-8 gap-y-3.5 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{row.label}</span>
              <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                {row.weight}%
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-2 w-full overflow-hidden rounded-md bg-zinc-200 dark:bg-white/10"
            >
              <div className="h-full rounded-md bg-accent" style={{ width: `${row.weight}%` }} />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Your tailored résumé leads with what this role weights most.
      </p>
    </div>
  )
}
