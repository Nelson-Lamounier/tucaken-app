'use client'

import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Sparkles, Timer, FolderOpen } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { ScheduleCard } from '../components/ScheduleCard'
import { SectionHeading } from '../components/SectionHeading'
import { TopicCard } from '../components/TopicCard'
import { PracticeModal } from '../components/PracticeModal'
import { useStageDraft } from '../hooks/useStageDraft'
import { researchToTopics, resolveStagePrep } from '../types/workspace'

const PRIORITY_BADGE: Record<string, string> = {
  high:   'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300',
  medium: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
  low:    'bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-white/5 dark:text-zinc-400',
}
const priorityBadge = (p: string): string => PRIORITY_BADGE[p] ?? PRIORITY_BADGE.low

interface TechnicalWorkspaceProps {
  readonly detail: ApplicationDetail
}

interface PracticeState {
  readonly title: string
  readonly blurb: string
}

const PRACTICE_GENERATE: PracticeState = {
  title: 'Generate a practice question',
  blurb: "We'll generate a role-specific question grounded in this job description and your Knowledge Base.",
}
const PRACTICE_MOCK: PracticeState = {
  title: 'Self-mock: time-boxed exercise',
  blurb: 'A timed exercise that mirrors the real round format, so you can rehearse under pressure.',
}

/**
 * Technical-round workspace (Stage 3). Topics are grounded in real Research
 * Agent evidence (verified/partial/gap matches); the practice flow is a stub
 * (PracticeModal). Project deep-links per topic await the topic→project
 * backend linkage (ADR-0003).
 */
export function TechnicalWorkspace({ detail }: TechnicalWorkspaceProps) {
  const { draft, setSchedule } = useStageDraft(detail.slug, 'technical')
  const [practice, setPractice] = useState<PracticeState | null>(null)

  const topics = useMemo(() => researchToTopics(detail.research), [detail.research])
  const prep = useMemo(() => resolveStagePrep(detail, 'technical'), [detail])

  return (
    <div className="space-y-8">
      {/* Schedule + format */}
      <section className="space-y-3">
        <SectionHeading title="Schedule &amp; format" />
        <ScheduleCard
          scheduleAt={draft.scheduleAt}
          formatNote={draft.formatNote}
          onChange={setSchedule}
          formatPlaceholder="e.g. 30m coding + 30m systems discussion"
        />
      </section>

      {/* Topics likely to come up — grounded in real research evidence */}
      <section className="space-y-3">
        <SectionHeading
          title="Topics likely to come up"
          subtitle="Grounded in the evidence found across your work for this role."
        />
        {topics.length > 0 ? (
          <div className="space-y-3">
            {topics.map(topic => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>
        ) : (
          <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No analysis yet — topics appear once the Research Agent has run for this application.
          </Card>
        )}
      </section>

      {/* Project reference sheet — linkage backend pending */}
      <section className="space-y-3">
        <SectionHeading
          title="Your project reference sheet"
          subtitle="The projects you&apos;re most likely to reference."
        />
        <Card className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <FolderOpen className="size-6 text-zinc-400" aria-hidden />
          <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            Ranked project references land once topic-to-project linking ships. For now, browse your
            case-studies directly.
          </p>
          <Link to="/projects" className="text-sm font-medium text-accent hover:underline">
            Open your projects
          </Link>
        </Card>
      </section>

      {/* Technical prep checklist — real, from the Coach Agent */}
      <section className="space-y-3">
        <SectionHeading
          title="Technical prep checklist"
          subtitle="What to revise before the round, prioritised for this role."
        />
        {prep && prep.technicalPrepChecklist.length > 0 ? (
          <div className="space-y-3">
            {prep.technicalPrepChecklist.map((item, i) => (
              <Card key={`prep-${String(i)}`} className="space-y-1.5 p-4">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${priorityBadge(item.priority)}`}>
                    {item.priority}
                  </span>
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">{item.topic}</h4>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.rationale}</p>
                {item.resources.length > 0 && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    Resources: {item.resources.join(', ')}
                  </p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No coaching generated for this stage yet. Generate interview prep to see a tailored checklist.
          </Card>
        )}
      </section>

      {/* Difficult questions — gap-bridging guidance from the Coach Agent */}
      {prep && prep.difficultQuestions.length > 0 && (
        <section className="space-y-3">
          <SectionHeading
            title="Difficult questions"
            subtitle="How to bridge honestly from a gap to an adjacent strength."
          />
          <div className="space-y-3">
            {prep.difficultQuestions.map((q, i) => (
              <Card key={`dq-${String(i)}`} className="space-y-1.5 p-4">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">{q.question}</h4>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{q.answerFramework}</p>
                <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
                  Bridge: {q.bridgeStrategy}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Practice */}
      <section className="space-y-3">
        <SectionHeading title="Practice" />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setPractice(PRACTICE_GENERATE)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <Sparkles className="size-4 text-accent" aria-hidden />
            Generate a practice question
          </button>
          <button
            type="button"
            onClick={() => setPractice(PRACTICE_MOCK)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <Timer className="size-4 text-accent" aria-hidden />
            Self-mock: time-boxed exercise
          </button>
        </div>
      </section>

      <PracticeModal
        open={practice !== null}
        onClose={() => setPractice(null)}
        title={practice?.title ?? ''}
        blurb={practice?.blurb ?? ''}
      />
    </div>
  )
}
