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
import { researchToTopics } from '../types/workspace'

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
