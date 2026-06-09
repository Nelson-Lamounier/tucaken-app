import type {
  ApplicationDetail,
  InterviewStage,
  InterviewPrepOutput,
  ResearchOutput,
  CoachingNotes,
  CoachingSection,
} from '@/lib/types/applications.types'

// =============================================================================
// Evidence (see src/features/applications/CONTEXT.md)
// =============================================================================

/** Traffic-light strength of Evidence for a topic. Maps to tone good/warn/bad. */
export type EvidenceStrength = 'strong' | 'moderate' | 'none'

/** A deep-link to one of the user's Project case-studies (`/projects/$id`). */
export interface ProjectReference {
  /** Project id — routes to /projects/$id. */
  readonly id: string
  readonly title: string
  /** One-line pitch. */
  readonly pitch: string
  /** Top component/skill tags to surface on the card. */
  readonly highlights?: readonly string[]
}

/** A topic + its Evidence Indicator + project references + gap guidance. */
export interface EvidenceTopic {
  readonly id: string
  readonly title: string
  readonly strength: EvidenceStrength
  /** Plain-text "evidence in your work" summary. */
  readonly summary: string
  readonly projectRefs: readonly ProjectReference[]
  /** "Be honest" guidance shown for gap areas (strength: 'none'). */
  readonly beHonest?: string
}

// =============================================================================
// Stories (STAR) — Behavioural / Bar Raiser
// =============================================================================

export const STORY_THEMES = [
  'Conflict',
  'Leadership',
  'Failure',
  'Ambiguity',
  'Impact',
  'Growth',
  'Customer',
] as const
export type StoryTheme = (typeof STORY_THEMES)[number]

export interface StarStory {
  readonly id: string
  readonly title: string
  readonly situation: string
  readonly task: string
  readonly action: string
  readonly result: string
  readonly themes: readonly StoryTheme[]
}

// =============================================================================
// Checklist — "questions to ask the recruiter" etc.
// =============================================================================

export interface ChecklistEntry {
  readonly id: string
  readonly label: string
  /** Optional why-ask rationale. */
  readonly rationale?: string
}

// =============================================================================
// Stage workspace data contract
//
// The full per-stage shape the workspaces render. In v1 only `questions` and
// `prepChecklist` are sourced from the real Coach `InterviewPrepOutput` (via
// `interviewPrepToWorkspace`); the evidence/project/story fields have no
// backend yet and are supplied as mock data per workspace, marked
// `// BACKEND: follow-on`. See ADR-0003.
// =============================================================================

export interface StageWorkspaceData {
  readonly stage: InterviewStage
  /** Topics with Evidence Indicators. BACKEND: follow-on (mock in v1). */
  readonly topics: readonly EvidenceTopic[]
  /** Ranked project references. BACKEND: follow-on (mock in v1). */
  readonly projectRefs: readonly ProjectReference[]
  /** Questions to ask the interviewer — real, from the Coach Agent. */
  readonly questionsToAsk: readonly ChecklistEntry[]
  /** Stage coaching — sections array (new), or legacy object / Markdown string. */
  readonly coachingNotes: string | CoachingNotes | readonly CoachingSection[] | null
}

/**
 * Adapter: real Research Agent output → Evidence Topics. Verified matches are
 * `strong`, partial matches `moderate` (with the framing suggestion as the
 * be-honest guidance), gaps `none` (with their transferable foundation). This
 * is genuine evidence — not mock. Project deep-links per topic have no backend
 * yet, so `projectRefs` stays empty until the topic→project linkage lands.
 */
export function researchToTopics(research: ResearchOutput | null): readonly EvidenceTopic[] {
  if (!research) return []
  const strong: EvidenceTopic[] = research.verifiedMatches.map((m, i) => ({
    id: `vm-${String(i)}`,
    title: m.skill,
    strength: 'strong',
    summary: m.sourceCitation,
    projectRefs: [], // BACKEND: follow-on (topic→project linkage)
  }))
  const moderate: EvidenceTopic[] = research.partialMatches.map((m, i) => ({
    id: `pm-${String(i)}`,
    title: m.skill,
    strength: 'moderate',
    summary: m.gapDescription,
    projectRefs: [],
    beHonest: m.framingSuggestion,
  }))
  const none: EvidenceTopic[] = research.gaps.map((g, i) => ({
    id: `gap-${String(i)}`,
    title: g.skill,
    strength: 'none',
    summary: g.severity,
    projectRefs: [],
    beHonest: `Acknowledge the gap directly${g.isDisqualifying ? ' — this one is weighted heavily for the role' : ''}.`,
  }))
  return [...strong, ...moderate, ...none]
}

/**
 * Factual negotiation leverage points derived from the Research Agent output —
 * portfolio depth and demonstrated fit, stated directly (no breathless tone).
 */
export function negotiationLeverage(research: ResearchOutput | null): readonly string[] {
  if (!research) return []
  const points: string[] = []
  if (research.fitRating === 'STRONG_FIT') {
    points.push("You clear the role's core bar — the fit assessment rates you a strong match.")
  }
  if (research.verifiedMatches.length > 0) {
    points.push(`${research.verifiedMatches.length} required skills are verified directly in your work, not just claimed.`)
  }
  const scale = research.experienceSignals?.scale
  if (scale) {
    points.push(`You've demonstrated impact at ${scale} scale.`)
  }
  return points
}

/**
 * Adapter: real Coach `InterviewPrepOutput` → the subset of `StageWorkspaceData`
 * that has a backing today. Evidence/project/story fields stay empty here and
 * are filled by per-workspace mock until the backend lands (ADR-0003).
 */
export function interviewPrepToWorkspace(
  stage: InterviewStage,
  prep: InterviewPrepOutput | null,
): StageWorkspaceData {
  return {
    stage,
    topics: [], // BACKEND: follow-on
    projectRefs: [], // BACKEND: follow-on
    questionsToAsk: (prep?.questionsToAsk ?? []).map((q, i) => ({
      id: `qta-${String(i)}`,
      label: q.question,
      rationale: q.rationale,
    })),
    coachingNotes: prep?.coachingNotes ?? null,
  }
}

/**
 * Resolve the Coach `InterviewPrepOutput` for a given stage from the detail
 * payload. The detail endpoint returns the real coaching under
 * `detail.coaching[stage].topics` (the full Coach output) and leaves the
 * top-level `interviewPrep` null, so prefer the per-stage coaching and fall
 * back to `interviewPrep` for any older shape. Returns null when no coaching
 * has been generated for this stage yet (the Coach Job is not auto-run).
 */
export function resolveStagePrep(
  detail: ApplicationDetail,
  stage: InterviewStage,
): InterviewPrepOutput | null {
  return detail.coaching?.[stage]?.topics ?? detail.interviewPrep ?? null
}
