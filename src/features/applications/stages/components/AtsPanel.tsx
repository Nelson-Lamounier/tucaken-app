import { CheckCircle2, AlertTriangle, HelpCircle, FileText } from 'lucide-react'
import type { AtsCheckResult, AtsKeywordCoverage } from '@/lib/types/applications.types'

/** Shared glance-card surface — matches StageGlancePanel's SURFACE so this card
 *  sits cohesively above the JD panel in the at-a-glance dashboard. */
const SURFACE =
  'rounded-md bg-white p-5 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none'

/**
 * ATS check panel — renders the job-strategist's applicant-tracking-system
 * assessment of the tailored resume (machine-readability, standard sections,
 * contact extraction, parse-breakers, JD keyword coverage, issues). Data comes
 * from `detail.analysis.atsCheck` (resumes.ats_check_json), produced by render →
 * parse-back → assert.
 */

const STATUS_META: Record<
  AtsCheckResult['status'],
  { label: string; chip: string; Icon: typeof CheckCircle2 }
> = {
  passed: {
    label: 'ATS-ready',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  issues: {
    label: 'Needs attention',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  unverified: {
    label: 'Unverified',
    chip: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400',
    Icon: HelpCircle,
  },
}

function FactRow({ ok, label, value }: { readonly ok: boolean; readonly label: string; readonly value: string }) {
  const tone = ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={`font-medium ${tone}`}>{value}</span>
    </div>
  )
}

function keywordChipClass(kw: AtsKeywordCoverage): string {
  if (!kw.present) {
    return 'border border-red-300 text-red-600 dark:border-red-500/30 dark:text-red-400'
  }
  if (kw.grounded) {
    return 'border border-transparent bg-teal-600/15 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300'
  }
  return 'border border-zinc-200 bg-white text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300'
}

export function AtsPanel({ ats }: { readonly ats: AtsCheckResult }) {
  const meta = STATUS_META[ats.status]
  const present = ats.jdKeywordCoverage.filter((k) => k.present).length
  const total = ats.jdKeywordCoverage.length

  return (
    <section className={`space-y-4 ${SURFACE}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">ATS check</h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Tailored resume</span>
        </div>
        <div className="flex items-center gap-2">
          {typeof ats.coverageScore === 'number' && (
            <span
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
              title="Weighted JD-keyword coverage: required skills 70%, remaining terms 30%"
            >
              Coverage {Math.round(ats.coverageScore * 100)}%
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.chip}`}>
            <meta.Icon className="size-3.5" />
            {meta.label}
          </span>
        </div>
      </div>

      {/* Machine-readability + contact extraction */}
      <div className="grid gap-2 sm:grid-cols-2">
        <FactRow ok={ats.machineReadable} label="Machine-readable text" value={ats.machineReadable ? 'Yes' : 'No'} />
        <FactRow
          ok={Boolean(ats.contactDetected.name)}
          label="Name parsed"
          value={ats.contactDetected.name || 'Not found'}
        />
        <FactRow
          ok={Boolean(ats.contactDetected.email)}
          label="Email parsed"
          value={ats.contactDetected.email || 'Not found'}
        />
        <FactRow ok={ats.parseBreakers.length === 0} label="Parse breakers" value={String(ats.parseBreakers.length)} />
      </div>

      {/* Standard sections detected */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          <FileText className="size-3.5" /> Sections detected
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ats.standardSectionsDetected.length === 0 ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">None detected</span>
          ) : (
            ats.standardSectionsDetected.map((s) => (
              <span
                key={s}
                className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
              >
                {s}
              </span>
            ))
          )}
        </div>
      </div>

      {/* JD keyword coverage */}
      {total > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            JD keyword coverage · {present}/{total}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ats.jdKeywordCoverage.map((kw) => (
              <span key={kw.term} className={`rounded-md px-2 py-0.5 text-xs ${keywordChipClass(kw)}`}>
                {kw.term}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            Teal = covered &amp; KB-verified · grey = covered · red = missing.
          </p>
        </div>
      )}

      {/* Issues */}
      {ats.issues.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Issues
          </p>
          <ul className="space-y-1">
            {ats.issues.map((issue) => (
              <li key={issue} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
