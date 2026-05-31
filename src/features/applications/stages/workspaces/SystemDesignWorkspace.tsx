'use client'

import { Link } from '@tanstack/react-router'
import { ListChecks, FolderOpen } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { ScheduleCard } from '../components/ScheduleCard'
import { SectionHeading } from '../components/SectionHeading'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { useStageDraft } from '../hooks/useStageDraft'

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

/**
 * System Design workspace (Stage 4). Question patterns + the six-step
 * framework are generic, genuinely-useful content. "Your own system design
 * work" surfaces the tradeoffs the user actually made — that per-project
 * tradeoff data has no backend yet (honest empty state; the TradeoffBadge
 * pattern lands when the linkage ships). See ADR-0003.
 */
export function SystemDesignWorkspace({ detail }: SystemDesignWorkspaceProps) {
  const { draft, setSchedule } = useStageDraft(detail.slug, 'system-design')

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeading title="Schedule &amp; format" />
        <ScheduleCard
          scheduleAt={draft.scheduleAt}
          formatNote={draft.formatNote}
          onChange={setSchedule}
          formatPlaceholder="e.g. 45m design + 15m questions"
        />
      </section>

      <section className="space-y-3">
        <SectionHeading title="Common question patterns" subtitle="Archetypes to rehearse — not company-specific." />
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
      </section>

      <section className="space-y-3">
        <SectionHeading title="Your own system design work" subtitle="The tradeoffs you actually made, ready to cite." />
        <Card className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <FolderOpen className="size-6 text-zinc-400" aria-hidden />
          <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Your projects&apos; architectural tradeoffs will surface here as badges once decision
            detection is wired into prep. For now, review the decisions in your case-studies.
          </p>
          <Link to="/projects" className="text-sm font-medium text-accent hover:underline">
            Open your projects
          </Link>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Framework to have ready" subtitle="Drive the discussion with a repeatable structure." />
        <Card className="px-4">
          {FRAMEWORK.map(({ step, prompts }) => (
            <CollapsibleSection key={step} title={step}>
              <ul className="list-disc space-y-1 pl-5">
                {prompts.map(prompt => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ul>
            </CollapsibleSection>
          ))}
        </Card>
      </section>
    </div>
  )
}
