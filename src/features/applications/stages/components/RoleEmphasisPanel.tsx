import type { DimensionMix } from '@/lib/types/applications.types'

/**
 * Role Emphasis panel — visualises the JD's `dimensionMix`: how the job
 * description splits its emphasis across role dimensions (customer-facing,
 * technical, AI/ML, support/ops, monitoring). Each weight is an integer 0-100,
 * the set ~sums to 100. Rendered as labelled horizontal bars, sorted descending
 * by weight, with zero-weight dimensions hidden. Returns null when there is no
 * signal (every weight is 0). Data comes from `detail.research.dimensionMix`.
 */

interface DimensionRow {
  readonly key: keyof DimensionMix
  readonly label: string
  readonly weight: number
}

const DIMENSION_LABELS: Record<keyof DimensionMix, string> = {
  customerFacing: 'Customer-facing',
  technical: 'Technical',
  aiMl: 'AI / ML',
  supportOps: 'Support / Ops',
  monitoring: 'Monitoring',
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
    <section className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Role emphasis</h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">JD weighting</span>
      </div>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="space-y-1">
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

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        How this role splits its emphasis — your résumé is weighted to match.
      </p>
    </section>
  )
}
