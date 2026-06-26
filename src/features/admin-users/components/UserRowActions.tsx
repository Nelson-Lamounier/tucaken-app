import { Eye, ShieldCheck, RotateCcw, Unplug, Trash2 } from 'lucide-react'
import type { AdminUserSummary } from '../types'

const BTN =
  'inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100 transition-colors'

interface Props {
  readonly user: AdminUserSummary
  readonly onView: () => void
  readonly onEdit: () => void
  readonly onRestore: () => void
  readonly onDelete: () => void
  readonly onDisconnect: () => void
}

export function UserRowActions({ user, onView, onEdit, onRestore, onDelete, onDisconnect }: Props) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" aria-label="View user" title="View user" className={BTN} onClick={onView}>
        <Eye className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Manage access"
        title="Manage access"
        className={BTN}
        onClick={onEdit}
      >
        <ShieldCheck className="size-4" />
      </button>
      {user.deletedAt !== null && (
        <button
          type="button"
          aria-label="Restore user"
          title="Restore user"
          className={BTN}
          onClick={onRestore}
        >
          <RotateCcw className="size-4" />
        </button>
      )}
      <button
        type="button"
        aria-label="Disconnect GitHub"
        title="Disconnect GitHub"
        className={BTN}
        onClick={onDisconnect}
      >
        <Unplug className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Delete user"
        title="Delete user"
        className={`${BTN} hover:text-red-600`}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}
