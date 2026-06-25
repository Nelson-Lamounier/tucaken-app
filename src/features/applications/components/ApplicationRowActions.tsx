import { Eye, Pencil, FileText, PenLine } from 'lucide-react'
import type { TailoredResumeSummary } from '@/server/applications'

interface ApplicationRowActionsProps {
  readonly tailored?: TailoredResumeSummary | null
  readonly onPreviewResume: () => void
  readonly onEditResume: () => void
  readonly onPreviewCoverLetter: () => void
  readonly onEditCoverLetter: () => void
}

const BTN =
  'inline-flex size-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100'

export function ApplicationRowActions({
  tailored,
  onPreviewResume,
  onEditResume,
  onPreviewCoverLetter,
  onEditCoverLetter,
}: ApplicationRowActionsProps) {
  if (!tailored) return null

  const hasCoverLetter = Boolean(tailored.coverLetter)

  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" aria-label="Preview resume" className={BTN} onClick={onPreviewResume}>
        <Eye className="size-4" />
      </button>
      <button type="button" aria-label="Edit resume" className={BTN} onClick={onEditResume}>
        <Pencil className="size-4" />
      </button>
      {hasCoverLetter && (
        <button type="button" aria-label="Preview cover letter" className={BTN} onClick={onPreviewCoverLetter}>
          <FileText className="size-4" />
        </button>
      )}
      {hasCoverLetter && (
        <button type="button" aria-label="Edit cover letter" className={BTN} onClick={onEditCoverLetter}>
          <PenLine className="size-4" />
        </button>
      )}
    </div>
  )
}
