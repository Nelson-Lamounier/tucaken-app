import { useState } from 'react'
import type { ProfileSummary } from '@/lib/types/profile.types'

export function ReconciliationPanel({
  summary,
  hasResume,
}: {
  readonly summary: ProfileSummary
  /** Whether the user has imported any résumé/career history. When explicitly
   *  false, reconciliation is not "pending" — it's blocked until import. */
  readonly hasResume?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rc = summary.reconciliation
  // No résumé to reconcile against → distinct "not yet possible" state, not
  // "still being generated". Only shown when we know there's no career history.
  if (!rc && hasResume === false) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/2 p-5">
        <p className="text-sm text-zinc-400">
          Import your résumé to unlock this — we&apos;ll compare it against the evidence in your code.
        </p>
      </section>
    )
  }
  if (!rc) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/2 p-5">
        <p className="text-sm text-zinc-500">Your résumé reconciliation is still being generated.</p>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-5">
      {rc.unsupportedClaims.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-amber-300">Claims to substantiate</h3>
          <ul className="mt-2 space-y-1 text-xs text-zinc-300">
            {rc.unsupportedClaims.map((c, i) => (
              <li key={`${c.resumeRef}-${i}`}>
                <span className="text-zinc-100">{c.claim}</span>
                <span className="text-zinc-500"> — {c.whyUnsupported}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {rc.undersold.length > 0 && (
        <div>
          <button type="button" onClick={() => setOpen(o => !o)}
            className="text-xs text-teal-400 hover:text-teal-300">
            {open ? 'Hide' : `You're underselling (${rc.undersold.length})`}
          </button>
          {open && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-300">
              {rc.undersold.map((u, i) => (
                <li key={`${u.rollupDimension}-${i}`}>
                  <span className="text-zinc-100">{u.evidence}</span>
                  <span className="text-zinc-500"> — {u.suggestion}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {rc.unsupportedClaims.length === 0 && rc.undersold.length === 0 && (
        <p className="text-sm text-zinc-500">Your résumé is well-aligned with the evidence.</p>
      )}
    </section>
  )
}
