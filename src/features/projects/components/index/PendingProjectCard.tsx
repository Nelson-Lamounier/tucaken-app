import { Loader2 } from 'lucide-react'
import type { ProjectSummary } from '../../lib/types'

/**
 * Status-only card for a per-repo default that is being set up via an Add-time
 * intent (build or link). The ingestion Job applies the intent automatically;
 * no user action is required. The card simply makes the in-progress state
 * visible instead of leaving the project hidden.
 */
export function PendingProjectCard({ project }: { readonly project: ProjectSummary }) {
  return (
    <li className="flex flex-col gap-2 rounded-md bg-white/2 px-4 py-4 inset-ring inset-ring-white/10">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center text-teal-400">
          <Loader2 className="size-4 animate-spin" />
        </span>
        <span className="truncate text-sm font-medium text-zinc-200">{project.name}</span>
      </div>
      <p className="text-xs text-zinc-500">
        Building your case study from this repo - this completes automatically after the sync.
      </p>
    </li>
  )
}
