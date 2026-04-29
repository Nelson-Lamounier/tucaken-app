import { Loader2 } from 'lucide-react'
import type { RepoSyncStatus } from '@/lib/types/github.types'

const STATUS_COLOURS: Record<RepoSyncStatus, string> = {
  pending: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  syncing: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300',
  complete: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  error: 'border-red-500/20 bg-red-500/10 text-red-300',
}

const STATUS_LABELS: Record<RepoSyncStatus, string> = {
  pending: 'pending',
  syncing: 'syncing',
  complete: 'synced',
  error: 'error',
}

export function GitHubSyncStatusBadge({ status }: { readonly status: RepoSyncStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[status]}`}
    >
      {status === 'syncing' && <Loader2 className="h-3 w-3 animate-spin" />}
      {STATUS_LABELS[status]}
    </span>
  )
}
