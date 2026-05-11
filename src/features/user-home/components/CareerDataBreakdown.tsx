'use client'

import { Link } from '@tanstack/react-router'
import { BookOpen, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import type { CareerEntry, ResumeImportRecord } from '@/server/resume-imports'

const ENTRY_LABELS: Record<string, string> = {
  experience:    'Experience',
  education:     'Education',
  skill:         'Skills',
  certification: 'Certifications',
  project:       'Projects',
  achievement:   'Achievements',
}

interface CareerDataBreakdownProps {
  readonly entries: CareerEntry[]
  readonly latestImport: ResumeImportRecord | undefined
  readonly isLoading: boolean
}

export function CareerDataBreakdown({
  entries,
  latestImport,
  isLoading,
}: CareerDataBreakdownProps) {
  const countsByType = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.entryType] = (acc[e.entryType] ?? 0) + 1
    return acc
  }, {})

  const isOk      = latestImport?.status === 'completed' || latestImport?.status === 'ready_for_review'
  const isFailed  = latestImport?.status === 'failed'
  const isPending = latestImport !== undefined && !isOk && !isFailed

  let content: React.ReactNode

  if (isLoading) {
    content = (
      <div className="rounded-xl border border-white/10 py-8 text-center text-xs text-zinc-600">
        Loading career data…
      </div>
    )
  } else if (entries.length === 0) {
    content = (
      <div className="rounded-xl border border-dashed border-white/10 py-10 text-center">
        <BookOpen className="mx-auto mb-2 size-7 text-zinc-700" />
        <p className="text-sm text-zinc-500">No career data extracted yet</p>
        <Link
          to="/settings/github"
          search={{ tab: 'resumes' }}
          className="mt-1.5 inline-block text-xs text-teal-400 hover:text-teal-300"
        >
          Upload a resume →
        </Link>
      </div>
    )
  } else {
    content = (
      <div className="space-y-3 rounded-xl border border-white/10 px-4 py-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(countsByType).map(([type, count]) => (
            <span
              key={type}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-zinc-300"
            >
              {count} {ENTRY_LABELS[type] ?? type}
            </span>
          ))}
        </div>

        {latestImport && (
          <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3">
            {isOk      && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />}
            {isFailed  && <AlertCircle  className="size-3.5 shrink-0 text-red-400" />}
            {isPending && <Loader2      className="size-3.5 shrink-0 animate-spin text-indigo-400" />}
            <span className="min-w-0 truncate text-xs text-zinc-400">
              {latestImport.originalFilename}
            </span>
            {latestImport.embeddingsCreatedCount > 0 && (
              <span className="ml-auto shrink-0 text-[10px] text-zinc-600">
                {latestImport.embeddingsCreatedCount} embeddings
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Career Data</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Extracted from your uploaded resume</p>
        </div>
        <Link
          to="/settings/github"
          search={{ tab: 'resumes' }}
          className="text-xs text-teal-400 transition-colors hover:text-teal-300"
        >
          View imports →
        </Link>
      </div>
      {content}
    </section>
  )
}
