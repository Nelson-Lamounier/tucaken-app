import type {
  SystemDesignCard,
  SystemDesignCoverage,
  SystemDesignFollowUpStatus,
} from '@/lib/types/applications.types'
import { SummaryGroup, SummaryRow, RailField, RailCallout } from '../components/workspace-shell'

/** Status → badge/chip colour. addressed = solid, partial = caution, gap = honest red. */
const STATUS_STYLE: Record<SystemDesignFollowUpStatus, string> = {
  addressed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  partial: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  gap: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

/** Rail detail for one concern: why it matters, the choice, the rehearsal script,
 *  gap guidance, follow-ups, and the evidence it is grounded in. */
function ConcernDetail({ card }: { readonly card: SystemDesignCard }) {
  return (
    <>
      <RailField label="Why it matters">{card.whyItMatters}</RailField>

      {card.choiceMade && <RailField label="Your choice">{card.choiceMade}</RailField>}

      <RailField label="How to articulate it">
        {/* First-person rehearsal script — multi-paragraph; preserve the line breaks. */}
        <p className="whitespace-pre-line">{card.articulation}</p>
      </RailField>

      {card.gapGuidance && (
        <RailCallout label="Addressing the gap" tone="warn">{card.gapGuidance}</RailCallout>
      )}

      {card.followUps.length > 0 && (
        <RailField label="Likely follow-ups">
          <ul className="space-y-2">
            {card.followUps.map(f => (
              <li key={f.question} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                <span className={`mr-2 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[f.status]}`}>{f.status}</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{f.question}</span>
                <span className="text-zinc-500 dark:text-zinc-400"> — {f.framing}</span>
              </li>
            ))}
          </ul>
        </RailField>
      )}

      {card.evidenceRefs.length > 0 && (
        <RailField label="Grounded in">
          <div className="flex flex-wrap gap-1.5">
            {card.evidenceRefs.map(e => (
              <span
                key={e.id}
                title={e.fileLine}
                className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {e.label}
              </span>
            ))}
          </div>
        </RailField>
      )}
    </>
  )
}

/**
 * The project-anchored System Design walkthrough — one clickable row per
 * JD-relevant concern; the rehearsal detail opens in the rail (mirrors the
 * Difficult-questions pattern on the technical stage).
 */
export function SystemDesignWalkthrough({
  cards,
  coverage,
}: {
  readonly cards: readonly SystemDesignCard[]
  readonly coverage?: SystemDesignCoverage | null
}) {
  const subtitle = coverage
    ? `${coverage.relevantAddressed} of ${coverage.relevantTotal} role-relevant concerns grounded in your project work.`
    : 'Concern by concern, grounded in your project work.'
  return (
    <SummaryGroup id="system-design-walkthrough" title="System Design walkthrough" subtitle={subtitle} count={cards.length}>
      {cards.map(card => {
        const grounded = card.evidenceRefs.length > 0 && card.choiceMade !== null
        return (
          <SummaryRow
            key={card.concernId}
            id={card.concernId}
            label={card.concernQuestion}
            preview={card.whyItMatters}
            indicator={
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${grounded ? STATUS_STYLE.addressed : STATUS_STYLE.partial}`}>
                {grounded ? 'Grounded' : 'Gap'}
              </span>
            }
            detail={<ConcernDetail card={card} />}
          />
        )
      })}
    </SummaryGroup>
  )
}
