import type {
  BarRaiserCoverage,
  BarRaiserPrinciple,
  BarRaiserPrincipleCoverage,
  BarRaiserStory,
  EvidenceRef,
} from '@/lib/types/applications.types'
import { SummaryGroup, SummaryRow, RailField, RailCallout } from '../components/workspace-shell'

/** Coverage → badge label + colour. strong = grounded green, partial = amber, none = honest red. */
const COVERAGE_BADGE: Record<BarRaiserPrincipleCoverage, { label: string; className: string }> = {
  strong: {
    label: 'Grounded',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  partial: {
    label: 'Partial',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  none: {
    label: 'Gap',
    className: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
}

/** One labelled STAR field within a story (Situation / Task / Action / Result). */
function StarField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      <span className="font-medium text-zinc-900 dark:text-zinc-100">{label}: </span>
      {value}
    </p>
  )
}

/** Evidence chips a story is grounded in. */
function EvidenceChips({ refs }: { readonly refs: readonly EvidenceRef[] }) {
  if (refs.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {refs.map((e) => (
        <span
          key={e.id}
          title={e.fileLine}
          className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {e.label}
        </span>
      ))}
    </div>
  )
}

/** One grounded story: title, STAR, the honesty-calibration callout, seniority note, evidence. */
function StoryBlock({ story }: { readonly story: BarRaiserStory }) {
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-white/10">
      <h5 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{story.title}</h5>

      <div className="space-y-1.5">
        <StarField label="Situation" value={story.situation} />
        <StarField label="Task" value={story.task} />
        <StarField label="Action" value={story.action} />
        <StarField label="Result" value={story.result} />
      </div>

      {/* Honesty calibration — the load-bearing feature. Styled distinctly (amber border). */}
      <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <span className="font-semibold">Honesty check: </span>
        {story.honestyCalibration}
      </p>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Seniority: </span>
        {story.seniorityNote}
      </p>

      <EvidenceChips refs={story.evidenceRefs} />
    </div>
  )
}

/** Rail detail for one principle: interpretation + grounded stories + probing
 *  questions + gap guidance. */
function PrincipleDetail({ principle }: { readonly principle: BarRaiserPrinciple }) {
  return (
    <>
      <RailField label="What they look for">{principle.interpretation}</RailField>

      {principle.stories.length > 0 && (
        <RailField label="Your stories">
          <div className="space-y-2.5">
            {principle.stories.map(story => (
              <StoryBlock key={story.title} story={story} />
            ))}
          </div>
        </RailField>
      )}

      {principle.probingQuestions.length > 0 && (
        <RailField label="Probing questions">
          <ul className="space-y-2">
            {principle.probingQuestions.map(q => (
              <li key={q.question} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{q.question}</span>
                <span className="text-zinc-500 dark:text-zinc-400"> — {q.framing}</span>
              </li>
            ))}
          </ul>
        </RailField>
      )}

      {principle.gapGuidance && (
        <RailCallout label="Addressing the gap" tone="warn">{principle.gapGuidance}</RailCallout>
      )}
    </>
  )
}

/**
 * The project-anchored Bar Raiser walkthrough — one clickable row per leadership
 * principle; the stories + probing detail open in the rail (mirrors the
 * Difficult-questions / System-design patterns).
 */
export function BarRaiserWalkthrough({
  cards,
  coverage,
}: {
  readonly cards: readonly BarRaiserPrinciple[]
  readonly coverage?: BarRaiserCoverage | null
}) {
  const subtitle = coverage
    ? `${coverage.relevantAddressed} of ${coverage.relevantTotal} leadership principles, grounded in your work.`
    : 'Principle by principle, grounded in your work.'
  return (
    <SummaryGroup id="bar-raiser-walkthrough" title="Bar Raiser walkthrough" subtitle={subtitle} count={cards.length}>
      {cards.map(card => {
        const badge = COVERAGE_BADGE[card.coverage]
        return (
          <SummaryRow
            key={card.principleId}
            id={card.principleId}
            label={card.principleName}
            preview={card.interpretation}
            indicator={
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
            }
            detail={<PrincipleDetail principle={card} />}
          />
        )
      })}
    </SummaryGroup>
  )
}
