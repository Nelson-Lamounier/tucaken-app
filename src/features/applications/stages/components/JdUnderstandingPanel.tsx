import { ScanText } from 'lucide-react'
import type { JdExtraction } from '@/lib/types/applications.types'

/** Shared glance-card surface — matches StageGlancePanel's SURFACE so this card
 *  sits cohesively beside the skill-coverage donut and the Fit tile. */
const SURFACE =
  'rounded-md bg-white p-5 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none'

/**
 * "What we understood from the JD" — the JD-extractor's structured read of the
 * job description (domain/seniority + required/preferred skills, tools,
 * concepts), shown as grouped chips. This is the signal that drives KB
 * retrieval, surfaced for transparency. Rendered in the at-a-glance dashboard
 * (StageGlancePanel) beside the skill-coverage donut.
 */
export function JdUnderstandingPanel({ jd }: { readonly jd: JdExtraction }) {
  const hasAny =
    jd.requiredSkills.length + jd.preferredSkills.length + jd.tools.length + jd.concepts.length > 0
  if (!hasAny && !jd.domain) return null

  return (
    <div className={`flex h-full flex-col ${SURFACE}`}>
      <div className="flex items-center gap-2">
        <ScanText className="size-5 text-accent" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          What we understood from the JD
        </span>
      </div>

      {(jd.domain || jd.seniority) && (
        <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {jd.domain}
          {jd.domain && jd.seniority ? <span className="font-normal text-zinc-400 dark:text-zinc-500"> · </span> : null}
          {jd.seniority ? <span className="font-normal text-zinc-500 dark:text-zinc-400">{jd.seniority}</span> : null}
        </p>
      )}

      <div className="mt-4 flex flex-1 flex-col gap-3.5">
        <ChipGroup label="Required" tone="accent" items={jd.requiredSkills} />
        <ChipGroup label="Preferred" tone="strong" items={jd.preferredSkills} />
        <ChipGroup label="Tools" tone="strong" items={jd.tools} />
        <ChipGroup label="Concepts" tone="muted" items={jd.concepts} />
      </div>
    </div>
  )
}

const TONES: Record<'strong' | 'muted' | 'accent', string> = {
  accent: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  strong: 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-white/15 dark:bg-white/10 dark:text-zinc-200',
  muted:  'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300',
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
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className={`rounded-md border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
