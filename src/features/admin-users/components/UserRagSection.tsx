'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Database } from 'lucide-react'
import { getUserRepositoriesFn, getUserDiagnosticFn } from '@/server/admin-users'
import { KbScorePanel } from '@/features/user-home/components/KbScorePanel'
import type { RepoRagSummary } from '@/lib/types/rag.types'

/**
 * Admin per-user RAG section for the user-detail slide-over:
 *   - the user's synced repositories with KB-quality + retrieval scores,
 *   - a dedicated drill-in detail view per repo (scores + raw breakdowns),
 *   - the user's FULL Resume-Readiness diagnostic (every metric end users no
 *     longer see) via KbScorePanel.
 */

function pct(score: number | null): string {
  return score == null ? '—' : `${Math.round(score * 100)}%`
}

function tone(score: number | null): string {
  if (score == null) return 'text-zinc-400'
  if (score >= 0.6) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function Breakdown({ title, data }: { readonly title: string; readonly data: unknown }) {
  if (data == null || typeof data !== 'object') return null
  const entries = Object.entries(data as Record<string, unknown>)
  if (entries.length === 0) return null
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{title}</p>
      <div className="divide-y divide-zinc-100 dark:divide-white/5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">{k}</span>
            <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-200">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RepoDetail({ repo, onBack }: { readonly repo: RepoRagSummary; readonly onBack: () => void }) {
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        <ChevronLeft className="size-4" /> Back to repositories
      </button>
      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{repo.repoFullName}</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-zinc-500">KB quality</span><p className={`text-lg font-semibold ${tone(repo.kbQualityScore)}`}>{pct(repo.kbQualityScore)}</p></div>
        <div><span className="text-zinc-500">Retrieval</span><p className={`text-lg font-semibold ${tone(repo.retrievalScore)}`}>{pct(repo.retrievalScore)}</p></div>
        <div><span className="text-zinc-500">Files</span><p className="font-medium tabular-nums">{repo.fileCount ?? 0}</p></div>
        <div><span className="text-zinc-500">Chunks</span><p className="font-medium tabular-nums">{repo.chunkCount ?? 0}</p></div>
        <div><span className="text-zinc-500">Embedded</span><p className="font-medium tabular-nums">{repo.embeddedCount ?? 0}</p></div>
        <div><span className="text-zinc-500">Classification</span><p className="font-medium">{repo.classification ?? '—'}</p></div>
      </div>
      <Breakdown title="KB quality breakdown" data={repo.kbQualityBreakdown} />
      <Breakdown title="Retrieval breakdown" data={repo.retrievalBreakdown} />
    </div>
  )
}

export function UserRagSection({ userId }: { readonly userId: string }) {
  const [selected, setSelected] = useState<RepoRagSummary | null>(null)
  const repos = useQuery({ queryKey: ['admin', 'user-repos', userId], queryFn: () => getUserRepositoriesFn({ data: { id: userId } }) })
  const diag = useQuery({ queryKey: ['admin', 'user-diagnostic', userId], queryFn: () => getUserDiagnosticFn({ data: { id: userId } }), retry: false })

  return (
    <div className="mt-6 space-y-6">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Database className="size-3.5" /> Synced repositories
        </h3>
        {repos.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-violet-400" /></div>
        ) : selected ? (
          <RepoDetail repo={selected} onBack={() => setSelected(null)} />
        ) : (repos.data ?? []).length === 0 ? (
          <p className="py-2 text-sm text-zinc-500">No synced repositories.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-white/5">
            {(repos.data ?? []).map((r) => (
              <li key={r.repoFullName}>
                <button type="button" onClick={() => setSelected(r)} className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-white/5">
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-700 dark:text-zinc-200">{r.repoFullName}</span>
                  <span className={`shrink-0 text-xs font-semibold ${tone(r.kbQualityScore)}`}>KB {pct(r.kbQualityScore)}</span>
                  <span className="shrink-0 text-xs text-zinc-400">RAG {pct(r.retrievalScore)}</span>
                  <ChevronRight className="size-4 shrink-0 text-zinc-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Resume-Readiness (admin)</h3>
        {diag.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-violet-400" /></div>
        ) : (
          <KbScorePanel diagnostic={diag.data?.diagnostic ?? null} isLoading={diag.isLoading} />
        )}
      </section>
    </div>
  )
}
