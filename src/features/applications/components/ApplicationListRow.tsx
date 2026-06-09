import type { ApplicationSummary } from '@/lib/types/applications.types'
import { StatusBadge } from './StatusBadge'
import { StageProgressTrack } from './StageProgressTrack'

/**
 * One application as a list row: company / role, the seven-phase progress track
 * (phases processed + current stage), and the lifecycle status. Whole row links
 * to the application.
 */
export function ApplicationListRow({
  app,
  onClick,
}: {
  readonly app: ApplicationSummary
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-1 items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5 sm:grid-cols-[1.5fr_1.5fr_14rem_9rem] sm:items-center sm:gap-4"
    >
      <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{app.targetCompany}</span>
      <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">{app.targetRole}</span>
      <StageProgressTrack current={app.interviewStage} />
      <div className="justify-self-start">
        <StatusBadge status={app.status} />
      </div>
    </button>
  )
}
