import { AlertTriangle } from 'lucide-react'
import type { RecruiterSnapshot } from '@/lib/types/applications.types'

/**
 * Recruiter-snapshot panel — surfaces the pipeline's "10-second recruiter read":
 * a score out of 100, a plain-language rationale, the top missing keywords, and
 * any red flags that a recruiter would notice first. Data comes from
 * `detail.analysis.recruiterSnapshot`.
 */

interface ScoreBand {
  readonly ring: string
  readonly text: string
  readonly label: string
}

function scoreBand(score: number): ScoreBand {
  if (score >= 70) {
    return {
      ring: 'text-emerald-600 dark:text-emerald-400',
      text: 'text-emerald-700 dark:text-emerald-300',
      label: 'Strong match',
    }
  }
  if (score >= 50) {
    return {
      ring: 'text-amber-600 dark:text-amber-400',
      text: 'text-amber-700 dark:text-amber-300',
      label: 'Partial match',
    }
  }
  return {
    ring: 'text-rose-600 dark:text-rose-400',
    text: 'text-rose-700 dark:text-rose-300',
    label: 'Stretch',
  }
}

export function RecruiterSnapshotPanel({ snapshot }: { readonly snapshot: RecruiterSnapshot }) {
  const band = scoreBand(snapshot.score)
  return (
    <section className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recruiter snapshot</h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">10-second read</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-0.5">
          <span className={`text-4xl font-semibold tabular-nums ${band.ring}`}>{snapshot.score}</span>
          <span className="text-base text-zinc-400">/100</span>
        </div>
        <div>
          <p className={`text-sm font-medium ${band.text}`}>{band.label}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{snapshot.scoreRationale}</p>
        </div>
      </div>

      {snapshot.missingKeywords.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Top missing keywords
          </p>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.missingKeywords.map((kw) => (
              <span
                key={kw}
                className="rounded-md border border-rose-300 px-2 py-0.5 text-xs text-rose-600 dark:border-rose-500/30 dark:text-rose-400"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {snapshot.redFlags.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Red flags
          </p>
          <ul className="space-y-1.5">
            {snapshot.redFlags.map((rf) => (
              <li key={rf.flag} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                <span>
                  <span className="font-medium">{rf.flag}</span>
                  {' — '}
                  <span className="text-zinc-500 dark:text-zinc-400">{rf.why}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
