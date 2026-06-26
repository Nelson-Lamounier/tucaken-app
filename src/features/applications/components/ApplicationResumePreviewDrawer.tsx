import { useMemo } from 'react'
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'
import { ResumeThemeDocument } from '@/features/resume-theme/app/ResumeThemeDocument'
import { mapApplicationToBuilderState } from '../utils/resume-adapters'
import type { TailoredResumeSummary } from '@/server/applications'

/**
 * Read-only preview of an application's tailored resume / cover letter.
 *
 * Renders through the SAME pipeline as the editor
 * (`mapApplicationToBuilderState` -> resume-theme `ResumeThemeDocument`), so
 * Preview and Edit always show identical data and style. The resume builder is
 * the lead representation: any section the builder does not model (e.g.
 * `keyAchievements`) is absent from both, not just one.
 */
export function ApplicationResumePreviewDrawer({
  isOpen,
  onClose,
  tr,
  kind,
}: {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly tr: TailoredResumeSummary
  readonly kind: 'resume' | 'cover'
}) {
  const state = useMemo(
    () => mapApplicationToBuilderState(tr.data, tr.coverLetter, tr.targetCompany, tr.targetRole),
    [tr],
  )

  return (
    <DashboardDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={kind === 'cover' ? 'Cover Letter Preview' : 'Resume Preview'}
      description={`${tr.targetCompany} — ${tr.targetRole}`}
      unstyledContent
    >
      <div className="h-full overflow-y-auto no-scrollbar rounded-xl border border-white/10 bg-black/40 p-6 shadow-inner">
        <div className="mx-auto" style={{ maxWidth: '794px' }}>
          <ResumeThemeDocument state={state} view={kind} />
        </div>
      </div>
    </DashboardDrawer>
  )
}
