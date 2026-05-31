'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Wrench } from 'lucide-react'

interface PracticeModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly blurb: string
}

/**
 * Scaffolding only for v1 — the full practice flow (generated questions,
 * timed self-mock) is a follow-on feature. This confirms the trigger wiring
 * and focus trapping without faking generated content.
 */
export function PracticeModal({ open, onClose, title, blurb }: PracticeModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-30">
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]">
            <Wrench className="size-5 text-accent" aria-hidden />
          </div>
          <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</DialogTitle>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{blurb}</p>
          <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-white/5">
            Coming soon — the full practice flow ships in a follow-on update.
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
