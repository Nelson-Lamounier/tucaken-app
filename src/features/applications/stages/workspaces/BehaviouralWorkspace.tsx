'use client'

import { useMemo, useState } from 'react'
import { Plus, BookOpen } from 'lucide-react'
import type { ApplicationDetail, InterviewQuestion } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { ScheduleCard } from '../components/ScheduleCard'
import { StoryCard } from '../components/StoryCard'
import { StoryForm } from '../components/StoryForm'
import { PracticeModal } from '../components/PracticeModal'
import { SummaryGroup, SummaryRow } from '../components/workspace-shell'
import { useStageDraft } from '../hooks/useStageDraft'
import { useStoryBank } from '../hooks/useStoryBank'
import { STORY_THEMES, resolveStagePrep } from '../types/workspace'
import type { StarStory, StoryTheme } from '../types/workspace'

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

/** Theme chips shown as a story row's indicator. */
function StoryThemeChips({ themes }: { readonly themes: readonly StoryTheme[] }) {
  return (
    <span className="hidden flex-wrap gap-1 sm:flex">
      {themes.map(theme => (
        <span
          key={theme}
          className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-white/5 dark:text-zinc-400"
        >
          {theme}
        </span>
      ))}
    </span>
  )
}

interface StoryBankGroupProps {
  readonly stories: readonly StarStory[]
  readonly filtered: readonly StarStory[]
  readonly filter: Filter
  readonly onFilterChange: (filter: Filter) => void
  readonly onCreate: () => void
  readonly onEdit: (id: string) => void
  readonly onDelete: (id: string) => void
  readonly onPractice: (id: string) => void
}

/** Empty-state body for the story bank group. */
function StoryBankEmpty({ hasStories }: { readonly hasStories: boolean }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <BookOpen className="size-6 text-zinc-400" aria-hidden />
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {hasStories ? 'No stories match this theme yet.' : 'Your story bank is empty. Add a STAR story to start building reusable answers.'}
      </p>
    </Card>
  )
}

/** Story bank — filter chips + add button inline, one row per filtered story. */
function StoryBankGroup({
  stories,
  filtered,
  filter,
  onFilterChange,
  onCreate,
  onEdit,
  onDelete,
  onPractice,
}: StoryBankGroupProps) {
  return (
    <SummaryGroup id="story-bank" title="Your story bank" count={filtered.length}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(['All', ...STORY_THEMES] as const).map(theme => {
            const active = filter === theme
            return (
              <button
                key={theme}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(theme)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-(--accent) text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
                }`}
              >
                {theme}
              </button>
            )
          })}
        </div>
        <button type="button" onClick={onCreate} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-(--accent) px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
          <Plus className="size-4" aria-hidden />
          Add story
        </button>
      </div>

      {filtered.length === 0 && <StoryBankEmpty hasStories={stories.length > 0} />}
      {filtered.map(story => (
        <SummaryRow
          key={story.id}
          id={story.id}
          label={story.title}
          indicator={<StoryThemeChips themes={story.themes} />}
          detail={<StoryCard story={story} onEdit={onEdit} onDelete={onDelete} onPractice={onPractice} />}
        />
      ))}
    </SummaryGroup>
  )
}

/** Best-match story detail for a typical question (or gap guidance). */
function TypicalQuestionDetail({
  match,
}: {
  readonly match: StarStory | undefined
}) {
  if (!match) {
    return (
      <Card className="space-y-1.5 p-4">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Gap — consider drafting</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No story in your bank covers this theme yet. Draft one in the story bank so you have a tight answer ready.
        </p>
      </Card>
    )
  }
  return <StoryCard story={match} />
}

interface TypicalQuestionsGroupProps {
  readonly stories: readonly StarStory[]
}

/** Typical questions — one row per question, paired to a best-match story. */
function TypicalQuestionsGroup({ stories }: TypicalQuestionsGroupProps) {
  return (
    <SummaryGroup
      id="typical-questions"
      title="Typical questions"
      subtitle="Paired with your best-match story by theme."
      count={TYPICAL_QUESTIONS.length}
    >
      {TYPICAL_QUESTIONS.map(({ question, theme }) => {
        const match = stories.find(s => s.themes.includes(theme))
        return (
          <SummaryRow
            key={question}
            id={question}
            label={question}
            indicator={
              match ? (
                <span className="text-xs font-medium text-accent">{match.title}</span>
              ) : (
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Gap</span>
              )
            }
            detail={<TypicalQuestionDetail match={match} />}
          />
        )
      })}
    </SummaryGroup>
  )
}

/**
 * Behavioural workspace (Stage 5). The Story Bank starts empty and is
 * user-authored, persisted to localStorage (grilling decision / ADR-0003).
 * Typical questions are generic and paired to the user's bank by theme;
 * "generate from portfolio" is a separate follow-on.
 *
 * Renders a fragment of SummaryGroups into the WorkspaceShell's left column;
 * the StoryForm / PracticeModal overlays sit at the fragment root.
 */
/** Coach-generated behavioural questions — role-tailored; rehearse a STAR story for each. */
function CoachBehaviouralQuestionsGroup({ questions }: { readonly questions: readonly InterviewQuestion[] }) {
  if (questions.length === 0) return null
  return (
    <SummaryGroup
      id="coach-behavioural-questions"
      title="Likely behavioural questions"
      subtitle="Role-tailored by your interview coach — rehearse a STAR story for each."
    >
      <div className="space-y-2">
        {questions.map((q, i) => (
          <Card key={i} className="space-y-2 p-4">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{q.question}</p>
            {q.answerFramework && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Answer framework: {q.answerFramework}</p>
            )}
            {q.keyPoints.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                {q.keyPoints.map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </SummaryGroup>
  )
}

/** Coaching notes — free-text stage guidance from the Coach Agent. */
function CoachingNotesGroup({ notes }: { readonly notes: string | undefined }) {
  if (!notes) return null
  return (
    <SummaryGroup id="coaching-notes" title="Coaching notes" subtitle="Stage-specific guidance from your interview coach.">
      <Card className="p-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{notes}</p>
      </Card>
    </SummaryGroup>
  )
}

export function BehaviouralWorkspace({ detail }: BehaviouralWorkspaceProps) {
  const stageUserState = detail.stages?.['behavioural']?.user_state as Partial<import('../hooks/useStageDraft').StageDraft> | undefined
  const { draft, setSchedule } = useStageDraft(detail.slug, 'behavioural', stageUserState)
  const { stories, addStory, updateStory, removeStory } = useStoryBank(detail.slug)

  // Coach-generated behavioural prep (role-tailored questions + free-text notes).
  const prep = resolveStagePrep(detail, 'behavioural')
  const coachQuestions = prep?.behaviouralQuestions ?? []
  const coachingNotes = prep?.coachingNotes

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
    <>
      <SummaryGroup id="schedule" title="Schedule & format">
        <ScheduleCard scheduleAt={draft.scheduleAt} formatNote={draft.formatNote} onChange={setSchedule} formatPlaceholder="e.g. 45m behavioural" />
      </SummaryGroup>

      <CoachBehaviouralQuestionsGroup questions={coachQuestions} />

      <CoachingNotesGroup notes={coachingNotes} />

      <StoryBankGroup
        stories={stories}
        filtered={filtered}
        filter={filter}
        onFilterChange={setFilter}
        onCreate={openCreate}
        onEdit={openEdit}
        onDelete={removeStory}
        onPractice={() => setPracticeOpen(true)}
      />

      <TypicalQuestionsGroup stories={stories} />

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
    </>
  )
}
