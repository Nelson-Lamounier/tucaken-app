'use client'

import { useMemo, useState } from 'react'
import { Plus, BookOpen } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { ScheduleCard } from '../components/ScheduleCard'
import { SectionHeading } from '../components/SectionHeading'
import { StoryCard } from '../components/StoryCard'
import { StoryForm } from '../components/StoryForm'
import { PracticeModal } from '../components/PracticeModal'
import { useStageDraft } from '../hooks/useStageDraft'
import { useStoryBank } from '../hooks/useStoryBank'
import { STORY_THEMES } from '../types/workspace'
import type { StoryTheme } from '../types/workspace'

interface BehaviouralWorkspaceProps {
  readonly detail: ApplicationDetail
}

type Filter = StoryTheme | 'All'

/** Generic behavioural questions, each tied to the theme a good answer needs.
 *  Not company-specific (no backend for that); paired to the user's bank. */
const TYPICAL_QUESTIONS: readonly { question: string; theme: StoryTheme }[] = [
  { question: 'Tell me about a conflict with a teammate and how you resolved it.', theme: 'Conflict' },
  { question: 'Describe a time you led without formal authority.', theme: 'Leadership' },
  { question: 'Tell me about a failure and what you learned.', theme: 'Failure' },
  { question: 'Describe navigating a highly ambiguous problem.', theme: 'Ambiguity' },
  { question: "What's an impact you're most proud of?", theme: 'Impact' },
  { question: 'Tell me about a time you grew from feedback.', theme: 'Growth' },
]

/**
 * Behavioural workspace (Stage 5). The Story Bank starts empty and is
 * user-authored, persisted to localStorage (grilling decision / ADR-0003).
 * Typical questions are generic and paired to the user's bank by theme;
 * "generate from portfolio" is a separate follow-on.
 */
export function BehaviouralWorkspace({ detail }: BehaviouralWorkspaceProps) {
  const stageUserState = detail.stages?.['behavioural']?.user_state as Partial<import('../hooks/useStageDraft').StageDraft> | undefined
  const { draft, setSchedule } = useStageDraft(detail.slug, 'behavioural', stageUserState)
  const { stories, addStory, updateStory, removeStory } = useStoryBank(detail.slug)

  const [filter, setFilter] = useState<Filter>('All')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [practiceOpen, setPracticeOpen] = useState(false)

  const filtered = useMemo(
    () => (filter === 'All' ? stories : stories.filter(s => s.themes.includes(filter))),
    [stories, filter],
  )
  const editing = useMemo(() => stories.find(s => s.id === editingId), [stories, editingId])

  function openCreate() {
    setEditingId(null)
    setFormOpen(true)
  }
  function openEdit(id: string) {
    setEditingId(id)
    setFormOpen(true)
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeading title="Schedule &amp; format" />
        <ScheduleCard scheduleAt={draft.scheduleAt} formatNote={draft.formatNote} onChange={setSchedule} formatPlaceholder="e.g. 45m behavioural" />
      </section>

      {/* Story bank */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading title="Your story bank" />
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-(--accent) px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            <Plus className="size-4" aria-hidden />
            Add story
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {(['All', ...STORY_THEMES] as const).map(theme => {
            const active = filter === theme
            return (
              <button
                key={theme}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(theme)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-(--accent) text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
                }`}
              >
                {theme}
              </button>
            )
          })}
        </div>

        {filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map(story => (
              <StoryCard
                key={story.id}
                story={story}
                onEdit={openEdit}
                onDelete={removeStory}
                onPractice={() => setPracticeOpen(true)}
              />
            ))}
          </div>
        ) : (
          <Card className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <BookOpen className="size-6 text-zinc-400" aria-hidden />
            <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
              {stories.length === 0
                ? 'Your story bank is empty. Add a STAR story to start building reusable answers.'
                : 'No stories match this theme yet.'}
            </p>
          </Card>
        )}
      </section>

      {/* Typical questions paired with best-match story */}
      <section className="space-y-3">
        <SectionHeading title="Typical questions" subtitle="Paired with your best-match story by theme." />
        <Card className="divide-y divide-zinc-200 dark:divide-white/10">
          {TYPICAL_QUESTIONS.map(({ question, theme }) => {
            const match = stories.find(s => s.themes.includes(theme))
            return (
              <div key={question} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{question}</p>
                {match ? (
                  <span className="text-xs font-medium text-accent">{match.title}</span>
                ) : (
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Gap — consider drafting</span>
                )}
              </div>
            )
          })}
        </Card>
      </section>

      <StoryForm
        key={editingId ?? 'new'}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing ? { title: editing.title, situation: editing.situation, task: editing.task, action: editing.action, result: editing.result, themes: editing.themes } : undefined}
        onSubmit={draftStory => {
          if (editingId) updateStory(editingId, draftStory)
          else addStory(draftStory)
        }}
      />

      <PracticeModal
        open={practiceOpen}
        onClose={() => setPracticeOpen(false)}
        title="Practice telling this"
        blurb="Rehearse this story out loud against a timer, with prompts to keep your STAR structure tight."
      />
    </div>
  )
}
