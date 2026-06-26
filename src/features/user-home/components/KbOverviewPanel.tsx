'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Database, FileText, Layers, Gauge, GitBranch, Briefcase, Upload } from 'lucide-react'
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
    { id: 'files', icon: FileText, label: 'Files processed', value: (totals?.files ?? 0).toLocaleString() },
    { id: 'chunks', icon: Layers, label: 'Chunks generated', value: (totals?.chunks ?? 0).toLocaleString() },
    { id: 'avg', icon: Gauge, label: 'Avg KB quality', value: avgPct == null ? '—' : `${avgPct}%` },
    { id: 'repos', icon: GitBranch, label: 'Connected Repositories', value: String(stats.repoCount) },
    { id: 'career', icon: Briefcase, label: 'Career Entries', value: String(stats.careerEntryCount) },
    { id: 'uploads', icon: Upload, label: 'Resume Uploads', value: String(stats.importCount) },
  ]

  return (
    <Card as="section" className="p-6">
      <div className="mb-5 flex items-center gap-2">
        <Database className="size-5 text-accent" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Knowledge Base</h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Files, chunks, repositories and career data at a glance</span>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-white/5">
        {metrics.map((m, i) => {
          const Icon = m.icon
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3, ease: 'easeOut' }}
              style={{ willChange: 'transform, opacity' }}
              className="flex items-center gap-2 py-3"
            >
              <div className="flex w-1/2 items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-300">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-accent dark:bg-white/5">
                  <Icon className="size-4" />
                </span>
                <span className="truncate" title={m.label}>{m.label}</span>
              </div>
              <div className="flex w-1/2 justify-end">
                <span className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{m.value}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}
