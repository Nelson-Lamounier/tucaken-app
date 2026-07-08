'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'

interface ConfirmModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onConfirm: () => void
  readonly title: string
  readonly body: string
  readonly confirmLabel: string
  /** Destructive actions (Decline) get a red confirm button. */
  readonly destructive?: boolean
  readonly busy?: boolean
}

/** Generic confirmation dialog (destructive actions get a red confirm button).
 *  Focus-trapped via headlessui. */
export function ConfirmModal({ open, onClose, onConfirm, title, body, confirmLabel, destructive, busy }: ConfirmModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-30">
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</DialogTitle>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5">
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                destructive ? 'bg-red-600 hover:bg-red-500' : 'bg-(--accent) hover:opacity-90'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
