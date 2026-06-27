'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { FileText, Layers, Gauge, GitBranch, Briefcase, Upload } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { getKbHealthFn } from '@/server/activity'
import type { KbStats } from '../lib/kb-stats'

/**
 * Knowledge Base overview — one card consolidating ingestion totals (files,
 * chunks, avg quality) with connected-data counts (repositories, career entries,
 * resume uploads) as staggered metric rows. Ingestion data: GET
 * /activity/kb-health; the count metrics come from the dashboard's derived
 * KbStats. The per-repository breakdown lives in its own side-by-side panel.
 */

const kbQualityKey = ['user', 'kb-health'] as const

interface Metric {
  readonly id: string
  readonly icon: LucideIcon
  readonly label: string
  readonly value: string
}

interface KbOverviewPanelProps {
  readonly stats: KbStats
}

export function KbOverviewPanel({ stats }: KbOverviewPanelProps) {
  const { data } = useQuery({ queryKey: kbQualityKey, queryFn: getKbHealthFn })

  const totals = data?.totals
  const avgPct = totals?.avgKbQuality == null ? null : Math.round(totals.avgKbQuality * 100)

  const metrics: Metric[] = [
    { id: 'files', icon: FileText, label: 'Files', value: (totals?.files ?? 0).toLocaleString() },
    { id: 'chunks', icon: Layers, label: 'Chunks', value: (totals?.chunks ?? 0).toLocaleString() },
    { id: 'avg', icon: Gauge, label: 'Avg quality', value: avgPct == null ? '—' : `${avgPct}%` },
    { id: 'repos', icon: GitBranch, label: 'Repositories', value: String(stats.repoCount) },
    { id: 'career', icon: Briefcase, label: 'Career entries', value: String(stats.careerEntryCount) },
    { id: 'uploads', icon: Upload, label: 'Resume uploads', value: String(stats.importCount) },
  ]

  return (
    <Card as="section" className="@container flex h-full max-h-64 flex-col overflow-hidden">
      <div className="flex items-center border-b border-zinc-200 px-6 py-4 dark:border-white/5">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Knowledge Base</h3>
      </div>

      <div className="no-scrollbar grid min-h-0 flex-1 grid-cols-1 gap-x-4 gap-y-3 overflow-y-auto p-4 @3xs:grid-cols-2 @2xl:grid-cols-3">
        {metrics.map((m, i) => {
          const Icon = m.icon
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3, ease: 'easeOut' }}
              style={{ willChange: 'transform, opacity' }}
              className="flex items-center gap-2.5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-accent dark:bg-white/5">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold leading-tight tabular-nums text-zinc-900 dark:text-zinc-100">{m.value}</div>
                <div className="truncate text-[11px] leading-tight text-zinc-500" title={m.label}>{m.label}</div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}
