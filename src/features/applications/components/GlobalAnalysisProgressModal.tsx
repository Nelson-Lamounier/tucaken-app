'use client'

import { AnalysisProgressModal } from './AnalysisProgressModal'
import { useProgressModalStore } from '@/lib/stores/progress-modal-store'

/**
 * App-global mount for the analysis progress modal. Driven by
 * `useProgressModalStore`, so it can be opened from the Resume Builder submit
 * flow or from a running Pipeline Notification on any page. Mount once in the
 * dashboard layout.
 */
export function GlobalAnalysisProgressModal() {
  const open = useProgressModalStore((s) => s.open)
  const slug = useProgressModalStore((s) => s.slug)
  const pipelineRunId = useProgressModalStore((s) => s.pipelineRunId)
  const startedAt = useProgressModalStore((s) => s.startedAt)
  const closeProgress = useProgressModalStore((s) => s.closeProgress)

  if (slug === null || startedAt === null) return null

  return (
    <AnalysisProgressModal
      isOpen={open}
      onClose={closeProgress}
      slug={slug}
      pipelineRunId={pipelineRunId}
      startedAt={startedAt}
    />
  )
}
