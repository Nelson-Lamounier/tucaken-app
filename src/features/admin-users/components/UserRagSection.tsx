'use client'

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Loader2, Database } from 'lucide-react'
import { getUserRepositoriesFn, getUserDiagnosticFn } from '@/server/admin-users'
import { KbScorePanel } from '@/features/user-home/components/KbScorePanel'

/**
 * Admin per-user RAG section for the user-detail slide-over:
 *   - the user's synced repositories with KB-quality + retrieval scores; each
 *     row deep-links to /admin/users/:userId/repos/:repo (RepoRagDetail page),
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

export function UserRagSection({ userId }: { readonly userId: string }) {
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
        ) : (repos.data ?? []).length === 0 ? (
          <p className="py-2 text-sm text-zinc-500">No synced repositories.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-white/5">
            {(repos.data ?? []).map((r) => (
              <li key={r.repoFullName}>
                <Link
                  to="/admin/users/$userId/repos/$repo"
                  params={{ userId, repo: r.repoFullName }}
                  className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-700 dark:text-zinc-200">{r.repoFullName}</span>
                  <span className={`shrink-0 text-xs font-semibold ${tone(r.kbQualityScore)}`}>KB {pct(r.kbQualityScore)}</span>
                  <span className="shrink-0 text-xs text-zinc-400">RAG {pct(r.retrievalScore)}</span>
                  <ChevronRight className="size-4 shrink-0 text-zinc-300" />
                </Link>
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
