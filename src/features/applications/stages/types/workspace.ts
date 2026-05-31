import type {
  InterviewStage,
  InterviewPrepOutput,
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
  /** Free-text coaching notes (Markdown) — real, from the Coach Agent. */
  readonly coachingNotes: string | null
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
