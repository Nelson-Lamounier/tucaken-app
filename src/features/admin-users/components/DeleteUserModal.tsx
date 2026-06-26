'use client'

import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop } from '@headlessui/react'
import { AlertTriangle } from 'lucide-react'
import { useDeleteAdminUser, useDisconnectAdminUserGithub } from '../hooks/use-admin-users'
import type { AdminUserSummary } from '../types'

type Variant = 'delete' | 'disconnect'

interface Props {
  readonly user: AdminUserSummary
  readonly variant: Variant
  readonly open: boolean
  readonly onClose: () => void
}

const DESTRUCTIVE_BTN =
  'rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50'
const CANCEL_BTN =
  'rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10'

function DisconnectBody({ user, onClose }: { user: AdminUserSummary; onClose: () => void }) {
  const { mutate, isPending } = useDisconnectAdminUserGithub()
  const handle = () => mutate({ id: user.id }, { onSuccess: () => onClose() })
  return (
    <>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        Remove the GitHub repository connection for {user.email}? Their connected repositories will
        be unlinked from Tucaken. The account itself is not deleted.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={CANCEL_BTN}>
          Cancel
        </button>
        <button type="button" disabled={isPending} onClick={handle} className={DESTRUCTIVE_BTN}>
          {isPending ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
    </>
  )
}

function HardModeWarning() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-600/20 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>This permanently deletes the account and cannot be undone.</span>
    </div>
  )
}

interface DeleteBodyProps {
  user: AdminUserSummary
  onClose: () => void
}

function DeleteBody({ user, onClose }: DeleteBodyProps) {
  const [mode, setMode] = useState<'soft' | 'hard'>('soft')
  const [reason, setReason] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const { mutate, isPending } = useDeleteAdminUser()

  const hardLocked = mode === 'hard' && confirmEmail !== user.email

  const handle = () => {
    if (mode === 'soft') {
      mutate({ id: user.id, mode, reason: reason || undefined }, { onSuccess: () => onClose() })
      return
    }
    mutate({ id: user.id, mode }, { onSuccess: () => onClose() })
  }

  return (
    <>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
      <fieldset className="mt-4 space-y-2">
        <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input
            type="radio"
            name="mode"
            checked={mode === 'soft'}
            onChange={() => setMode('soft')}
            className="mt-1"
          />
          <span>Soft delete — 30-day grace window, restorable. Login is disabled immediately.</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input
            type="radio"
            name="mode"
            checked={mode === 'hard'}
            onChange={() => setMode('hard')}
            className="mt-1"
            aria-label="Permanently delete now"
          />
          <span>Permanently delete now — irreversible. Purges the account and revokes GitHub.</span>
        </label>
      </fieldset>

      {mode === 'soft' && (
        <label className="mt-4 block text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Reason (optional)</span>
          <input
            aria-label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-800"
          />
        </label>
      )}

      {mode === 'hard' && (
        <div className="mt-4 space-y-2">
          <HardModeWarning />
          <label className="block text-sm">
            <span className="text-zinc-600 dark:text-zinc-300">Type the email to confirm</span>
            <input
              aria-label="Type the email to confirm"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-800"
            />
          </label>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={CANCEL_BTN}>
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending || hardLocked}
          onClick={handle}
          className={DESTRUCTIVE_BTN}
        >
          {isPending ? 'Deleting...' : 'Delete account'}
        </button>
      </div>
    </>
  )
}

export function DeleteUserModal({ user, variant, open, onClose }: Props) {
  const title = variant === 'disconnect' ? 'Disconnect GitHub' : 'Delete account'
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm dark:bg-zinc-900/60" />
      <div className="fixed inset-0 z-10 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </DialogTitle>
          {variant === 'disconnect' && <DisconnectBody user={user} onClose={onClose} />}
          {variant === 'delete' && <DeleteBody user={user} onClose={onClose} />}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
