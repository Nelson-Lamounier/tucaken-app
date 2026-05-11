'use client'

import { Link } from '@tanstack/react-router'
import { FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
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
    content = (
      <div className="rounded-xl border border-white/10 py-8 text-center text-xs text-zinc-600">
        Loading resume files…
      </div>
    )
  } else if (imports.length === 0) {
    content = (
      <div className="rounded-xl border border-dashed border-white/10 py-10 text-center">
        <FileText className="mx-auto mb-2 size-7 text-zinc-700" />
        <p className="text-sm text-zinc-500">No resume files uploaded yet</p>
        <Link
          to="/settings/github"
          search={{ tab: 'resumes' }}
          className="mt-1.5 inline-block text-xs text-teal-400 hover:text-teal-300"
        >
          Upload your first resume →
        </Link>
      </div>
    )
  } else {
    content = (
      <>
        <ul className="divide-y divide-white/6 rounded-xl border border-white/10">
          {visible.map((imp) => {
            const isOk     = imp.status === 'completed' || imp.status === 'ready_for_review'
            const isFailed = imp.status === 'failed'

            const badgeClass = isOk
              ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/25'
              : isFailed
                ? 'bg-red-500/15 text-red-300 ring-red-400/25'
                : 'bg-indigo-500/15 text-indigo-300 ring-indigo-400/25'

            const badgeLabel = isOk ? 'Processed' : isFailed ? 'Failed' : 'Processing'

            return (
              <li key={imp.id} className="flex items-center gap-3 px-4 py-3">
                {isOk     && <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />}
                {isFailed && <AlertCircle  className="size-4 shrink-0 text-red-400" />}
                {!isOk && !isFailed && (
                  <Loader2 className="size-4 shrink-0 animate-spin text-indigo-400" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{imp.originalFilename}</p>
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
          <div className="text-right">
            <Link
              to="/settings/github"
              search={{ tab: 'resumes' }}
              className="text-xs text-teal-400 hover:text-teal-300"
            >
              View all {imports.length} →
            </Link>
          </div>
        )}
      </>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Resume Files</h3>
          <p className="mt-0.5 text-xs text-zinc-500">PDFs processed to seed your knowledge base</p>
        </div>
        <Link
          to="/settings/github"
          search={{ tab: 'resumes' }}
          className="text-xs text-teal-400 transition-colors hover:text-teal-300"
        >
          Upload →
        </Link>
      </div>
      {content}
    </section>
  )
}
