'use client'

import { Link } from '@tanstack/react-router'
import { FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { ResumeImportRecord } from '@/server/resume-imports'

const MAX_VISIBLE = 3

interface ResumeFilesListProps {
  readonly imports: ResumeImportRecord[]
  readonly isLoading: boolean
}

export function ResumeFilesList({ imports, isLoading }: ResumeFilesListProps) {
  const visible  = imports.slice(0, MAX_VISIBLE)
  const overflow = imports.length - MAX_VISIBLE

  let content: React.ReactNode

  if (isLoading) {
    content = <p className="px-6 py-6 text-sm text-zinc-500">Loading resume files…</p>
  } else if (imports.length === 0) {
    content = (
      <div className="px-6 py-8 text-center">
        <FileText className="mx-auto mb-2 size-7 text-zinc-400 dark:text-zinc-700" />
        <p className="text-sm text-zinc-500">No resume files uploaded yet</p>
        <Link
          to="/settings/github"
          search={{ tab: 'resumes' }}
          className="mt-1.5 inline-block text-xs text-accent transition-opacity hover:opacity-80"
        >
          Upload your first resume →
        </Link>
      </div>
    )
  } else {
    content = (
      <>
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-white/5">
          {visible.map((imp) => {
            const isOk     = imp.status === 'completed' || imp.status === 'ready_for_review'
            const isFailed = imp.status === 'failed'

            let badgeClass: string
            if (isOk)          { badgeClass = 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25' }
            else if (isFailed) { badgeClass = 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/25' }
            else               { badgeClass = 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/25' }

            let badgeLabel: string
            if (isOk)          { badgeLabel = 'Processed' }
            else if (isFailed) { badgeLabel = 'Failed' }
            else               { badgeLabel = 'Processing' }

            return (
              <li key={imp.id} className="flex items-center gap-3 px-6 py-3">
                {isOk     && <CheckCircle2 className="size-4 shrink-0 text-emerald-500 dark:text-emerald-400" />}
                {isFailed && <AlertCircle  className="size-4 shrink-0 text-red-500 dark:text-red-400" />}
                {!isOk && !isFailed && (
                  <Loader2 className="size-4 shrink-0 animate-spin text-indigo-500 dark:text-indigo-400" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-800 dark:text-zinc-200">{imp.originalFilename}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {new Date(imp.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                    {imp.careerEntriesCreated.length > 0 && (
                      <> · {imp.careerEntriesCreated.length} entries</>
                    )}
                  </p>
                </div>

                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${badgeClass}`}>
                  {badgeLabel}
                </span>
              </li>
            )
          })}
        </ul>

        {overflow > 0 && (
          <div className="border-t border-zinc-200 px-6 py-3 text-right dark:border-white/5">
            <Link
              to="/settings/github"
              search={{ tab: 'resumes' }}
              className="text-xs text-accent transition-opacity hover:opacity-80"
            >
              View all {imports.length} →
            </Link>
          </div>
        )}
      </>
    )
  }

  return (
    <Card as="section" className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-white/5">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Resume Files</h3>
        <Link
          to="/settings/github"
          search={{ tab: 'resumes' }}
          className="text-xs text-accent transition-opacity hover:opacity-80"
        >
          Upload →
        </Link>
      </div>
      {content}
    </Card>
  )
}
