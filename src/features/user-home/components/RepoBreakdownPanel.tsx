'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { getKbHealthFn } from '@/server/activity'
import type { RepoRagSummary } from '@/lib/types/rag.types'
import { paginate } from '../lib/paginate'

/** How many repositories to show per page before the pager appears. */
const PAGE_SIZE = 5

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
    <li className="flex items-center gap-3 px-6 py-2">
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

/** Informational pager footer — page range text plus prev/next controls. */
function Pager({
  start, end, total, safePage, pageCount, onPrev, onNext,
}: {
  readonly start: number
  readonly end: number
  readonly total: number
  readonly safePage: number
  readonly pageCount: number
  readonly onPrev: () => void
  readonly onNext: () => void
}) {
  const btn = 'rounded-md p-1 text-zinc-500 transition-colors enabled:hover:bg-zinc-100 disabled:opacity-40 dark:enabled:hover:bg-white/5'
  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-6 py-2 dark:border-white/5">
      <span className="text-[11px] tabular-nums text-zinc-500">{start + 1}–{end} of {total}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onPrev} disabled={safePage === 0} aria-label="Previous repositories" className={btn}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={onNext} disabled={safePage >= pageCount - 1} aria-label="Next repositories" className={btn}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

export function RepoBreakdownPanel() {
  const { data, isLoading } = useQuery({ queryKey: kbQualityKey, queryFn: getKbHealthFn })
  const [page, setPage] = useState(0)

  const repositories = data?.repositories ?? []
  const repoCount = data?.totals?.repoCount ?? 0
  const max = Math.max(1, ...repositories.map(r => r.chunkCount ?? 0))

  const { pageCount, safePage, start, end } = paginate(repositories.length, page, PAGE_SIZE)
  const visible = repositories.slice(start, end)
  const showPager = !isLoading && repositories.length > PAGE_SIZE

  let body: React.ReactNode
  if (isLoading) {
    body = <p className="px-6 py-6 text-sm text-zinc-500">Calculating per-repository quality…</p>
  } else if (repositories.length === 0) {
    body = (
      <p className="px-6 py-6 text-sm text-zinc-500 dark:text-zinc-400">
        No synced repositories yet — connect a repo to build your Knowledge Base.
      </p>
    )
  } else {
    body = (
      <ul className="no-scrollbar flex min-h-0 flex-1 flex-col divide-y divide-zinc-200 overflow-y-auto dark:divide-white/5">
        {visible.map((r, i) => (
          <RepoBar key={r.repoFullName} repo={r} max={max} index={i} />
        ))}
      </ul>
    )
  }

  return (
    <Card as="section" className="flex h-full max-h-64 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-white/5">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Per repository</h3>
        {!isLoading && (
          <span className="text-[11px] font-medium tabular-nums text-zinc-500">
            {repoCount} {repoCount === 1 ? 'repo' : 'repos'}
          </span>
        )}
      </div>
      {body}
      {showPager && (
        <Pager
          start={start}
          end={end}
          total={repositories.length}
          safePage={safePage}
          pageCount={pageCount}
          onPrev={() => setPage(p => Math.max(0, p - 1))}
          onNext={() => setPage(p => Math.min(pageCount - 1, p + 1))}
        />
      )}
    </Card>
  )
}
