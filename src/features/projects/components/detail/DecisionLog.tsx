import { CheckCircle2, GitCommitHorizontal, Lightbulb, Trash2 } from 'lucide-react'
import type { DecisionConfidence, ProjectDecision, JsonValue } from '../../lib/types'
import { EmptyHint, Section } from './Section'
import { InlineText } from './InlineText'
import { useDeleteDecision, usePatchDecision } from '../../server/mutations'

const CONFIDENCE_STYLES: Readonly<Record<DecisionConfidence, string>> = {
  high:   'bg-teal-400/10 text-teal-300 inset-ring inset-ring-teal-400/30',
  medium: 'bg-amber-400/10 text-amber-300 inset-ring inset-ring-amber-400/30',
  low:    'bg-rose-400/10 text-rose-300 inset-ring inset-ring-rose-400/30',
}

export interface DecisionLogProps {
  readonly projectId: string
  readonly items:     ProjectDecision[]
}

export function DecisionLog({ projectId, items }: DecisionLogProps) {
  return (
    <Section
      icon={Lightbulb}
      title="Decision log"
      subtitle="ADR-style entries inferred from commits, PRs, and READMEs"
    >
      {items.length === 0 ? (
        <EmptyHint>No decisions extracted yet.</EmptyHint>
      ) : (
        <ol className="space-y-4">
          {items.map((d) => (
            <DecisionCard key={d.id} projectId={projectId} decision={d} />
          ))}
        </ol>
      )}
    </Section>
  )
}

interface DecisionCardProps {
  readonly projectId: string
  readonly decision:  ProjectDecision
}

function DecisionCard({ projectId, decision }: DecisionCardProps) {
  const confidence = CONFIDENCE_STYLES[decision.confidence] ?? CONFIDENCE_STYLES.low
  const patch  = usePatchDecision(projectId, decision.id)
  const remove = useDeleteDecision(projectId)

  return (
    <li className="rounded-xl bg-white/2 px-4 py-3 inset-ring inset-ring-white/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <InlineText
            value={decision.title}
            displayAs="body"
            className="text-sm font-semibold text-zinc-100"
            ariaLabel="decision title"
            maxLength={200}
            onSave={(next) => patch.mutate({ title: next ?? decision.title })}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!decision.is_user_confirmed && (
            <button
              type="button"
              onClick={() => patch.mutate({ is_user_confirmed: true })}
              disabled={patch.isPending}
              className="rounded-full bg-teal-400/10 px-2 py-0.5 text-[10px] font-medium text-teal-300 inset-ring inset-ring-teal-400/30 hover:bg-teal-400/15 disabled:opacity-50"
            >
              Confirm
            </button>
          )}
          {decision.is_user_confirmed && (
            <span
              title="Confirmed by you"
              className="flex size-5 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300 inset-ring inset-ring-emerald-400/30"
            >
              <CheckCircle2 className="size-3" />
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${confidence}`}>
            {decision.confidence}
          </span>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && !window.confirm('Remove this decision?')) return
              remove.mutate(decision.id)
            }}
            disabled={remove.isPending}
            aria-label="Delete decision"
            className="flex size-5 items-center justify-center rounded-full text-zinc-600 hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-50"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
      <DecisionField
        label="Context"
        value={decision.context}
        onSave={(next) => patch.mutate({ context: next })}
      />
      <DecisionField
        label="Decision"
        value={decision.decision}
        onSave={(next) => patch.mutate({ decision: next })}
      />
      <DecisionField
        label="Consequences"
        value={decision.consequences}
        onSave={(next) => patch.mutate({ consequences: next })}
      />
      {hasSourceSignals(decision.source_signals) && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-600">
          <GitCommitHorizontal className="size-3" />
          Evidence captured
        </p>
      )}
      {(patch.isError || remove.isError) && (
        <p className="mt-2 text-xs text-rose-300">
          {(patch.error ?? remove.error) instanceof Error
            ? ((patch.error ?? remove.error) as Error).message
            : 'Update failed — change reverted'}
        </p>
      )}
    </li>
  )
}

interface DecisionFieldProps {
  readonly label:  string
  readonly value:  string | null
  readonly onSave: (next: string | null) => void
}

function DecisionField({ label, value, onSave }: DecisionFieldProps) {
  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-0.5">
        <InlineText
          value={value}
          multiline
          placeholder={`Click to add ${label.toLowerCase()}…`}
          ariaLabel={`decision ${label.toLowerCase()}`}
          onSave={onSave}
        />
      </div>
    </div>
  )
}

function hasSourceSignals(signals: JsonValue): boolean {
  if (signals === null || signals === undefined) return false
  if (Array.isArray(signals)) return signals.length > 0
  if (typeof signals === 'object') return Object.keys(signals).length > 0
  return false
}
