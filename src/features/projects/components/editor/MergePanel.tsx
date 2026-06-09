import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Combine } from 'lucide-react'
import { projectsQueries } from '../../server/queries'
import type { ProjectSummary } from '../../lib/types'

export interface MergePanelProps {
  readonly targetId:   string
  readonly targetName: string
  readonly isPending:  boolean
  readonly error:      string | null
  readonly onMerge:    (sourceIds: string[]) => void
}

export function MergePanel({ targetId, targetName, isPending, error, onMerge }: MergePanelProps) {
  const { data, isPending: listPending } = useQuery(
    projectsQueries.list({ limit: 100, offset: 0, includeArchived: false }),
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const candidates: ProjectSummary[] = (data?.items ?? []).filter((p) => p.id !== targetId)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canMerge = selected.size > 0

  return (
    <div className="rounded-md bg-white/2 p-4 inset-ring inset-ring-white/10">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-white/5 text-zinc-400 inset-ring inset-ring-white/10">
          <Combine className="size-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-zinc-100">Merge into this project</h3>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Selected projects are absorbed into <span className="text-zinc-300">{targetName}</span> and archived.
      </p>

      {listPending ? (
        <p className="text-xs text-zinc-500">Loading projects…</p>
      ) : candidates.length === 0 ? (
        <p className="text-xs text-zinc-500">No other projects to merge.</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {candidates.map((p) => {
            const checked = selected.has(p.id)
            return (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(p.id)}
                    className="size-3.5 rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-400/40"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{p.name}</span>
                  <span className="shrink-0 text-[11px] text-zinc-500">
                    {p.repository_count} repo{p.repository_count === 1 ? '' : 's'}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

      <button
        type="button"
        disabled={!canMerge || isPending}
        onClick={() => onMerge([...selected])}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 inset-ring inset-ring-white/10 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Combine className="size-3.5" />
        {isPending ? 'Merging…' : `Merge ${selected.size || ''} selected`.trim()}
      </button>
    </div>
  )
}
