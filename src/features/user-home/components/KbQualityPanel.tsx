'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Database, FileText, Layers, Gauge } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { getKbHealthFn } from '@/server/activity'
import type { RepoRagSummary } from '@/lib/types/rag.types'

/**
 * Resume-Readiness (user view) — repository/KB quality at a glance. Instead of
 * the readiness diagnostic (admin-only), end users see how good their generated
 * Knowledge Base is: total files + chunks processed during ingestion, an overall
 * quality signal, and a per-repo breakdown. Mirrors the "Knowledge Base data
 * health" glance. Data: GET /activity/kb-health (the caller's own repos).
 */

const kbQualityKey = ['user', 'kb-health'] as const

function qualityTone(score: number | null): string {
  if (score == null) return 'bg-zinc-300 dark:bg-white/15'
  if (score >= 0.6) return 'bg-emerald-500 dark:bg-emerald-400'
  if (score >= 0.4) return 'bg-amber-500 dark:bg-amber-400'
  return 'bg-red-500 dark:bg-red-400'
}

function Tile({ icon: Icon, label, value }: { readonly icon: typeof FileText; readonly label: string; readonly value: string }) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-[var(--accent)]" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</span>
      </div>
      <span className="text-3xl font-semibold leading-none tabular-nums text-zinc-900 dark:text-zinc-100">{value}</span>
    </Card>
  )
}

function RepoRow({ repo }: { readonly repo: RepoRagSummary }) {
  const pct = repo.kbQualityScore == null ? 0 : Math.round(repo.kbQualityScore * 100)
  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium text-zinc-700 dark:text-zinc-200">{repo.repoFullName}</span>
      <span className="w-16 shrink-0 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{repo.fileCount ?? 0} files</span>
      <span className="w-20 shrink-0 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{repo.chunkCount ?? 0} chunks</span>
      <div className="hidden w-24 shrink-0 sm:block">
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
          <div className={`h-full rounded-full ${qualityTone(repo.kbQualityScore)}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-400">{repo.kbQualityScore == null ? '—' : `${pct}%`}</span>
    </li>
  )
}

export function KbQualityPanel() {
  const { data, isLoading } = useQuery({ queryKey: kbQualityKey, queryFn: getKbHealthFn })

  if (isLoading) {
    return (
      <Card as="section" className="p-6">
        <p className="text-sm text-zinc-500">Calculating your Knowledge Base quality…</p>
      </Card>
    )
  }

  const totals = data?.totals
  const repositories = data?.repositories ?? []
  const avgPct = totals?.avgKbQuality == null ? null : Math.round(totals.avgKbQuality * 100)

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Database className="size-5 text-[var(--accent)]" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Resume-Readiness</h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Knowledge Base quality from your repositories</span>
      </div>

      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Tile icon={FileText} label="Files processed" value={String(totals?.files ?? 0)} />
        <Tile icon={Layers} label="Chunks generated" value={String(totals?.chunks ?? 0)} />
        <Tile icon={Gauge} label="Avg KB quality" value={avgPct == null ? '—' : `${avgPct}%`} />
      </motion.div>

      <Card as="section" className="p-5">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Per repository · {totals?.repoCount ?? 0}
        </p>
        {repositories.length === 0 ? (
          <p className="py-4 text-sm text-zinc-500 dark:text-zinc-400">
            No synced repositories yet — connect a repo to build your Knowledge Base.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-white/5">
            {repositories.map((r) => (
              <RepoRow key={r.repoFullName} repo={r} />
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          Higher quality + more files processed means richer, more accurate tailoring.
        </p>
      </Card>
    </section>
  )
}
