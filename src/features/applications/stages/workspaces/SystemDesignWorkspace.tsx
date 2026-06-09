'use client'

import { Link } from '@tanstack/react-router'
import { ListChecks, FolderOpen } from 'lucide-react'
import type { ApplicationDetail, SystemTour } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { ArchitectureDiagram } from '@/features/projects/components/ArchitectureDiagram'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { SummaryGroup, SummaryRow } from '../components/workspace-shell'
import { resolveStagePrep } from '../types/workspace'
import { SystemDesignWalkthrough } from './SystemDesignWalkthrough'

interface SystemDesignWorkspaceProps {
  readonly detail: ApplicationDetail
}

/** Generic system-design question archetypes (not company-specific — that data
 *  has no backend yet). Honest, broadly-true patterns rather than fabricated
 *  $COMPANY specifics. */
const QUESTION_PATTERNS: readonly string[] = [
  'Design a high-write system (feed, metrics, logging) — focus on partitioning and back-pressure.',
  'Design a read-heavy system (timeline, catalogue) — focus on caching and fan-out.',
  'Design something with strong consistency needs (payments, inventory) — focus on transactions and idempotency.',
  'Scale an existing component — identify the bottleneck before adding machinery.',
]

/** The standard six-step framework + self-prompts. Generic, genuinely useful. */
const FRAMEWORK: readonly { step: string; prompts: readonly string[] }[] = [
  { step: '1. Requirements & scope', prompts: ['What are the functional vs non-functional needs?', 'What can I explicitly defer?'] },
  { step: '2. Estimates', prompts: ['QPS, read/write ratio, data volume, growth?', 'Does this fit one box or need sharding?'] },
  { step: '3. API & data model', prompts: ['What are the core entities and access patterns?', 'What does the contract look like?'] },
  { step: '4. High-level design', prompts: ['What are the main components and data flow?', 'Where are the boundaries?'] },
  { step: '5. Deep dive', prompts: ['Which component is riskiest — go deep there.', 'What are the tradeoffs of each choice?'] },
  { step: '6. Bottlenecks & wrap-up', prompts: ['Where does it fail under load?', 'What would I monitor and how would I scale next?'] },
]

/** Round types for which the system-tour walkthrough is surfaced. Undefined
 *  (safe-mode) also shows it — the data is the user's own and grounded. */
const TOUR_ROUND_TYPES: ReadonlySet<NonNullable<ApplicationDetail['technicalRoundType']>> =
  new Set(['system-design', 'architecture-review'])

/** Renders a single grounded system-tour walkthrough. Real content only. */
function SystemTourCard({ tour }: { readonly tour: SystemTour }) {
  const { systemMap } = tour
  return (
    <Card className="space-y-5 p-5">
      <div className="space-y-1">
        <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{tour.area}</h4>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{tour.context}</p>
      </div>

      {tour.keyDecisions.length > 0 && (
        <section className="space-y-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Key decisions</h5>
          <ul className="space-y-2">
            {tour.keyDecisions.map((d) => (
              <li key={d.decision} className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{d.decision}</span>
                {' — '}
                <span className="text-zinc-600 dark:text-zinc-400">{d.rationale}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tour.tradeoffs.length > 0 && (
        <section className="space-y-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Trade-offs</h5>
          <ul className="space-y-2">
            {tour.tradeoffs.map((t) => (
              <li key={t.tension} className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{t.tension}</span>
                {' → chose '}
                <span className="text-zinc-700 dark:text-zinc-300">{t.chosenPath}</span>
                <span className="text-zinc-500 dark:text-zinc-400">{' (cost: '}{t.cost}{')'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {systemMap && (
        <section className="space-y-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">System map</h5>
          {systemMap.diagramSource ? (
            <ArchitectureDiagram format={systemMap.diagramFormat} source={systemMap.diagramSource} />
          ) : (
            <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {systemMap.nodes.map((n) => (
                <li key={n.id}>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{n.label}</span>
                  {n.kind ? <span className="text-zinc-500"> ({n.kind})</span> : null}
                </li>
              ))}
              {systemMap.edges.map((e) => (
                <li key={`${e.from}->${e.to}`} className="text-zinc-500 dark:text-zinc-400">
                  {e.from} → {e.to}{e.label ? `: ${e.label}` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tour.outcomes.length > 0 && (
        <section className="space-y-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Outcomes</h5>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            {tour.outcomes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      {tour.whatIdChange.length > 0 && (
        <section className="space-y-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What I&apos;d change</h5>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            {tour.whatIdChange.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  )
}

/** Common question patterns — single row whose detail is the full archetype list. */
function QuestionPatternsGroup() {
  return (
    <SummaryGroup
      id="question-patterns"
      title="Common question patterns"
      subtitle="Archetypes to rehearse — not company-specific."
    >
      <SummaryRow
        id="question-patterns-list"
        label="Common question patterns"
        detail={
          <Card className="p-4">
            <ul className="space-y-2">
              {QUESTION_PATTERNS.map(p => (
                <li key={p} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <ListChecks className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </Card>
        }
      />
    </SummaryGroup>
  )
}

/** Honest empty-state when the user has no grounded system tours yet. */
function SystemToursEmptyState() {
  return (
    <Card className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <FolderOpen className="size-6 text-zinc-400" aria-hidden />
      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        Your projects&apos; architectural tradeoffs will surface here as a grounded walkthrough once a
        case-study (and its system tour) has been generated. For now, review the decisions in your
        case-studies.
      </p>
      <Link to="/projects" className="text-sm font-medium text-accent hover:underline">
        Open your projects
      </Link>
    </Card>
  )
}

/** Your own system design work — one row per grounded tour; empty-state inline. */
function SystemToursGroup({ tours }: { readonly tours: readonly SystemTour[] }) {
  return (
    <SummaryGroup
      id="system-tours"
      title="Your own system design work"
      subtitle="The architecture you actually built, ready to cite."
      count={tours.length}
    >
      {tours.length === 0 && <SystemToursEmptyState />}
      {tours.map(tour => (
        <SummaryRow
          key={tour.area}
          id={tour.area}
          label={tour.area}
          preview={tour.context}
          detail={<SystemTourCard tour={tour} />}
        />
      ))}
    </SummaryGroup>
  )
}

/** Framework to have ready — static inline section (no group dropdown, no rail).
 *  Each step keeps its own inline collapsible dropdown on the page. */
function FrameworkGroup() {
  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/2">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Framework to have ready</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Drive the discussion with a repeatable structure.</p>
      </div>
      <div className="rounded-md bg-white px-4 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none">
        {FRAMEWORK.map(({ step, prompts }) => (
          <CollapsibleSection key={step} title={step}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
              {prompts.map(prompt => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          </CollapsibleSection>
        ))}
      </div>
    </section>
  )
}

/**
 * System Design workspace (Stage 4). Question patterns + the six-step
 * framework are generic, genuinely-useful content. "Your own system design
 * work" surfaces the tradeoffs the user actually made — that per-project
 * tradeoff data has no backend yet (honest empty state; the TradeoffBadge
 * pattern lands when the linkage ships). See ADR-0003.
 *
 * Renders a fragment of SummaryGroups into the WorkspaceShell's left column.
 */
export function SystemDesignWorkspace({ detail }: SystemDesignWorkspaceProps) {
  // Schedule & format is edited from the dashboard SchedulePanel (shared draft via
  // StageDraftProvider), so the workspace no longer owns a stage-draft instance.

  // Surface the grounded system-tour walkthroughs only when the user actually
  // has tours AND the round is a system-design / architecture-review round (or
  // undefined safe-mode). Otherwise keep the honest empty-state fallback.
  const roundType = detail.technicalRoundType
  const tourGateOpen = roundType === undefined || TOUR_ROUND_TYPES.has(roundType)
  const tours = tourGateOpen ? (detail.systemTours ?? []) : []

  // The coach's project-anchored walkthrough (one card per JD-relevant concern).
  // Already on detail.coaching['system-design'].topics — render it as the primary
  // section when present; otherwise fall back to the generic question patterns.
  const prep = resolveStagePrep(detail, 'system-design')
  const walkthrough = prep?.systemDesignWalkthrough ?? []
  const coverage = prep?.systemDesignCoverage ?? null

  return (
    <>
      {walkthrough.length > 0 ? (
        <SystemDesignWalkthrough cards={walkthrough} coverage={coverage} />
      ) : (
        <QuestionPatternsGroup />
      )}

      <SystemToursGroup tours={tours} />

      <FrameworkGroup />
    </>
  )
}
