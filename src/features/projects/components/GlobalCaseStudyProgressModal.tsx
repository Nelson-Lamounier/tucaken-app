'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, Loader2, FolderGit2 } from 'lucide-react'
import { usePipelineRunStatus } from '@/hooks/use-admin-applications'
import { useCaseStudyProgressStore } from '@/lib/stores/case-study-progress-store'
import { projectsQueries } from '../server/queries'

/** mm ss elapsed, matching the JD progress copy style. */
function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`
}

interface CaseStudyProgressProps {
  readonly projectId: string
  readonly projectName: string
  readonly pipelineRunId?: string
  readonly startedAt: number
  readonly onClose: () => void
}

/**
 * Body of the case-study regenerate progress modal. Polls the regenerate
 * pipeline run (`pipeline_type='case_study'`, which only resolves
 * queued → complete/failed — no intermediate stages), shows an elapsed timer
 * while it runs, and a Done/Failed state when it settles. On completion it
 * refreshes the project so the regenerated case study appears.
 */
function CaseStudyProgress({ projectId, projectName, pipelineRunId, startedAt, onClose }: CaseStudyProgressProps) {
  const queryClient = useQueryClient()
  const run = usePipelineRunStatus(pipelineRunId ?? null, Boolean(pipelineRunId))
  const status = run?.status ?? 'queued'
  const isComplete = status === 'complete'
  const isFailed = status === 'failed'
  const isDone = isComplete || isFailed

  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt)
  useEffect(() => {
    if (isDone) return
    const iv = setInterval(() => setElapsedMs(Date.now() - startedAt), 1_000)
    return () => clearInterval(iv)
  }, [isDone, startedAt])

  // Refresh the project once the regenerate finishes so the new case study shows.
  useEffect(() => {
    if (!isComplete) return
    void queryClient.invalidateQueries({ queryKey: projectsQueries.detail(projectId).queryKey })
    void queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
  }, [isComplete, projectId, queryClient])

  if (isComplete) {
    return (
      <div className="flex flex-col items-center gap-5 px-6 py-14 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:ring-emerald-500/30">
          <CheckCircle2 className="size-9 text-emerald-600 dark:text-emerald-400" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Case study updated</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            “{projectName}” now reflects the repository you added.
          </p>
        </div>
        <Link
          to="/projects/$id"
          params={{ id: projectId }}
          onClick={onClose}
          className="rounded-md bg-teal-500/90 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-teal-400"
        >
          View project
        </Link>
      </div>
    )
  }

  if (isFailed) {
    return (
      <div className="flex flex-col items-center gap-5 px-6 py-14 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-rose-50 ring-1 ring-rose-600/20 dark:bg-rose-500/15 dark:ring-rose-500/30">
          <AlertTriangle className="size-9 text-rose-600 dark:text-rose-400" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Regeneration failed</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {run?.errorMessage?.trim() || 'The case-study run hit an error. You can retry it from the project.'}
          </p>
        </div>
        <Link
          to="/projects/$id"
          params={{ id: projectId }}
          onClick={onClose}
          className="rounded-md bg-white/10 px-3.5 py-1.5 text-sm font-medium text-zinc-200 ring-1 ring-white/15 transition-colors hover:bg-white/15"
        >
          View project
        </Link>
      </div>
    )
  }

  // Running (queued → no intermediate stages for case_study).
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-14 text-center">
      <span className="relative flex size-16 items-center justify-center rounded-full bg-violet-50 ring-1 ring-violet-600/20 dark:bg-violet-500/15 dark:ring-violet-500/30">
        <Loader2 className="size-8 animate-spin text-violet-600 dark:text-violet-400" />
      </span>
      <div>
        <h3 className="flex items-center justify-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Refreshing your case study
          <span className="font-mono text-xs font-normal tabular-nums text-zinc-400 dark:text-zinc-500">
            {formatElapsed(elapsedMs)}
          </span>
        </h3>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          <FolderGit2 className="size-3.5 shrink-0 text-teal-500 dark:text-teal-400" />
          Folding the new repo into “{projectName}” — usually 4–6 minutes.
        </p>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        You can leave this page — we'll keep going and notify you when it's ready.
      </p>
    </div>
  )
}

/**
 * App-global mount for the case-study regenerate progress modal. Driven by
 * `useCaseStudyProgressStore`, so it can be opened from the integrate-repo flow
 * or from a running Pipeline Notification on any page. Mount once in the
 * dashboard layout. Closing only hides it — the pipeline keeps running and is
 * tracked via the Pipeline Notifications bell.
 */
export function GlobalCaseStudyProgressModal() {
  const open = useCaseStudyProgressStore((s) => s.open)
  const projectId = useCaseStudyProgressStore((s) => s.projectId)
  const projectName = useCaseStudyProgressStore((s) => s.projectName)
  const pipelineRunId = useCaseStudyProgressStore((s) => s.pipelineRunId)
  const startedAt = useCaseStudyProgressStore((s) => s.startedAt)
  const closeProgress = useCaseStudyProgressStore((s) => s.closeProgress)

  if (projectId === null || startedAt === null) return null

  return (
    <Dialog open={open} onClose={closeProgress} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="w-full max-w-lg overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900 data-closed:scale-95 data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
        >
          <CaseStudyProgress
            projectId={projectId}
            projectName={projectName}
            pipelineRunId={pipelineRunId}
            startedAt={startedAt}
            onClose={closeProgress}
          />
        </DialogPanel>
      </div>
    </Dialog>
  )
}
