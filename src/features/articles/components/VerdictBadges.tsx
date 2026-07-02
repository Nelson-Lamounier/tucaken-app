import type { RunVerdicts } from '@/features/articles/lib/parse-run-verdicts'

interface VerdictBadgesProps {
  readonly verdicts: RunVerdicts
}

const BADGE = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'

const QA_CLASS: Record<string, string> = {
  publish: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  approve: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  revise: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  reject: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
}

const OK = 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
const BAD = 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
const WARN = 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
const NEUTRAL = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'

/**
 * Compact one-line badge row summarising a pipeline run's four verdicts
 * (QA, grounding, prose, structural lint). Renders nothing for a verdict the
 * run did not produce, so an older run without lint/prose degrades cleanly.
 */
export function VerdictBadges({ verdicts }: VerdictBadgesProps) {
  const { qa, grounding, prose, lint, evidence } = verdicts
  const lintDirty = lint !== undefined && (lint.errors > 0 || lint.warnings > 0)
  const evidenceDirty = evidence !== undefined && evidence.defects > 0

  return (
    <>
      {qa?.recommendation && (
        <span className={`${BADGE} ${QA_CLASS[qa.recommendation] ?? NEUTRAL}`}>
          QA: {qa.recommendation}
          {qa.overallScore !== undefined && ` (${qa.overallScore})`}
        </span>
      )}
      {grounding && (
        <span
          className={`${BADGE} ${grounding.status === 'GROUNDED' ? OK : BAD}`}
          title={grounding.reason ?? undefined}
        >
          {grounding.status === 'GROUNDED' ? 'Grounded' : 'Not grounded'}
        </span>
      )}
      {prose && (
        <span className={`${BADGE} ${prose.status === 'PASS' ? OK : WARN}`}>
          Prose: {prose.status}
          {prose.total !== undefined && ` (${prose.total})`}
        </span>
      )}
      {lintDirty && (
        <span className={`${BADGE} ${lint.errors > 0 ? BAD : WARN}`}>
          Lint: {lint.errors}E / {lint.warnings}W
        </span>
      )}
      {evidenceDirty && (
        <span className={`${BADGE} ${BAD}`}>
          Evidence: {evidence.defects} defect{evidence.defects === 1 ? '' : 's'}
        </span>
      )}
    </>
  )
}
