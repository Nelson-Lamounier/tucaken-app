import { Link } from '@tanstack/react-router'
import type { ApplicationSummary } from '@/lib/types/applications.types'
import type { TailoredResumeSummary } from '@/server/applications'
import { StatusBadge } from './StatusBadge'
import { StageProgressTrack } from './StageProgressTrack'
import { ApplicationRowActions } from './ApplicationRowActions'

/**
 * One application as a list row: company / role link to the detail page, the
 * seven-phase progress track, the lifecycle status, and a trailing actions cell
 * with resume / cover-letter Preview & Edit buttons (presence-gated).
 */
export function ApplicationListRow({
  app,
  tailored,
  onOpen,
  onPreviewResume,
  onEditResume,
  onPreviewCoverLetter,
  onEditCoverLetter,
}: {
  readonly app: ApplicationSummary
  readonly tailored?: TailoredResumeSummary | null
  readonly onOpen: () => void
  readonly onPreviewResume: () => void
  readonly onEditResume: () => void
  readonly onPreviewCoverLetter: () => void
  readonly onEditCoverLetter: () => void
}) {
  return (
    <div className="grid w-full grid-cols-1 items-start gap-2 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/5 sm:grid-cols-[1.5fr_1.5fr_14rem_9rem_auto] sm:items-center sm:gap-4">
      <Link
        to="/applications/$slug"
        params={{ slug: app.slug }}
        onClick={onOpen}
        className="contents text-left"
      >
        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{app.targetCompany}</span>
        <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">{app.targetRole}</span>
        <StageProgressTrack current={app.interviewStage} />
        <div className="justify-self-start">
          <StatusBadge status={app.status} />
        </div>
      </Link>
      <ApplicationRowActions
        tailored={tailored}
        onPreviewResume={onPreviewResume}
        onEditResume={onEditResume}
        onPreviewCoverLetter={onPreviewCoverLetter}
        onEditCoverLetter={onEditCoverLetter}
      />
    </div>
  )
}
