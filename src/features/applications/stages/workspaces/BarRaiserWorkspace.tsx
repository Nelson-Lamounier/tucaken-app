'use client'

import { useMemo, useState } from 'react'
import { PenLine } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { ScheduleCard } from '../components/ScheduleCard'
import { SectionHeading } from '../components/SectionHeading'
import { EvidenceIndicator } from '../components/EvidenceIndicator'
import { StoryCard } from '../components/StoryCard'
import { StoryForm } from '../components/StoryForm'
import { useStageDraft } from '../hooks/useStageDraft'
import { useStoryBank } from '../hooks/useStoryBank'
import {
  LEADERSHIP_PRINCIPLES,
  storiesForPrinciple,
  coverageStrength,
  type LeadershipPrinciple,
} from '../types/principles'
import type { StoryTheme } from '../types/workspace'

interface BarRaiserWorkspaceProps {
  readonly detail: ApplicationDetail
}

/**
 * Bar Raiser workspace (Stage 6). A leadership-principle coverage matrix over
 * the shared Story Bank: each principle's Evidence Indicator and story count
 * come from the user's existing stories (by theme mapping). Principles with no
 * coverage get a "Draft a story" CTA that opens the form pre-tagged. Per-commit
 * evidence detection has no backend yet (honest copy; ADR-0003).
 */
export function BarRaiserWorkspace({ detail }: BarRaiserWorkspaceProps) {
  const { draft, setSchedule } = useStageDraft(detail.slug, 'bar-raiser')
  const { stories, addStory } = useStoryBank(detail.slug)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftThemes, setDraftThemes] = useState<readonly StoryTheme[] | null>(null)

  const rows = useMemo(
    () =>
      LEADERSHIP_PRINCIPLES.map(principle => {
        const matched = storiesForPrinciple(principle, stories)
        return { principle, matched, strength: coverageStrength(matched.length) }
      }),
    [stories],
  )

  const uncovered = rows.filter(r => r.strength === 'none')
  const selected = rows.find(r => r.principle.id === selectedId)

  function draftFrom(principle: LeadershipPrinciple) {
    setDraftThemes(principle.themes)
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeading title="Schedule &amp; format" />
        <ScheduleCard scheduleAt={draft.scheduleAt} formatNote={draft.formatNote} onChange={setSchedule} formatPlaceholder="e.g. 60m leadership principles" />
      </section>

      {/* Values matrix */}
      <section className="space-y-3">
        <SectionHeading title="Company values matrix" subtitle="Story coverage per leadership principle. Click one to see your matching stories." />
        <Card className="divide-y divide-zinc-200 dark:divide-white/10">
          {rows.map(({ principle, matched, strength }) => {
            const isSelected = principle.id === selectedId
            return (
              <button
                key={principle.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedId(isSelected ? null : principle.id)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5 ${isSelected ? 'bg-zinc-50 dark:bg-white/5' : ''}`}
              >
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{principle.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">{matched.length} {matched.length === 1 ? 'story' : 'stories'}</span>
                  <EvidenceIndicator strength={strength} />
                </span>
              </button>
            )
          })}
        </Card>

        {/* Stories for the selected principle */}
        {selected && (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Stories for {selected.principle.name}
            </p>
            {selected.matched.length > 0 ? (
              selected.matched.map(story => <StoryCard key={story.id} story={story} />)
            ) : (
              <Card className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No stories cover this principle yet.
              </Card>
            )}
          </div>
        )}
      </section>

      {/* Principles without stories */}
      {uncovered.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Principles without stories" subtitle="Where do you have evidence? Draft a story to close the gap." />
          <div className="grid gap-3 sm:grid-cols-2">
            {uncovered.map(({ principle }) => (
              <Card key={principle.id} className="flex flex-col gap-3 p-4">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{principle.name}</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Automatic evidence detection from your commits is coming. For now, draft a story
                  for this principle from memory.
                </p>
                <button
                  type="button"
                  onClick={() => draftFrom(principle)}
                  className="mt-auto inline-flex items-center gap-1.5 self-start rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                >
                  <PenLine className="size-3.5" aria-hidden />
                  Draft a story from this evidence
                </button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <StoryForm
        key={draftThemes ? draftThemes.join(',') : 'closed'}
        open={draftThemes !== null}
        onClose={() => setDraftThemes(null)}
        defaultThemes={draftThemes ?? undefined}
        onSubmit={addStory}
      />
    </div>
  )
}
