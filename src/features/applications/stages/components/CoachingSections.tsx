'use client'

import type { ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { resolveStagePrep } from '../types/workspace'
import { parseCoachingSections, type CoachingSection } from '../lib/coaching-sections'
import { CoachMarkdown } from './CoachMarkdown'
import { FinalChecklist, FinalChecklistReadonly } from './FinalChecklist'

/** Identifies the application+stage so a checklist section can persist its state. */
interface AppKey {
  readonly slug: string
  readonly stage: InterviewStage
}

/** A section's body: an interactive/read-only checklist, or markdown prose. */
function SectionBody({ section, appKey }: { readonly section: CoachingSection; readonly appKey?: AppKey }) {
  if (section.checklist && section.checklist.length > 0) {
    const note = section.body.length > 0 ? section.body : null
    return appKey ? (
      <FinalChecklist slug={appKey.slug} stage={appKey.stage} items={section.checklist} note={note} />
    ) : (
      <FinalChecklistReadonly items={section.checklist} note={note} />
    )
  }
  return <CoachMarkdown text={section.body} />
}

/**
 * Renders the coach's ordered sections as a narrative — one titled block per
 * section (prose via markdown; checklist sections are tickable when `appKey` is
 * given). The composable, keyed structure lets callers place sections freely.
 */
export function CoachingNarrative({ sections, appKey }: { readonly sections: readonly CoachingSection[]; readonly appKey?: AppKey }) {
  if (sections.length === 0) return null
  return (
    <div className="space-y-4">
      {sections.map(block => (
        <article
          key={block.key}
          className="rounded-md bg-white p-4 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none"
        >
          {block.title.length > 0 && (
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{block.title}</h3>
          )}
          <div className="mt-2">
            <SectionBody section={block} appKey={appKey} />
          </div>
        </article>
      ))}
    </div>
  )
}

/**
 * Container-facing wrapper: resolves a stage's coaching notes, normalises them to
 * sections, and renders the narrative as the page intro (or nothing). Checklist
 * sections are interactive (keyed by application + stage).
 */
export function StageCoachingNarrative({ detail, stage }: { readonly detail: ApplicationDetail; readonly stage: InterviewStage }) {
  const sections = parseCoachingSections(resolveStagePrep(detail, stage)?.coachingNotes)
  if (sections.length === 0) return null
  return (
    <section className="mb-6">
      <CoachingNarrative sections={sections} appKey={{ slug: detail.slug, stage }} />
    </section>
  )
}
