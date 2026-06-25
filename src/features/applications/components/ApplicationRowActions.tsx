import { Eye, Pencil, FileText, PenLine } from 'lucide-react'
import type { TailoredResumeSummary } from '@/server/applications'

interface ApplicationRowActionsProps {
  readonly tailored: TailoredResumeSummary
  readonly onPreviewResume: () => void
  readonly onPreviewCoverLetter: () => void
  readonly onEdit: (initialView: 'resume' | 'cover') => void
}

const BTN =
  'inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100 transition-colors'

export function ApplicationRowActions({
  tailored, onPreviewResume, onPreviewCoverLetter, onEdit,
}: ApplicationRowActionsProps) {
  const hasCoverLetter = tailored.coverLetter !== null
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" aria-label="Preview resume" title="Preview resume" className={BTN} onClick={onPreviewResume}>
        <Eye className="size-4" />
      </button>
      <button type="button" aria-label="Edit resume" title="Edit resume" className={BTN} onClick={() => onEdit('resume')}>
        <Pencil className="size-4" />
      </button>
      {hasCoverLetter && (
        <button type="button" aria-label="Preview cover letter" title="Preview cover letter" className={BTN} onClick={onPreviewCoverLetter}>
          <FileText className="size-4" />
        </button>
      )}
      {hasCoverLetter && (
        <button type="button" aria-label="Edit cover letter" title="Edit cover letter" className={BTN} onClick={() => onEdit('cover')}>
          <PenLine className="size-4" />
        </button>
      )}
    </div>
  )
}
