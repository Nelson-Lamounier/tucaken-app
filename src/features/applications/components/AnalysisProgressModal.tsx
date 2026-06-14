'use client'

import { useCallback } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { useNavigate } from '@tanstack/react-router'
import { ProgressBars } from './ProgressBars'

export interface AnalysisProgressModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly slug: string
  readonly pipelineRunId?: string
  /** Submission start time (ms epoch) — keeps the elapsed timer stable across re-opens. */
  readonly startedAt: number
}

/**
 * Centered, dismissible modal that hosts the pipeline `ProgressBars`. Closing it
 * only hides the modal — the pipeline keeps running and is tracked via the
 * Pipeline Notifications bell. When the run finishes while the modal is open, it
 * auto-advances to the results page.
 */
export function AnalysisProgressModal({
  isOpen,
  onClose,
  slug,
  pipelineRunId,
  startedAt,
}: AnalysisProgressModalProps) {
  const navigate = useNavigate()
  const handleComplete = useCallback(() => {
    // Dismiss the modal first — navigating alone leaves the Dialog backdrop
    // mounted over the results page, forcing the user to click it to proceed.
    onClose()
    void navigate({ to: '/applications/$slug', params: { slug } })
  }, [navigate, slug, onClose])

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="w-full max-w-4xl overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900 data-closed:scale-95 data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
        >
          <ProgressBars slug={slug} pipelineRunId={pipelineRunId} startedAt={startedAt} onComplete={handleComplete} />
        </DialogPanel>
      </div>
    </Dialog>
  )
}
