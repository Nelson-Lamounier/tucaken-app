import { Bot, Clock, CheckCircle, ExternalLink, Archive, XCircle, Search, PenLine, ShieldCheck } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { PipelineSubmittedBanner } from './PipelineSubmittedBanner'
import { PipelineResultsPanel } from './PipelineResultsPanel'
import { usePipelineStatus } from '../hooks/use-pipeline-status'
import type { PipelineState } from '../hooks/use-pipeline-status'
import { useArticleVersions } from '@/hooks/use-admin-articles'
import { usePipelineRunStatus } from '@/hooks/use-admin-applications'

interface PipelineModeProps {
  readonly pipelineSlug: string
  readonly backToMenu: () => void
}

// ── Pipeline stage definitions ────────────────────────────────────────────────
//
// Reflects the real article-pipeline K8s Job execution. admin-api dispatches the
// Job (POST /pipelines/article-job/:slug — createNamespacedJob); pipeline_runs.
// status advances researching → writing → qa → complete (or failed at any step).
// There is no Step Functions state machine — that was the retired Lambda flow.

interface Stage {
  id: string
  label: string
  description: string
  icon: React.ElementType
}

const STAGES: Stage[] = [
  { id: 'research', label: 'Research', description: 'Haiku 4.5 — knowledge base + web research', icon: Search },
  { id: 'writer',   label: 'Writer',   description: 'Sonnet 4.6 — MDX article generation',       icon: PenLine },
  { id: 'qa',       label: 'QA Agent', description: 'Sonnet 4.6 — accuracy, quality & retry-then-flag gate', icon: ShieldCheck },
]

export type StageStatus = 'pending' | 'active' | 'done' | 'failed'

/** Number of stages in the article pipeline (Research → Writer → QA). */
export const ARTICLE_STAGE_COUNT = 3

/**
 * Map the real pipeline_runs.status to the index of the stage it is running.
 * Returns -1 for non-stage statuses (queued/complete/failed/unknown) so the
 * caller falls back to the coarse article state.
 */
export function runStatusToStageIdx(status: string | null | undefined): number {
  if (status === 'researching') return 0
  if (status === 'writing')     return 1
  if (status === 'qa')          return 2
  return -1
}

const TERMINAL_OK: ReadonlySet<PipelineState> = new Set<PipelineState>([
  'review',
  'flagged',
  'published',
  'rejected',
])

export interface StageInputs {
  /** Coarse article-row status (usePipelineStatus). */
  readonly state: PipelineState
  /** Live pipeline_runs.status (usePipelineRunStatus), or null when unavailable. */
  readonly runStatus: string | null | undefined
  /** The status poll gave up (>10 min without resolution). */
  readonly timedOut: boolean
}

/**
 * Per-stage status, from BOTH the coarse article state and the real
 * pipeline_runs status. Mirrors the Strategist tracker: a run whose Job died
 * before its catch block leaves the article row 'processing' but flips
 * pipeline_runs.status to 'failed' — so a stage must render as failed (never
 * left spinning) even when the article state alone still says 'processing'.
 */
export function stageStatusAt(idx: number, { state, runStatus, timedOut }: StageInputs): StageStatus {
  const runStageIdx = runStatusToStageIdx(runStatus)
  const isFailed = state === 'failed' || runStatus === 'failed'
  const isFinished = TERMINAL_OK.has(state) || runStatus === 'complete'
  const isStalled = isFailed || (timedOut && !isFinished)

  if (isStalled) {
    const stalledAt = runStageIdx >= 0 ? runStageIdx : 0
    if (idx < stalledAt) return 'done'
    if (idx === stalledAt) return 'failed'
    return 'pending'
  }
  if (isFinished) return 'done'
  if (runStageIdx >= 0) {
    if (idx < runStageIdx) return 'done'
    if (idx === runStageIdx) return 'active'
    return 'pending'
  }
  // No run row yet (dispatch just started): show the first stage active so the
  // tracker never sits blank, rather than marking every stage active at once.
  if (state === 'processing' && idx === 0) return 'active'
  return 'pending'
}

// ── Stage step component ──────────────────────────────────────────────────────

function StageStep({ stage, status }: { stage: Stage; status: StageStatus }) {
  const Icon = stage.icon

  const iconCls = {
    pending: 'bg-zinc-800 text-zinc-600',
    active:  'bg-violet-500/20 text-violet-400 animate-pulse',
    done:    'bg-emerald-500/20 text-emerald-400',
    failed:  'bg-red-500/20 text-red-400',
  }[status]

  const labelCls = {
    pending: 'text-zinc-600',
    active:  'text-violet-300',
    done:    'text-zinc-200',
    failed:  'text-red-400',
  }[status]

  return (
    <div className="flex items-start gap-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconCls}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className={`text-sm font-medium ${labelCls}`}>{stage.label}</p>
        <p className="text-[11px] text-zinc-600">{stage.description}</p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PipelineMode({ pipelineSlug, backToMenu }: PipelineModeProps) {
  const pipelineStatus = usePipelineStatus(pipelineSlug)
  const state: PipelineState = pipelineStatus.data?.pipelineState ?? 'pending'

  // Poll the real pipeline_runs row for this article. The coarse article status
  // (usePipelineStatus, keyed on the articles row) stays 'processing' when the
  // K8s Job dies before its catch block runs — only pipeline_runs.status flips to
  // 'failed'. Mirror the Strategist tracker: track BOTH sources. useArticleVersions
  // returns runs newest-first, so [0] is the current run; usePipelineRunStatus then
  // live-polls it (status + errorMessage) while the run is active.
  const runActive = state === 'pending' || state === 'processing'
  const versions = useArticleVersions(runActive ? pipelineSlug : null)
  const latestRunId = versions.data?.versions?.[0]?.pipelineRunId ?? null
  const run = usePipelineRunStatus(latestRunId, runActive)

  const runStageIdx = runStatusToStageIdx(run?.status)
  const stageInputs: StageInputs = { state, runStatus: run?.status, timedOut: pipelineStatus.timedOut }

  // Dual-source terminal detection (see stageStatusAt for the rationale).
  const isFailed = state === 'failed' || run?.status === 'failed'
  const isFinished = state === 'review' || state === 'flagged' || state === 'published'
    || state === 'rejected' || run?.status === 'complete'
  const isStalled = isFailed || (pipelineStatus.timedOut && !isFinished)

  const isRunning = !isFinished && !isStalled && (state === 'processing' || runStageIdx >= 0)
  const failureReason = run?.errorMessage ?? null

  return (
    <div className="mx-auto max-w-2xl space-y-6">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20">
            <Bot className="h-5 w-5 text-violet-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-200">Pipeline Tracker</h2>
            <p className="truncate text-xs text-zinc-500">
              Slug: <code className="rounded bg-zinc-800 px-1.5 text-violet-400">{pipelineSlug}</code>
            </p>
          </div>
          {isRunning && (
            <div className="flex items-center gap-1.5 rounded-full bg-violet-500/10 px-3 py-1">
              <Clock className="h-3 w-3 text-violet-400" />
              <span className="text-[11px] font-medium text-violet-400">Polling every 5s</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Pipeline steps ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <p className="mb-4 text-xs font-medium uppercase tracking-wide text-zinc-500">Pipeline stages</p>
        <div className="space-y-4">
          {STAGES.map((stage, i) => (
            <div key={stage.id}>
              <StageStep stage={stage} status={stageStatusAt(i, stageInputs)} />
              {i < STAGES.length - 1 && (
                <div className="ml-4 mt-1 h-4 w-px bg-zinc-800" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Pending banner ───────────────────────────────────────────────────── */}
      {state === 'pending' && !isStalled && (
        <PipelineSubmittedBanner slug={pipelineSlug} />
      )}

      {/* ── Results: Generated Title + QA evaluation + Actions ───────────────── */}
      <PipelineResultsPanel
        pipelineSlug={pipelineSlug}
        onActionComplete={backToMenu}
      />

      {/* ── Published ────────────────────────────────────────────────────────── */}
      {state === 'published' && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-300">Article published successfully!</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`/articles/${pipelineSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Article
                </a>
                <Link
                  to="/articles"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
                >
                  Articles list
                </Link>
                <button
                  onClick={backToMenu}
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
                >
                  Create Another
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Rejected ─────────────────────────────────────────────────────────── */}
      {state === 'rejected' && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
              <Archive className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-300">Article rejected and archived</p>
              <p className="mt-1 text-xs text-zinc-500">Moved to archive. Source draft preserved.</p>
              <button onClick={backToMenu} className="mt-3 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700">
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Failed ───────────────────────────────────────────────────────────── */}
      {isFailed && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/20">
              <XCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-300">Pipeline run failed</p>
              <p className="mt-1 text-xs text-zinc-500">
                The article-pipeline Job errored before finishing. Retry to run it again.
              </p>
              {failureReason && (
                <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md bg-zinc-950/60 p-3 font-mono text-[11px] leading-relaxed text-red-300/90 ring-1 ring-red-500/15">
                  {failureReason}
                </pre>
              )}
              <button onClick={backToMenu} className="mt-3 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700">
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Polling timeout (only when not already failed/finished) ──────────── */}
      {pipelineStatus.timedOut && !isFailed && !isFinished && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
              <Clock className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-300">Lost contact with this run</p>
              <p className="mt-1 text-xs text-zinc-500">
                It has run over 10 minutes without a status update and may have stalled. Check the run history, or retry.
              </p>
              <button onClick={backToMenu} className="mt-3 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700">
                Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
