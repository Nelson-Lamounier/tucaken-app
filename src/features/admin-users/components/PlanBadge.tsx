import type { UserTier, UserRole } from '../types'
import { PLAN_COLOURS, PLAN_LABELS, ROLE_COLOURS } from './AdminUserTypes'

const DELETED_CLASS =
  'bg-red-50 text-red-700 border-red-600/20 line-through dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30'

export function PlanBadge({ plan, deleted }: { readonly plan: UserTier; readonly deleted: boolean }) {
  if (deleted) {
    return (
      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${DELETED_CLASS}`}>
        Deleted
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${PLAN_COLOURS[plan]}`}>
      {PLAN_LABELS[plan]}
    </span>
  )
}

export function RoleBadge({ role }: { readonly role: UserRole }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_COLOURS[role]}`}>
      {role}
    </span>
  )
}
