'use client'

import { useMemo, useState } from 'react'
import { PenLine } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { EvidenceIndicator } from '../components/EvidenceIndicator'
import { StoryCard } from '../components/StoryCard'
import { StoryForm } from '../components/StoryForm'
import { SummaryGroup, SummaryRow } from '../components/workspace-shell'
import { useStoryBank } from '../hooks/useStoryBank'
import {
  LEADERSHIP_PRINCIPLES,
  storiesForPrinciple,
  coverageStrength,
  type LeadershipPrinciple,
} from '../types/principles'
import { resolveStagePrep } from '../types/workspace'
import type { EvidenceStrength, StarStory, StoryTheme } from '../types/workspace'
import { BarRaiserWalkthrough } from './BarRaiserWalkthrough'

interface BarRaiserWorkspaceProps {
  readonly detail: ApplicationDetail
}

interface PrincipleRow {
  readonly principle: LeadershipPrinciple
  readonly matched: readonly StarStory[]
  readonly strength: EvidenceStrength
}

/** Detail body for one principle: its matching stories, or a draft CTA when uncovered. */
function PrincipleDetail({
  principle,
  stories,
  onDraft,
}: {
  readonly principle: LeadershipPrinciple
  readonly stories: readonly StarStory[]
  readonly onDraft: (principle: LeadershipPrinciple) => void
}) {
  if (stories.length > 0) {
    return (
      <div className="space-y-3">
        {stories.map(story => (
          <StoryCard key={story.id} story={story} />
        ))}
      </div>
    )
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{principle.name}</h4>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Automatic evidence detection from your commits is coming. For now, draft a story
        for this principle from memory.
      </p>
      <button
        type="button"
        onClick={() => onDraft(principle)}
        className="mt-auto inline-flex items-center gap-1.5 self-start rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
      >
        <PenLine className="size-3.5" aria-hidden />
        Draft a story from this evidence
      </button>
    </Card>
  )
}

/** Values matrix — one row per leadership principle; detail adapts to coverage. */
function ValuesMatrixGroup({
  rows,
  onDraft,
}: {
  readonly rows: readonly PrincipleRow[]
  readonly onDraft: (principle: LeadershipPrinciple) => void
}) {
  return (
    <SummaryGroup
      id="values-matrix"
      title="Company values matrix"
      subtitle="Story coverage per leadership principle. Click one to see your matching stories."
      count={rows.length}
    >
      {rows.map(({ principle, matched, strength }) => (
        <SummaryRow
          key={principle.id}
          id={principle.id}
          label={principle.name}
          indicator={
            <span className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {matched.length} {matched.length === 1 ? 'story' : 'stories'}
              </span>
              <EvidenceIndicator strength={strength} />
            </span>
          }
          detail={<PrincipleDetail principle={principle} stories={matched} onDraft={onDraft} />}
        />
      ))}
    </SummaryGroup>
  )
}

/**
 * Bar Raiser workspace (Stage 6). A leadership-principle coverage matrix over
 * the shared Story Bank: each principle's Evidence Indicator and story count
 * come from the user's existing stories (by theme mapping). Principles with no
 * coverage get a "Draft a story" CTA that opens the form pre-tagged. Per-commit
 * evidence detection has no backend yet (honest copy; ADR-0003).
 *
 * Renders a fragment of SummaryGroups into the WorkspaceShell's left column;
 * the StoryForm overlay sits at the fragment root.
 */
export function BarRaiserWorkspace({ detail }: BarRaiserWorkspaceProps) {
  // Schedule & format is edited from the dashboard SchedulePanel (shared draft via
  // StageDraftProvider), so the workspace no longer owns a stage-draft instance.
  const { stories, addStory } = useStoryBank(detail.slug)

  const [draftThemes, setDraftThemes] = useState<readonly StoryTheme[] | null>(null)

  // The coach's project-anchored walkthrough (one card per leadership principle).
  // Render it as the PRIMARY section when present; the story bank stays secondary.
  const prep = resolveStagePrep(detail, 'bar-raiser')
  const walkthrough = prep?.barRaiserWalkthrough ?? []
  const coverage = prep?.barRaiserCoverage ?? null

  const rows = useMemo<readonly PrincipleRow[]>(
    () =>
      LEADERSHIP_PRINCIPLES.map(principle => {
        const matched = storiesForPrinciple(principle, stories)
        return { principle, matched, strength: coverageStrength(matched.length) }
      }),
    [stories],
  )

  function draftFrom(principle: LeadershipPrinciple) {
    setDraftThemes(principle.themes)
  }

  return (
    <>
      {walkthrough.length > 0 && <BarRaiserWalkthrough cards={walkthrough} coverage={coverage} />}

      <ValuesMatrixGroup rows={rows} onDraft={draftFrom} />

      <StoryForm
        key={draftThemes ? draftThemes.join(',') : 'closed'}
        open={draftThemes !== null}
        onClose={() => setDraftThemes(null)}
        defaultThemes={draftThemes ?? undefined}
        onSubmit={addStory}
      />
    </>
  )
}
