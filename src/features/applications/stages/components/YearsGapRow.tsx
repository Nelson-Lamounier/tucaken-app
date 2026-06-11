import type { YearsGap } from '@/lib/types/applications.types'

interface GapBadgeProps {
  readonly gapYears: number
}

function GapBadge({ gapYears }: GapBadgeProps) {
  if (gapYears <= 0) return null
  return (
    <span className="ml-1 text-amber-600 dark:text-amber-400">({gapYears} short)</span>
  )
}

/**
 * Compact card surfacing the job-strategist years-gap signal:
 * relevant experience vs required, and a recruiter framing line.
 */
export function YearsGapRow({ yearsGap }: { readonly yearsGap: YearsGap }) {
  const { relevantYears, requiredYears, framingLine, gapYears } = yearsGap
  const wantedSuffix = requiredYears ? ` · ${requiredYears}+ wanted` : ''

  return (
    <section className="rounded-md border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Relevant experience</h3>
        <span className="text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
          {relevantYears} yrs relevant{wantedSuffix}
          <GapBadge gapYears={gapYears} />
        </span>
      </div>
      {framingLine ? (
        <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">{framingLine}</p>
      ) : null}
    </section>
  )
}
