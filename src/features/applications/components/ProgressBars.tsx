import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Cpu,
  FileSearch,
  FileText,
  Database,
} from 'lucide-react'
import { useApplicationDetail, usePipelineRunStatus } from '@/hooks/use-admin-applications'
import { useApplicationRequeue } from '../hooks/use-application-requeue'

// =============================================================================
// Pipeline stage definitions
//
// Reflects the real K8s Job execution sequence for the Strategist pipeline.
// Timing windows are based on observed Bedrock invocation latency:
//   K8s Job scheduled  ~0–8 s    (pod pull + start)
//   Research Agent     ~8–90 s   (job description extraction + KB retrieval)
//   Strategist Agent   ~90–240 s (resume + cover letter generation)
//   Persist            ~240–260 s (PG write + status update)
//
// Advancement is driven by elapsed wall-clock time and real pipeline_runs
// status when available. Windows are intentionally wider than median latency
// so the last stage does not show complete before the real pipeline finishes.
// =============================================================================

type StageStatus = 'complete' | 'current' | 'upcoming' | 'failed'

interface PipelineStage {
  id: string
  name: string
  description: string
  Icon: React.ComponentType<{ className?: string }>
  startMs: number
  endMs: number
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 'queued',
    name: 'Getting started',
    description: 'Setting up your run. This takes a few seconds.',
    Icon: Cpu,
    startMs: 0,
    endMs: 8_000,
  },
  {
    id: 'research',
    name: 'Researching the role',
    description: 'Reading the job description and matching it against your knowledge base.',
    Icon: FileSearch,
    startMs: 8_000,
    endMs: 90_000,
  },
  {
    id: 'strategist',
    name: 'Writing your resume',
    description: 'Tailoring your resume to the role.',
    Icon: FileText,
    startMs: 90_000,
    endMs: 240_000,
  },
  {
    id: 'persist',
    name: 'Saving results',
    description: 'Saving your resume and analysis.',
    Icon: Database,
    startMs: 240_000,
    endMs: 260_000,
  },
]

// =============================================================================
// Helpers
// =============================================================================

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`
}

// =============================================================================
// Component
// =============================================================================

export function ProgressBars({
  slug,
  pipelineRunId,
  startedAt,
}: {
  slug: string
  pipelineRunId?: string
  startedAt: number
}) {
  const { data, timedOut } = useApplicationDetail(slug)
  const requeue = useApplicationRequeue()

  // Poll pipeline_runs while the application status is active (or not yet loaded).
  // Do NOT derive this from isFailed — pipelineRun.status itself informs isFailed,
  // so coupling the enabled flag to isFailed would create a circular dependency.
  const appIsActive = !data || ['analysing', 'coaching'].includes(data.status)
  const pipelineRun = usePipelineRunStatus(pipelineRunId ?? null, appIsActive)

  // Failure: check both sources. If the K8s Job was OOM-killed before its catch
  // block ran, kanban_status stays 'analysing' but pipeline_runs.status may have
  // been updated to 'failed' by an earlier successful DB write.
  const isFailed   = data?.status === 'failed' || pipelineRun?.status === 'failed'
  const isFinished = data != null && !['analysing', 'coaching'].includes(data.status)
  // ── Elapsed wall-clock ────────────────────────────────────────────────────
  // Derived from the caller-supplied start time so the timer stays correct even
  // if this component unmounts (modal closed) and remounts (modal re-opened).
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt)

  useEffect(() => {
    if (isFinished || isFailed) return
    const iv = setInterval(() => setElapsedMs(Date.now() - startedAt), 1_000)
    return () => clearInterval(iv)
  }, [isFinished, isFailed, startedAt])

  // ── Stage status resolution ───────────────────────────────────────────────
  // Real pipeline_runs status takes priority over wall-clock estimation.
  function pipelineStatusToStageId(status: string | null | undefined): string | null {
    if (status === 'queued')      return 'queued'
    if (status === 'researching') return 'research'
    if (status === 'analysing')   return 'strategist'
    if (status === 'persisting')  return 'persist'
    return null
  }

  const activeStageId = pipelineStatusToStageId(pipelineRun?.status) ?? null
  const activeStageIdx = activeStageId
    ? PIPELINE_STAGES.findIndex(s => s.id === activeStageId)
    : -1

  function getStageStatus(idx: number): StageStatus {
    if (isFailed) {
      const lastStarted = activeStageIdx >= 0
        ? activeStageIdx
        : PIPELINE_STAGES.reduce((acc, s, i) => elapsedMs >= s.startMs ? i : acc, 0)
      if (idx < lastStarted) return 'complete'
      if (idx === lastStarted) return 'failed'
      return 'upcoming'
    }
    if (isFinished) return 'complete'
    // Real pipeline_runs state available
    if (activeStageIdx >= 0) {
      if (idx < activeStageIdx) return 'complete'
      if (idx === activeStageIdx) return 'current'
      return 'upcoming'
    }
    // Fallback: wall-clock estimation
    const s = PIPELINE_STAGES[idx]
    if (elapsedMs >= s.endMs)   return 'complete'
    if (elapsedMs >= s.startMs) return 'current'
    return 'upcoming'
  }

  // ── Heading copy ──────────────────────────────────────────────────────────
  const heading = isFailed
    ? 'Build failed'
    : timedOut
    ? 'Build timed out'
    : isFinished
    ? 'Resume ready'
    : 'Building your resume'

  const subheading = isFailed
    ? 'The run hit an error. Retry to run it again.'
    : timedOut
    ? 'No update for 10 minutes. The run may have stalled. Retry to run it again.'
    : isFinished
    ? 'Your tailored resume and analysis are ready.'
    : 'This usually takes 4–6 minutes. You can leave this page.'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto px-6 py-10 sm:px-10">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{heading}</h3>
          <p className="mt-1 text-xs text-zinc-500">{subheading}</p>
        </div>

        {!isFinished && !isFailed && (
          <div className="flex-none flex items-center gap-1.5 rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 px-2.5 py-1.5 font-mono text-xs tabular-nums">
            <Clock className="w-3 h-3 shrink-0" />
            {formatElapsed(elapsedMs)}
          </div>
        )}
      </div>

      {/* Steps */}
      <ol className="space-y-0" role="list" aria-label="Pipeline progress">
        {PIPELINE_STAGES.map((stage, idx) => {
          const status = getStageStatus(idx)
          const isLast  = idx === PIPELINE_STAGES.length - 1
          const { Icon } = stage

          return (
            <li key={stage.id} className="relative">
              {/* Connector */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={[
                    'absolute left-3.75 top-7.5 w-px',
                    'h-[calc(100%-4px)] transition-colors duration-700',
                    status === 'complete'            ? 'bg-emerald-500/35' :
                    status === 'current'             ? 'bg-violet-500/25' :
                    status === 'failed'              ? 'bg-rose-500/25' :
                    /* upcoming */                     'bg-zinc-200 dark:bg-zinc-800',
                  ].join(' ')}
                />
              )}

              <div className="flex items-start gap-4 pb-7">
                {/* Step icon */}
                <div className="relative flex-none mt-0.5" aria-hidden="true">
                  {status === 'complete' && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 ring-emerald-600/20 dark:bg-emerald-500/15 dark:ring-emerald-500/30 ring-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </span>
                  )}
                  {status === 'current' && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 ring-violet-600/25 dark:bg-violet-500/15 dark:ring-violet-500/35 ring-1 animate-pulse">
                      <Loader2 className="w-4 h-4 text-violet-600 dark:text-violet-400 animate-spin" />
                    </span>
                  )}
                  {status === 'failed' && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 ring-rose-600/20 dark:bg-rose-500/15 dark:ring-rose-500/30 ring-1">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    </span>
                  )}
                  {status === 'upcoming' && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800/60 dark:ring-zinc-700/50">
                      <Icon className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600" />
                    </span>
                  )}
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1 pt-1">
                  <p className={[
                    'text-sm font-medium leading-none',
                    status === 'complete' ? 'text-zinc-700 dark:text-zinc-200' :
                    status === 'current'  ? 'text-violet-600 dark:text-violet-300' :
                    status === 'failed'   ? 'text-rose-600 dark:text-rose-300' :
                    /* upcoming */          'text-zinc-400 dark:text-zinc-600',
                  ].join(' ')}>
                    {stage.name}
                  </p>
                  <p className={[
                    'mt-1 text-xs leading-relaxed',
                    status === 'upcoming' ? 'text-zinc-400 dark:text-zinc-700' : 'text-zinc-500',
                  ].join(' ')}>
                    {stage.description}
                  </p>
                </div>

                {/* Running badge */}
                {status === 'current' && (
                  <div className="flex-none pt-0.5">
                    <span className="inline-flex items-center rounded-full bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20 px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset">
                      running
                    </span>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Footer */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          You can leave this page. We'll notify you when it's ready.
        </p>

        {(isFailed || timedOut) ? (
          <button
            type="button"
            onClick={() => requeue.mutate({ slug })}
            disabled={requeue.isPending || requeue.isSuccess}
            className="inline-flex flex-none items-center gap-1.5 rounded-lg bg-rose-50 text-rose-700 ring-rose-600/20 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20 dark:hover:bg-rose-500/15 px-3 py-1.5 text-xs font-medium ring-1 ring-inset disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {requeue.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {requeue.isSuccess ? 'Requeued' : 'Retry via DLQ'}
          </button>
        ) : (
          <Link
            to="/applications/$slug"
            params={{ slug }}
            className="flex-none text-xs text-zinc-500 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            View results →
          </Link>
        )}
      </div>

      {/* DLQ error feedback */}
      {requeue.isError && (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          Requeue failed: {requeue.error instanceof Error ? requeue.error.message : 'Unknown error'}
        </p>
      )}
    </div>
  )
}
