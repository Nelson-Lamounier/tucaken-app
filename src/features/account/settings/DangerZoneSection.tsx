// src/features/account/settings/DangerZoneSection.tsx
//
// Account-termination "Danger Zone" section. Two-step confirm with
// type-your-email guardrail and an optional reason textarea.
//
// Calls deleteAccountFn (src/server/account.ts) which:
//   1. Cancels the Stripe subscription immediately
//   2. Disables the Cognito user (blocks new logins)
//   3. Marks users.deleted_at = NOW() in admin-api (30-day grace)
//   4. Clears the current session cookie
//
// After success the page redirects to '/' — the cookie is already gone so
// SSR routes that depend on auth.user see null and render the marketing
// landing as if nothing happened.

import { useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { deleteAccountFn } from '@/server/account'

interface Props {
  /** Used both for display and as the canonical "type to confirm" target. */
  email: string
}

export function DangerZoneSection({ email }: Props) {
  const [open, setOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [reason, setReason] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emailMatches = confirmEmail.trim().toLowerCase() === email.toLowerCase()

  async function submit() {
    if (!emailMatches) return
    setError(null)
    setWorking(true)
    try {
      await deleteAccountFn({
        data: {
          confirmEmail,
          reason: reason.trim() || undefined,
        },
      })
      // Cookie cleared server-side. Hard-navigate so the entire React tree
      // (which assumes auth.user from beforeLoad) reboots in the signed-out
      // state instead of trying to refetch protected routes with a 410.
      window.location.href = '/?account_deleted=1'
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete account.')
      setWorking(false)
    }
  }

  return (
    <div className="rounded-xl border border-rose-400/15 bg-rose-500/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-rose-500/10 ring-1 ring-rose-400/20">
          <AlertTriangle className="size-4 text-rose-300" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-rose-100">Delete account</h4>
          <p className="mt-1 max-w-[60ch] text-[11px] leading-relaxed text-rose-200/70">
            Permanently deletes your Tucaken account, generated resumes,
            articles, and connected repositories. You will be signed out
            immediately and your subscription cancelled (no refund).
          </p>
          <p className="mt-1 max-w-[60ch] text-[11px] leading-relaxed text-rose-200/70">
            For the next <span className="font-medium text-rose-100">30 days</span>,
            you can restore your account by emailing{' '}
            <a
              href="mailto:support@tucaken.io"
              className="font-medium text-rose-100 underline"
            >
              support@tucaken.io
            </a>{' '}
            from this address. After that, all data is permanently erased.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
          >
            <Trash2 className="size-3.5" /> Delete account
          </button>
        )}
      </div>

      {open && (
        <div className="mt-5 space-y-4 border-t border-rose-400/10 pt-5">
          <div>
            <label
              htmlFor="confirm-email"
              className="block text-xs font-medium text-rose-100"
            >
              Type your email to confirm
            </label>
            <input
              id="confirm-email"
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={email}
              className="mt-1.5 block w-full rounded-md border border-rose-400/30 bg-white/5 px-3 py-1.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-rose-300/60 focus:outline-none focus:ring-1 focus:ring-rose-300/40"
            />
            <p className="mt-1 text-[10px] text-rose-200/60">
              Must match {email} exactly.
            </p>
          </div>

          <div>
            <label
              htmlFor="reason"
              className="block text-xs font-medium text-rose-100"
            >
              Tell us why (optional)
            </label>
            <textarea
              id="reason"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Not what I expected, too expensive, found something better…"
              className="mt-1.5 block w-full resize-none rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-white/20 focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setConfirmEmail('')
                setReason('')
                setError(null)
              }}
              disabled={working}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!emailMatches || working}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              {working ? 'Deleting…' : 'Permanently delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
