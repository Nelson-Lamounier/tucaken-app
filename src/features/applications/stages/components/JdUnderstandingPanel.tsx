import type { JdExtraction } from '@/lib/types/applications.types'
import { SummaryGroup } from './workspace-shell'

/**
 * "What we understood from your job description" — the JD-extractor's structured
 * read (required/preferred skills, tools, concepts) shown as chips. This is the
 * signal used to drive KB retrieval, surfaced for transparency.
 */
export function JdUnderstandingPanel({ jd }: { readonly jd: JdExtraction }) {
  const hasAny =
    jd.requiredSkills.length + jd.preferredSkills.length + jd.tools.length + jd.concepts.length > 0
  if (!hasAny && !jd.domain) return null

  return (
    <SummaryGroup
      id="jd-understanding"
      title="What we understood from your JD"
      subtitle="The signal extracted from the job description — used to find your matching evidence."
    >
      <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/2">
        {(jd.domain || jd.seniority) && (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {jd.domain}
            {jd.domain && jd.seniority ? ' · ' : ''}
            {jd.seniority ? <span className="text-zinc-500 dark:text-zinc-400">{jd.seniority}</span> : null}
          </p>
        )}
        <ChipGroup label="Required" tone="strong" items={jd.requiredSkills} />
        <ChipGroup label="Preferred" tone="muted" items={jd.preferredSkills} />
        <ChipGroup label="Tools" tone="accent" items={jd.tools} />
        <ChipGroup label="Concepts" tone="muted" items={jd.concepts} />
      </div>
    </SummaryGroup>
  )
}

const TONES: Record<'strong' | 'muted' | 'accent', string> = {
  strong: 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-white/15 dark:bg-white/10 dark:text-zinc-200',
  muted:  'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300',
  accent: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
}

function ChipGroup({
  label,
  items,
  tone,
}: {
  readonly label: string
  readonly items: readonly string[]
  readonly tone: 'strong' | 'muted' | 'accent'
}) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </span>
      {items.map((item) => (
        <span key={item} className={`rounded-md border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
          {item}
        </span>
      ))}
    </div>
  )
}
