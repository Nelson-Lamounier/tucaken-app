import { CheckCircle2, GitCommitHorizontal, Lightbulb } from 'lucide-react'
import type { DecisionConfidence, ProjectDecision } from '../../lib/types'
import { EmptyHint, Section } from './Section'

const CONFIDENCE_STYLES: Readonly<Record<DecisionConfidence, string>> = {
  high:   'bg-teal-400/10 text-teal-300 inset-ring inset-ring-teal-400/30',
  medium: 'bg-amber-400/10 text-amber-300 inset-ring inset-ring-amber-400/30',
  low:    'bg-rose-400/10 text-rose-300 inset-ring inset-ring-rose-400/30',
}

export function DecisionLog({ items }: { readonly items: ProjectDecision[] }) {
  return (
    <Section icon={Lightbulb} title="Decision log" subtitle="ADR-style entries inferred from commits, PRs, and READMEs">
      {items.length === 0 ? (
        <EmptyHint>No decisions extracted yet.</EmptyHint>
      ) : (
        <ol className="space-y-4">
          {items.map((d) => (
            <DecisionCard key={d.id} decision={d} />
          ))}
        </ol>
      )}
    </Section>
  )
}

function DecisionCard({ decision }: { readonly decision: ProjectDecision }) {
  const confidence = CONFIDENCE_STYLES[decision.confidence] ?? CONFIDENCE_STYLES.low
  return (
    <li className="rounded-xl bg-white/2 px-4 py-3 inset-ring inset-ring-white/10">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">{decision.title}</h3>
        <div className="flex shrink-0 items-center gap-1.5">
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
        </div>
      </div>
      <DecisionField label="Context"      value={decision.context} />
      <DecisionField label="Decision"     value={decision.decision} />
      <DecisionField label="Consequences" value={decision.consequences} />
      {hasSourceSignals(decision.source_signals) && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-600">
          <GitCommitHorizontal className="size-3" />
          Evidence captured
        </p>
      )}
    </li>
  )
}

function DecisionField({ label, value }: { readonly label: string; readonly value: string | null }) {
  if (!value) return null
  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-zinc-300">{value}</p>
    </div>
  )
}

function hasSourceSignals(signals: unknown): boolean {
  if (signals === null || signals === undefined) return false
  if (Array.isArray(signals)) return signals.length > 0
  if (typeof signals === 'object') return Object.keys(signals).length > 0
  return false
}
