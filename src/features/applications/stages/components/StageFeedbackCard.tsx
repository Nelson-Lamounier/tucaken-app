import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { putStageFeedbackFn } from '@/server/pipelines'
import type { FeedbackCategory, StageFeedback, StageOutcome } from '@/lib/types/applications.types'

/** Outcomes that are terminal — the only ones that surface the feedback card. */
const TERMINAL_OUTCOMES: ReadonlySet<StageOutcome> = new Set<StageOutcome>(['rejected', 'withdrew', 'ghosted'])

/** Human-readable label for each opt-in feedback category. */
const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  compensation: 'Compensation',
  skills_mismatch: 'Skills mismatch',
  culture_fit: 'Culture fit',
  communication: 'Communication',
  technical_perf: 'Technical performance',
  process_timing: 'Process / timing',
  unclear: 'Unclear',
  other: 'Other',
}

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as FeedbackCategory[]

const INPUT_CLASS =
  'block w-full rounded-md border-0 bg-zinc-50 p-2 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10'

interface StageFeedbackCardProps {
  readonly slug: string
  readonly stageType: string
  readonly outcome: StageOutcome
  readonly existing?: StageFeedback
}

/** One-click category selector. Selected chip is highlighted; click again to clear. */
function CategoryChips({
  selected,
  onSelect,
}: {
  readonly selected?: FeedbackCategory
  readonly onSelect: (c?: FeedbackCategory) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_ORDER.map(cat => {
        const isSelected = selected === cat
        return (
          <button
            key={cat}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(isSelected ? undefined : cat)}
            className={
              isSelected
                ? 'rounded-full bg-teal-600 px-3 py-1 text-xs font-medium text-white'
                : 'rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }
          >
            {CATEGORY_LABELS[cat]}
          </button>
        )
      })}
    </div>
  )
}

/** Optional 1–5 self-rating of how the user's own prep went. Click active to clear. */
function PrepRating({
  value,
  onChange,
}: {
  readonly value?: number
  readonly onChange: (n?: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map(n => {
        const isActive = value === n
        return (
          <button
            key={n}
            type="button"
            aria-label={`Prep self-rating ${n}`}
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? undefined : n)}
            className={
              isActive
                ? 'size-7 rounded-md bg-teal-600 text-xs font-medium text-white'
                : 'size-7 rounded-md bg-zinc-100 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

/** Confirmed state shown after a successful submit. */
function ConfirmedState() {
  return (
    <Card className="flex items-center gap-2 p-4">
      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Thanks — captured. You can revisit this anytime to spot patterns across applications.
      </p>
    </Card>
  )
}

interface FormState {
  readonly category?: FeedbackCategory
  readonly note: string
  readonly companyFeedback: string
  readonly verbatim: boolean
  readonly prepSelfRating?: number
}

/** Local form state seeded from any existing feedback. */
function useFeedbackForm(existing?: StageFeedback) {
  const [state, setState] = useState<FormState>({
    category: existing?.userCategory,
    note: existing?.userNote ?? '',
    companyFeedback: existing?.companyFeedback ?? '',
    verbatim: Boolean(existing?.companyFeedbackVerbatim),
    prepSelfRating: existing?.prepSelfRating,
  })
  const patch = (p: Partial<FormState>) => setState(s => ({ ...s, ...p }))
  return { state, patch }
}

/** Maps form state to the admin-api PUT payload, dropping empty strings. */
function toPayload(slug: string, stageType: string, s: FormState): StageFeedback & { slug: string; stage: string } {
  const companyFeedback = s.companyFeedback.trim()
  return {
    slug,
    stage: stageType,
    userCategory: s.category,
    userNote: s.note.trim() || undefined,
    companyFeedback: companyFeedback || undefined,
    companyFeedbackVerbatim: companyFeedback ? s.verbatim : undefined,
    prepSelfRating: s.prepSelfRating,
  }
}

/** The capture form body — chips, notes, company-feedback, prep rating, actions. */
function FeedbackForm({
  state,
  patch,
  pending,
  errored,
  onSubmit,
  onDismiss,
}: {
  readonly state: FormState
  readonly patch: (p: Partial<FormState>) => void
  readonly pending: boolean
  readonly errored: boolean
  readonly onSubmit: () => void
  readonly onDismiss: () => void
}) {
  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Sorry this one didn&apos;t work out.</h4>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          If you have a sense of what happened — from the company or your own read — capturing it helps you spot
          patterns. No need to write anything if you&apos;d rather move on.
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-zinc-500">What was your read?</span>
        <CategoryChips selected={state.category} onSelect={c => patch({ category: c })} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="feedback-note" className="block text-xs font-medium text-zinc-500">
          Anything you want to remember (optional)
        </label>
        <textarea
          id="feedback-note"
          rows={2}
          value={state.note}
          onChange={e => patch({ note: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="company-feedback" className="block text-xs font-medium text-zinc-500">
          Feedback from the company (verbatim)
        </label>
        <textarea
          id="company-feedback"
          rows={2}
          value={state.companyFeedback}
          onChange={e => patch({ companyFeedback: e.target.value })}
          className={INPUT_CLASS}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={state.verbatim}
            onChange={e => patch({ verbatim: e.target.checked })}
            className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 dark:border-white/10 dark:bg-white/5"
          />
          This is verbatim from them
        </label>
      </div>

      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-zinc-500">How did your prep go? (optional)</span>
        <PrepRating value={state.prepSelfRating} onChange={n => patch({ prepSelfRating: n })} />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button variant="secondary" onClick={onSubmit} disabled={pending}>
          {pending ? 'Saving…' : 'Save feedback'}
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Skip / dismiss
        </button>
      </div>

      {errored && <p className="text-xs text-rose-600 dark:text-rose-400">Couldn&apos;t save just now — try again.</p>}
    </Card>
  )
}

/**
 * Opt-in feedback capture shown only at a terminal stage outcome
 * (rejected / withdrew / ghosted). Supportive, low-pressure: the user can
 * skip entirely. Submits via `putStageFeedbackFn` (PUT to admin-api).
 */
export function StageFeedbackCard({ slug, stageType, outcome, existing }: StageFeedbackCardProps) {
  const [dismissed, setDismissed] = useState(false)
  const { state, patch } = useFeedbackForm(existing)
  const mutation = useMutation({
    mutationFn: () => putStageFeedbackFn({ data: toPayload(slug, stageType, state) }),
  })

  if (!TERMINAL_OUTCOMES.has(outcome) || dismissed) return null
  if (mutation.isSuccess) return <ConfirmedState />

  return (
    <FeedbackForm
      state={state}
      patch={patch}
      pending={mutation.isPending}
      errored={mutation.isError}
      onSubmit={() => mutation.mutate()}
      onDismiss={() => setDismissed(true)}
    />
  )
}
