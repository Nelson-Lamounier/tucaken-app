import type { AdminUserSummary } from '../types'
import { PlanBadge, RoleBadge } from './PlanBadge'
import { UserRowActions } from './UserRowActions'

interface Props {
  readonly user: AdminUserSummary
  readonly onView: (user: AdminUserSummary) => void
  readonly onEdit: (user: AdminUserSummary) => void
  readonly onRestore: (user: AdminUserSummary) => void
  readonly onDelete: (user: AdminUserSummary) => void
  readonly onDisconnect: (user: AdminUserSummary) => void
}

export function UserListRow({ user, onView, onEdit, onRestore, onDelete, onDisconnect }: Props) {
  return (
    <div className="grid grid-cols-1 items-start gap-2 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/5 sm:grid-cols-[1.5fr_1.5fr_8rem_6rem_8rem_auto] sm:items-center sm:gap-4">
      <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{user.email}</span>
      <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">{user.fullName ?? '—'}</span>
      <div className="justify-self-start">
        <PlanBadge plan={user.plan} deleted={user.deletedAt !== null} />
      </div>
      <div className="justify-self-start">
        <RoleBadge role={user.role} />
      </div>
      <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">{user.subscriptionStatus ?? '—'}</span>
      <div className="justify-self-end">
        <UserRowActions
          user={user}
          onView={() => onView(user)}
          onEdit={() => onEdit(user)}
          onRestore={() => onRestore(user)}
          onDelete={() => onDelete(user)}
          onDisconnect={() => onDisconnect(user)}
        />
      </div>
    </div>
  )
}
