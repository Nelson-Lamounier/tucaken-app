import type { InterviewStage } from '@/lib/types/applications.types'
import { STAGE_ORDER, stageIndex, stageProgress, type StageProgress } from '../stages/types/stage'
import { STAGE_LABELS } from './ApplicationTypes'

/** Segment colour by progress — extracted to avoid a nested ternary (S3358). */
function segmentClass(progress: StageProgress): string {
  if (progress === 'completed') return 'bg-accent'
  if (progress === 'current') return 'bg-accent/50 ring-1 ring-accent/40'
  return 'bg-zinc-200 dark:bg-white/10'
}

/**
 * Seven-segment hiring-stage progress track derived from the application's
 * current stage: completed phases are filled, the current is highlighted, later
 * ones muted. Caption names the current stage and its position.
 */
export function StageProgressTrack({ current }: { readonly current: InterviewStage }) {
  const processed = stageIndex(current)
  return (
    <div>
      <div className="flex items-center gap-1">
        {STAGE_ORDER.map(stage => (
          <span
            key={stage}
            title={`${STAGE_LABELS[stage]} — ${stageProgress(stage, current)}`}
            className={`h-1.5 flex-1 rounded-full ${segmentClass(stageProgress(stage, current))}`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {processed > 0 ? `${processed} of ${STAGE_ORDER.length} processed · ` : 'Stage 1 of 7 · '}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{STAGE_LABELS[current]}</span>
      </p>
    </div>
  )
}
