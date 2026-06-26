'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { GitBranch } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { getKbHealthFn } from '@/server/activity'
import type { RepoRagSummary } from '@/lib/types/rag.types'

/**
 * Per-repository Knowledge Base breakdown — one horizontal bar per repo sized by
 * chunks generated and tinted by quality (emerald/amber/red), with the chunk
 * count and quality % alongside. Same card design as KbOverviewPanel, sits
 * beside it. Data: GET /activity/kb-health (shares the cache key).
 */

const kbQualityKey = ['user', 'kb-health'] as const

function qualityTone(score: number | null): string {
  if (score == null) return 'bg-zinc-300 dark:bg-white/15'
  if (score >= 0.6) return 'bg-emerald-500 dark:bg-emerald-400'
  if (score >= 0.4) return 'bg-amber-500 dark:bg-amber-400'
  return 'bg-red-500 dark:bg-red-400'
}

function shortRepo(full: string): string {
  return full.split('/').pop() ?? full
}

function RepoBar({ repo, max, index }: { readonly repo: RepoRagSummary; readonly max: number; readonly index: number }) {
  const chunks = repo.chunkCount ?? 0
  const pct = Math.max(2, (chunks / max) * 100)
  const qpct = repo.kbQualityScore == null ? null : Math.round(repo.kbQualityScore * 100)
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="w-28 shrink-0 truncate text-sm font-medium text-zinc-700 dark:text-zinc-200" title={repo.repoFullName}>
        {shortRepo(repo.repoFullName)}
      </span>
      <div className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
        <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%` }}>
          <motion.div
            className={`h-full rounded-full ${qualityTone(repo.kbQualityScore)}`}
            style={{ transformOrigin: 'left center', willChange: 'transform' }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, delay: index * 0.05, ease: 'easeOut' }}
          />
        </div>
      </div>
      <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {chunks.toLocaleString()}
      </span>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-zinc-400">{qpct == null ? '—' : `${qpct}%`}</span>
    </li>
  )
}

export function RepoBreakdownPanel() {
  const { data, isLoading } = useQuery({ queryKey: kbQualityKey, queryFn: getKbHealthFn })

  if (isLoading) {
    return (
      <Card as="section" className="p-6">
        <p className="text-sm text-zinc-500">Calculating per-repository quality…</p>
      </Card>
    )
  }

  const repositories = data?.repositories ?? []
  const repoCount = data?.totals?.repoCount ?? 0
  const max = Math.max(1, ...repositories.map(r => r.chunkCount ?? 0))

  return (
    <Card as="section" className="p-6">
      <div className="mb-5 flex items-center gap-2">
        <GitBranch className="size-5 text-accent" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Per repository</h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Chunks and quality across {repoCount} repositories</span>
      </div>

      {repositories.length === 0 ? (
        <p className="py-4 text-sm text-zinc-500 dark:text-zinc-400">
          No synced repositories yet — connect a repo to build your Knowledge Base.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-white/5">
          {repositories.map((r, i) => (
            <RepoBar key={r.repoFullName} repo={r} max={max} index={i} />
          ))}
        </ul>
      )}
    </Card>
  )
}
