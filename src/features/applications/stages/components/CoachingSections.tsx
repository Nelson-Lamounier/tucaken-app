'use client'

import { Crosshair } from 'lucide-react'
import type { ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { resolveStagePrep } from '../types/workspace'
import { parseCoachingSections, type CoachingSections, type FinalCheckpoint } from '../lib/coaching-sections'
import { CoachMarkdown } from './CoachMarkdown'
import { FinalChecklist, FinalChecklistReadonly } from './FinalChecklist'
import { SummaryGroup } from './workspace-shell'

/** Hero positioning banner — the coach's read on where you stand for this round.
 *  Rendered above the dashboards so it frames the whole Technical page. */
export function StagePositioningBanner({ markdown }: { readonly markdown: string }) {
  return (
    <section className="mb-6 rounded-md bg-linear-to-br from-accent/8 to-transparent p-5 ring-1 ring-inset ring-accent/15 dark:from-accent/10">
      <div className="flex items-center gap-2">
        <Crosshair className="size-4 text-accent" aria-hidden />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-accent">Stage positioning</h2>
      </div>
      <div className="mt-2">
        <CoachMarkdown text={markdown} />
      </div>
    </section>
  )
}

/**
 * Container-facing wrapper: resolves a stage's coaching notes, parses the
 * positioning section, and renders the banner (or nothing). Kept separate so the
 * page container stays thin.
 */
export function StagePositioning({ detail, stage }: { readonly detail: ApplicationDetail; readonly stage: InterviewStage }) {
  const sections = parseCoachingSections(resolveStagePrep(detail, stage)?.coachingNotes)
  if (!sections.positioning) return null
  return <StagePositioningBanner markdown={sections.positioning} />
}

/** A collapsible coaching section — markdown body inside a rounded-md surface. */
export function CoachingSectionGroup({
  id,
  title,
  subtitle,
  markdown,
}: {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly markdown: string
}) {
  return (
    <SummaryGroup id={id} title={title} subtitle={subtitle}>
      <div className="rounded-md bg-white p-4 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none">
        <CoachMarkdown text={markdown} />
      </div>
    </SummaryGroup>
  )
}

/** Identifies the application+stage so an interactive section can persist state. */
interface AppKey {
  readonly slug: string
  readonly stage: InterviewStage
}

/**
 * Final checkpoint — structured items + note. When an `appKey` is provided the
 * section is an interactive, persisted checklist (tick items off, progress bar);
 * otherwise it renders read-only.
 */
function FinalCheckpointSection({ checkpoint, appKey }: { readonly checkpoint: FinalCheckpoint; readonly appKey?: AppKey }) {
  const note = checkpoint.note ?? null
  const body = appKey ? (
    <FinalChecklist slug={appKey.slug} stage={appKey.stage} items={checkpoint.items} note={note} />
  ) : (
    <FinalChecklistReadonly items={checkpoint.items} note={note} />
  )
  return (
    <SummaryGroup id="final-checkpoint" title="Final checkpoint" subtitle="Tick these off before you walk in.">
      {body}
    </SummaryGroup>
  )
}

/**
 * Coaching guidance — the coach's notes split into focused, collapsible sections
 * (tactical prep, communication, mindset, debrief, final checkpoint). Falls back
 * to a single "Coaching notes" panel when the notes don't carry known headers.
 * Shared by every interview-stage workspace; positioning is handled separately
 * (it renders above the dashboards), and interview-focus feeds What-to-expect.
 *
 * Pass `appKey` to make the final checkpoint an interactive, persisted checklist.
 */
export function CoachingGuidance({ sections, appKey }: { readonly sections: CoachingSections; readonly appKey?: AppKey }) {
  if (!sections.structured) {
    return sections.raw ? (
      <CoachingSectionGroup
        id="coaching-notes"
        title="Coaching notes"
        subtitle="Stage-specific guidance from your interview coach."
        markdown={sections.raw}
      />
    ) : null
  }
  return (
    <>
      {sections.tacticalPrep && (
        <CoachingSectionGroup id="tactical-prep" title="Tactical preparation" subtitle="Your prep plan before the round." markdown={sections.tacticalPrep} />
      )}
      {sections.communication && (
        <CoachingSectionGroup id="communication" title="Communication strategy" subtitle="How to come across in the room." markdown={sections.communication} />
      )}
      {sections.mindset && (
        <CoachingSectionGroup id="mindset" title="Mindset for this round" subtitle="What you're really being assessed on." markdown={sections.mindset} />
      )}
      {sections.debrief && (
        <CoachingSectionGroup id="debrief" title="Post-interview debrief" subtitle="Capture this right after the round." markdown={sections.debrief} />
      )}
      {sections.finalCheckpoint && (
        <FinalCheckpointSection checkpoint={sections.finalCheckpoint} appKey={appKey} />
      )}
    </>
  )
}
