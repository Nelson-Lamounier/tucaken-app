import type { InterviewStage } from '@/lib/types/applications.types'

/**
 * Canonical hiring-stage order. The user's application has a single
 * **Current Stage** (`ApplicationDetail.interviewStage`); the **Active Stage**
 * is whichever the user is viewing (the `?stage` search param). Navigating
 * between Active Stages never changes the Current Stage — only "Advance" does.
 *
 * See src/features/applications/CONTEXT.md.
 */
export const STAGE_ORDER = [
  'applied',
  'phone-screen',
  'technical',
  'system-design',
  'behavioural',
  'bar-raiser',
  'final',
] as const satisfies readonly InterviewStage[]

const STAGE_INDEX = new Map<InterviewStage, number>(
  STAGE_ORDER.map((stage, index) => [stage, index]),
)

export function stageIndex(stage: InterviewStage): number {
  return STAGE_INDEX.get(stage) ?? 0
}

export function isInterviewStage(value: unknown): value is InterviewStage {
  return typeof value === 'string' && STAGE_INDEX.has(value as InterviewStage)
}

/** Progress-bar segment state, derived from the Current Stage. */
export type StageProgress = 'completed' | 'current' | 'upcoming'

/**
 * Segment state for `stage` given the application's `current` stage.
 * Stages before the current one are completed; the current one is current;
 * later ones are upcoming. (Skipped is a future backend concept.)
 */
export function stageProgress(
  stage: InterviewStage,
  current: InterviewStage,
): StageProgress {
  const a = stageIndex(stage)
  const b = stageIndex(current)
  if (a < b) return 'completed'
  if (a === b) return 'current'
  return 'upcoming'
}
