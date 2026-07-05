'use client'

import { useQuery } from '@tanstack/react-query'
import { Activity, FileText, FileCheck2 } from 'lucide-react'
import { ParentSize } from '@visx/responsive'
import { Card } from '@/components/ui/Card'
import { getDailyActivityFn } from '@/server/activity'
import { ActivityBarChart } from './ActivityBarChart'

/**
 * User activity panel — applications + resumes generated per day over the last
 * 30 days, as a stacked visx bar chart (teal = applications, amber = resumes)
 * with running totals and hover tooltips. Data: GET /activity/daily.
 */

const activityKey = ['user', 'activity', 'daily', 30] as const

// Categorical series colours (tokens flip for dark mode in styles.css).
const APPLICATIONS_COLOUR = 'bg-[var(--accent)]'
const RESUMES_COLOUR = 'bg-[var(--chart-series-2)]'

function Legend({ colour, label }: { readonly colour: string; readonly label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
      <span className={`size-2 rounded-sm ${colour}`} aria-hidden />
      {label}
    </span>
  )
}

export function ActivityPanel() {
  const { data, isLoading } = useQuery({ queryKey: activityKey, queryFn: () => getDailyActivityFn({ data: { days: 30 } }) })

  if (isLoading) {
    return (
      <Card as="section" className="h-full p-6">
        <p className="text-sm text-zinc-500">Loading your activity…</p>
      </Card>
    )
  }

  const days = data?.days ?? []
  const totals = data?.totals ?? { applications: 0, resumes: 0 }
  const hasActivity = totals.applications + totals.resumes > 0

  return (
    <Card as="section" className="h-full space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-accent" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Your activity</h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Last 30 days</span>
        </div>
        <div className="flex gap-3">
          <Legend colour={APPLICATIONS_COLOUR} label="Applications" />
          <Legend colour={RESUMES_COLOUR} label="Resumes" />
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

      {hasActivity ? (
        <div className="h-40 w-full">
          <ParentSize>{({ width, height }) => <ActivityBarChart data={days} width={width} height={height} />}</ParentSize>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No applications or resumes generated in the last 30 days.
        </p>
      )}
    </Card>
  )
}
