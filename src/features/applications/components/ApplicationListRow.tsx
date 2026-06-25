import { Link } from '@tanstack/react-router'
import type { ApplicationSummary } from '@/lib/types/applications.types'
import type { TailoredResumeSummary } from '@/server/applications'
import { StatusBadge } from './StatusBadge'
import { StageProgressTrack } from './StageProgressTrack'
import { ApplicationRowActions } from './ApplicationRowActions'

interface ApplicationListRowProps {
  readonly app: ApplicationSummary
  readonly tailored?: TailoredResumeSummary
  readonly onPreviewResume: (tr: TailoredResumeSummary) => void
  readonly onPreviewCoverLetter: (tr: TailoredResumeSummary) => void
  readonly onEdit: (tr: TailoredResumeSummary, initialView: 'resume' | 'cover') => void
}

/**
 * One application row: a link region (company / role / progress / status) plus a
 * separate actions cell with inline resume + cover-letter buttons. Actions are a
 * sibling of the link — never nested inside it — to keep the markup accessible.
 */
export function ApplicationListRow({
  app, tailored, onPreviewResume, onPreviewCoverLetter, onEdit,
}: ApplicationListRowProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-2 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/5 sm:grid-cols-[1.5fr_1.5fr_12rem_8rem_auto] sm:items-center sm:gap-4">
      <Link
        to="/applications/$slug"
        params={{ slug: app.slug }}
        className="contents"
      >
        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{app.targetCompany}</span>
        <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">{app.targetRole}</span>
        <StageProgressTrack current={app.interviewStage} />
        <div className="justify-self-start">
          <StatusBadge status={app.status} />
        </div>
      </Link>
      <div className="justify-self-end">
        {tailored && (
          <ApplicationRowActions
            tailored={tailored}
            onPreviewResume={() => onPreviewResume(tailored)}
            onPreviewCoverLetter={() => onPreviewCoverLetter(tailored)}
            onEdit={(view) => onEdit(tailored, view)}
          />
        )}
      </div>
    </div>
  )
}
