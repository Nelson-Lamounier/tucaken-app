'use client'

/**
 * Session-expiry warning dialog + the idle guard mount point.
 *
 * Rendered inside the authenticated dashboard layout. Invisible while the
 * user is active; during the final warning window it asks whether to stay
 * signed in, and on timeout the guard performs a clean sign-out. Styling
 * mirrors ConfirmModal; a dedicated component because the semantics differ —
 * dismissing the dialog counts as "stay signed in" (interacting with it IS
 * user activity), and it needs a live countdown plus an explicit sign-out.
 */

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useSessionIdleGuard } from '../hooks/useSessionIdleGuard'

export function SessionExpiryDialog() {
  const { phase, secondsLeft, staySignedIn, signOutNow } = useSessionIdleGuard()

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = String(secondsLeft % 60).padStart(2, '0')

  return (
    <Dialog open={phase === 'warning'} onClose={staySignedIn} className="relative z-40">
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Are you still there?
          </DialogTitle>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            You have been inactive for a while. For your security you will be
            signed out in{' '}
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {minutes}:{seconds}
            </span>
            .
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={signOutNow}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5"
            >
              Sign out now
            </button>
            <button
              type="button"
              onClick={staySignedIn}
              className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Stay signed in
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
