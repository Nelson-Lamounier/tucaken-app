'use client'

import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react'
import { Loader2 } from 'lucide-react'
import { useAdminUser } from '../hooks/use-admin-users'
import { PlanBadge, RoleBadge } from './PlanBadge'
import { UserRagSection } from './UserRagSection'

interface Props {
  readonly userId: string | null
  readonly open: boolean
  readonly onClose: () => void
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">{value}</span>
    </div>
  )
}

export function UserDetailPanel({ userId, open, onClose }: Props) {
  const { data: user, isLoading } = useAdminUser(userId)

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm dark:bg-zinc-900/60" />
      <div className="fixed inset-y-0 right-0 flex max-w-full">
        <DialogPanel className="w-screen max-w-xl overflow-y-auto border-l border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-8 animate-spin text-violet-400" />
            </div>
          )}
          {!isLoading && user && (
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {user.fullName ?? user.email}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
              <div className="mt-3 flex gap-2">
                <PlanBadge plan={user.plan} deleted={user.deletedAt !== null} />
                <RoleBadge role={user.role} />
              </div>
              <div className="mt-5 divide-y divide-zinc-100 dark:divide-white/5">
                <Row label="Subscription" value={user.subscriptionStatus ?? '—'} />
                <Row label="Trial ends" value={user.trialEndsAt ?? '—'} />
                <Row label="Period end" value={user.currentPeriodEnd ?? '—'} />
                <Row label="Cancel at period end" value={user.cancelAtPeriodEnd ? 'Yes' : 'No'} />
                <Row label="Stripe customer" value={user.stripeCustomerId ?? '—'} />
                <Row label="Stripe subscription" value={user.stripeSubscriptionId ?? '—'} />
                <Row label="Created" value={user.createdAt} />
              </div>
              {user.quotas.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Usage</h3>
                  <div className="mt-2 divide-y divide-zinc-100 dark:divide-white/5">
                    {user.quotas.map((q) => (
                      <Row key={`${q.feature}-${q.periodMonth}`} label={`${q.feature} (${q.periodMonth})`} value={String(q.count)} />
                    ))}
                  </div>
                </div>
              )}
              <UserRagSection userId={user.id} />

              <div className="mt-6 flex justify-end">
                <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10">
                  Close
                </button>
              </div>
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
