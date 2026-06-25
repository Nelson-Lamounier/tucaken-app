'use client'

import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop } from '@headlessui/react'
import { AlertTriangle } from 'lucide-react'
import { CustomDropDown } from '@/components/ui/CustomDropDown'
import { useUpdateAdminUser } from '../hooks/use-admin-users'
import type { AdminUserSummary, UserTier, UserRole } from '../types'
import { PLAN_LABELS } from './AdminUserTypes'

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
] as const

const PLAN_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'premium', label: 'Premium' },
] as const

const ACTIVE_SUB = new Set(['active', 'trialing', 'past_due'])

interface Props {
  readonly user: AdminUserSummary
  readonly open: boolean
  readonly onClose: () => void
}

function hasActiveSubscription(subscriptionStatus: string | null): boolean {
  return ACTIVE_SUB.has(subscriptionStatus ?? '')
}

function buildPatch(
  id: string,
  role: UserRole,
  plan: UserTier,
  user: AdminUserSummary,
): { id: string; role?: UserRole; plan?: UserTier } {
  const patch: { id: string; role?: UserRole; plan?: UserTier } = { id }
  if (role !== user.role) patch.role = role
  if (plan !== user.plan) patch.plan = plan
  return patch
}

export function ChangeRolePlanModal({ user, open, onClose }: Props) {
  const [role, setRole] = useState<UserRole>(user.role)
  const [plan, setPlan] = useState<UserTier>(user.plan)
  const { mutate, isPending } = useUpdateAdminUser()

  const planChanged = plan !== user.plan
  const showStripeWarning = planChanged && hasActiveSubscription(user.subscriptionStatus)
  const dirty = role !== user.role || planChanged

  const handleSave = () => {
    mutate(buildPatch(user.id, role, plan, user), { onSuccess: () => onClose() })
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm dark:bg-zinc-900/60" />
      <div className="fixed inset-0 z-10 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Manage access
          </DialogTitle>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>

          <div className="mt-4 space-y-4">
            <CustomDropDown
              label="Role"
              options={ROLE_OPTIONS}
              value={role}
              onChange={(v) => setRole(v as UserRole)}
            />
            <CustomDropDown
              label="Plan"
              options={PLAN_OPTIONS}
              value={plan}
              onChange={(v) => setPlan(v as UserTier)}
            />
          </div>

          {showStripeWarning && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-600/20 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                This user has an active subscription. Setting the plan to {PLAN_LABELS[plan]} is a
                manual override and will be reverted by the next Stripe webhook sync. Change the
                plan in Stripe to make it stick.
              </span>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!dirty || isPending}
              onClick={handleSave}
              className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
