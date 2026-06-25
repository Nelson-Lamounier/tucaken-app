import type { RepoRagSummary } from '@/lib/types/rag.types'

/** Presentational RAG detail for one repo — scores + raw breakdowns. Shared by
 *  the deep-linkable admin route and (historically) the in-panel drill-in. */

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

export function RepoRagDetail({ repo }: { readonly repo: RepoRagSummary }) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{repo.repoFullName}</h4>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><span className="text-zinc-500">KB quality</span><p className={`text-lg font-semibold ${tone(repo.kbQualityScore)}`}>{pct(repo.kbQualityScore)}</p></div>
        <div><span className="text-zinc-500">Retrieval</span><p className={`text-lg font-semibold ${tone(repo.retrievalScore)}`}>{pct(repo.retrievalScore)}</p></div>
        <div><span className="text-zinc-500">Classification</span><p className="font-medium">{repo.classification ?? '—'}</p></div>
        <div><span className="text-zinc-500">Files</span><p className="font-medium tabular-nums">{repo.fileCount ?? 0}</p></div>
        <div><span className="text-zinc-500">Chunks</span><p className="font-medium tabular-nums">{repo.chunkCount ?? 0}</p></div>
        <div><span className="text-zinc-500">Embedded</span><p className="font-medium tabular-nums">{repo.embeddedCount ?? 0}</p></div>
      </div>
      <Breakdown title="KB quality breakdown" data={repo.kbQualityBreakdown} />
      <Breakdown title="Retrieval breakdown" data={repo.retrievalBreakdown} />
    </div>
  )
}
