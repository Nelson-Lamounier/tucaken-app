import { Card } from '@/components/ui/Card'
import type {
  SystemDesignCard,
  SystemDesignCoverage,
  SystemDesignFollowUpStatus,
} from '@/lib/types/applications.types'
import { SummaryGroup } from '../components/workspace-shell'

/** Status → badge/chip colour. addressed = solid, partial = caution, gap = honest red. */
const STATUS_STYLE: Record<SystemDesignFollowUpStatus, string> = {
  addressed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  partial: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  gap: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

/** One concern card: question, why, the candidate's choice, the rehearsal script,
 *  follow-ups, and the evidence it is grounded in. */
function ConcernCard({ card }: { readonly card: SystemDesignCard }) {
  const grounded = card.evidenceRefs.length > 0 && card.choiceMade !== null
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{card.concernQuestion}</h4>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${grounded ? STATUS_STYLE.addressed : STATUS_STYLE.partial}`}
        >
          {grounded ? 'Grounded' : 'Gap'}
        </span>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">{card.whyItMatters}</p>

      {card.choiceMade && (
        <p className="text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Your choice: </span>
          {card.choiceMade}
        </p>
      )}

      {/* Rehearsal script — first-person, multi-paragraph; preserve the line breaks. */}
      <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        {card.articulation}
      </p>

      {card.gapGuidance && (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {card.gapGuidance}
        </p>
      )}

      {card.followUps.length > 0 && (
        <ul className="space-y-1.5">
          {card.followUps.map((f, i) => (
            <li key={i} className="text-xs">
              <span className={`mr-2 rounded px-1.5 py-0.5 font-medium ${STATUS_STYLE[f.status]}`}>{f.status}</span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{f.question}</span>
              <span className="text-zinc-500 dark:text-zinc-400"> — {f.framing}</span>
            </li>
          ))}
        </ul>
      )}

      {card.evidenceRefs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {card.evidenceRefs.map((e, i) => (
            <span
              key={i}
              title={e.fileLine}
              className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {e.label}
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}

/** The project-anchored System Design walkthrough — one card per JD-relevant concern. */
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
    <SummaryGroup id="system-design-walkthrough" title="System Design walkthrough" subtitle={subtitle}>
      <div className="space-y-3">
        {cards.map(card => (
          <ConcernCard key={card.concernId} card={card} />
        ))}
      </div>
    </SummaryGroup>
  )
}
