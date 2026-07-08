'use client'

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { BookOpen, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { CareerEntriesModal } from '@/features/career-data/components/CareerEntriesModal'
import type { CareerEntry, ResumeImportRecord } from '@/server/resume-imports'

const ENTRY_LABELS: Record<string, string> = {
  experience:    'Experience',
  education:     'Education',
  skill:         'Skills',
  certification: 'Certifications',
  project:       'Projects',
  achievement:   'Achievements',
}

// Fixed render order → stable layout regardless of extraction order.
const ENTRY_ORDER = ['experience', 'education', 'skill', 'project', 'certification', 'achievement'] as const

const EASE = [0.22, 1, 0.36, 1] as const

interface CareerDataBreakdownProps {
  readonly entries: CareerEntry[]
  readonly latestImport: ResumeImportRecord | undefined
  readonly isLoading: boolean
}

function PanelShell({ actions, children }: { readonly actions?: React.ReactNode; readonly children: React.ReactNode }) {
  return (
    <Card as="section" className="flex h-full max-h-64 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-white/5">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Career Data</h3>
        <div className="flex items-center gap-3">{actions}</div>
      </div>
      {children}
    </Card>
  )
}

function CountRow({ label, count, max }: { readonly label: string; readonly count: number; readonly max: number }) {
  return (
    <div className="flex flex-col gap-1 px-6 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-teal-600 dark:text-teal-300">{count}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5">
        <motion.div
          className="h-full w-full rounded-full bg-teal-500 dark:bg-teal-400"
          style={{ transformOrigin: 'left', willChange: 'transform' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(0.02, Math.min(1, count / max)) }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </div>
    </div>
  )
}

export function CareerDataBreakdown({ entries, latestImport, isLoading }: CareerDataBreakdownProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const countsByType = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.entryType] = (acc[e.entryType] ?? 0) + 1
    return acc
  }, {})

  const rows = ENTRY_ORDER.filter(type => (countsByType[type] ?? 0) > 0).map(type => ({
    type,
    label: ENTRY_LABELS[type] ?? type,
    count: countsByType[type] ?? 0,
  }))
  const max = Math.max(1, ...rows.map(r => r.count))

  const isOk      = latestImport?.status === 'completed' || latestImport?.status === 'ready_for_review'
  const isFailed  = latestImport?.status === 'failed'
  const isPending = latestImport !== undefined && !isOk && !isFailed

  const viewImportsLink = (
    <Link
      to="/settings/github"
      search={{ tab: 'resumes' }}
      className="text-xs text-accent transition-opacity hover:opacity-80"
    >
      View imports →
    </Link>
  )

  if (isLoading) {
    return (
      <PanelShell actions={viewImportsLink}>
        <p className="px-6 py-8 text-center text-xs text-zinc-500 dark:text-zinc-600">Loading career data…</p>
      </PanelShell>
    )
  }

  if (entries.length === 0) {
    return (
      <PanelShell actions={viewImportsLink}>
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <BookOpen className="mb-2 size-7 text-zinc-400 dark:text-zinc-700" />
          <p className="text-sm text-zinc-500">No career data extracted yet</p>
          <Link
            to="/settings/github"
            search={{ tab: 'resumes' }}
            className="mt-1.5 inline-block text-xs text-accent transition-opacity hover:opacity-80"
          >
            Upload a resume →
          </Link>
        </div>
      </PanelShell>
    )
  }

  return (
    <PanelShell
      actions={
        <>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-xs text-accent transition-opacity hover:opacity-80"
          >
            View data
          </button>
          {viewImportsLink}
        </>
      }
    >
      <dl className="no-scrollbar flex min-h-0 flex-1 flex-col divide-y divide-zinc-200 overflow-y-auto dark:divide-white/5">
        {rows.map(row => (
          <CountRow key={row.type} label={row.label} count={row.count} max={max} />
        ))}
      </dl>

      {latestImport && (
        <div className="flex items-center gap-2 border-t border-zinc-200 px-6 py-2 dark:border-white/5">
          {isOk      && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" />}
          {isFailed  && <AlertCircle  className="size-3.5 shrink-0 text-red-500 dark:text-red-400" />}
          {isPending && <Loader2      className="size-3.5 shrink-0 animate-spin text-indigo-500 dark:text-indigo-400" />}
          <span className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-400">{latestImport.originalFilename}</span>
          {latestImport.embeddingsCreatedCount > 0 && (
            <span className="ml-auto shrink-0 text-[10px] text-zinc-500 dark:text-zinc-600">
              {latestImport.embeddingsCreatedCount} embeddings
            </span>
          )}
        </div>
      )}

      <CareerEntriesModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </PanelShell>
  )
}
