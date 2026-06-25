'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Activity, FileText, FileCheck2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { getDailyActivityFn } from '@/server/activity'
import type { DailyActivity } from '@/lib/types/rag.types'

/**
 * User activity panel — applications + resumes generated per day over the last
 * 30 days, as grouped bars, with running totals. Data: GET /activity/daily.
 */

const activityKey = ['user', 'activity', 'daily', 30] as const

function Legend({ colour, label }: { readonly colour: string; readonly label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
      <span className={`size-2 rounded-sm ${colour}`} aria-hidden />
      {label}
    </span>
  )
}

function Bar({ value, max, colour }: { readonly value: number; readonly max: number; readonly colour: string }) {
  const h = max === 0 ? 0 : Math.max(value > 0 ? 4 : 0, (value / max) * 100)
  return (
    <motion.span
      className={`w-1/2 max-w-2 self-end rounded-sm ${colour}`}
      style={{ height: `${h}%`, transformOrigin: 'bottom', willChange: 'transform' }}
      initial={{ scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={{ duration: 0.4 }}
    />
  )
}

function DayBars({ day, max }: { readonly day: DailyActivity; readonly max: number }) {
  const title = `${day.date}: ${day.applications} application(s), ${day.resumes} resume(s)`
  return (
    <div className="flex h-full flex-1 items-end justify-center gap-0.5" title={title}>
      <Bar value={day.applications} max={max} colour="bg-[var(--accent)]" />
      <Bar value={day.resumes} max={max} colour="bg-emerald-500/80 dark:bg-emerald-400/80" />
    </div>
  )
}

export function ActivityPanel() {
  const { data, isLoading } = useQuery({ queryKey: activityKey, queryFn: () => getDailyActivityFn({ data: { days: 30 } }) })

  if (isLoading) {
    return (
      <Card as="section" className="p-6">
        <p className="text-sm text-zinc-500">Loading your activity…</p>
      </Card>
    )
  }

  const days = data?.days ?? []
  const totals = data?.totals ?? { applications: 0, resumes: 0 }
  const max = days.reduce((m, d) => Math.max(m, d.applications, d.resumes), 0)

  return (
    <Card as="section" className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-[var(--accent)]" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Your activity</h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Last 30 days</span>
        </div>
        <div className="flex gap-3">
          <Legend colour="bg-[var(--accent)]" label="Applications" />
          <Legend colour="bg-emerald-500/80 dark:bg-emerald-400/80" label="Resumes" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-zinc-400" />
          <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{totals.applications}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">applications</span>
        </div>
        <div className="flex items-center gap-2">
          <FileCheck2 className="size-4 text-zinc-400" />
          <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{totals.resumes}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">resumes</span>
        </div>
      </div>

      {max === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No applications or resumes generated in the last 30 days.
        </p>
      ) : (
        <div className="flex h-28 items-end gap-px">
          {days.map((d) => (
            <DayBars key={d.date} day={d} max={max} />
          ))}
        </div>
      )}
    </Card>
  )
}
