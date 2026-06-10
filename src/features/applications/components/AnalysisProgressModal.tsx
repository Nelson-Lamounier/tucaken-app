'use client'

import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
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
 * only hides the modal — the pipeline keeps running and the parent's "View
 * progress" pill re-opens it.
 */
export function AnalysisProgressModal({
  isOpen,
  onClose,
  slug,
  pipelineRunId,
  startedAt,
}: AnalysisProgressModalProps) {
  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="w-full max-w-2xl overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900 data-closed:scale-95 data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
        >
          <ProgressBars slug={slug} pipelineRunId={pipelineRunId} startedAt={startedAt} />
        </DialogPanel>
      </div>
    </Dialog>
  )
}
