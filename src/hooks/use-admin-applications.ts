import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { useToastStore } from '@/lib/stores/toast-store'
import { notifyError } from '@/lib/errors/notify'
import type { ApplicationStatus, ApplicationSummary, ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { getApplicationsFn, deleteApplicationFn, getApplicationDetailFn, getApplicationStatusFn, updateApplicationStatusFn } from '../server/applications'
import { getPipelineRunStatusFn } from '../server/pipelines'

const PIPELINE_POLL_INTERVAL = 5_000
// Backstop: give up only after this long with NO observed progress. The timer
// resets whenever the run advances (its updatedAt changes), so a long-but-active
// run never trips it. Set well above the slowest successful run (~11 min) so a
// healthy run is not mistaken for a stalled one — and even a trip recovers when
// the pipeline run completes (see ProgressBars isFinished).
const POLL_TIMEOUT_MS = 20 * 60 * 1_000

const ACTIVE_PIPELINE_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  'analysing',
  'coaching',
] as ApplicationStatus[])

export function useApplications(status = 'all') {
  const pollStartRef = useRef<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  const query = useQuery<ApplicationSummary[]>({
    queryKey: adminKeys.applications.applications(status),
    queryFn: async () => {
      const data = await getApplicationsFn({ data: { status } })
      if (Array.isArray(data)) return data
      return []
    },
    refetchInterval: (queryResult) => {
      if (timedOut) return false

      const data = queryResult.state.data
      if (!data) return false

      const hasActive = data.some((app) =>
        ACTIVE_PIPELINE_STATUSES.has(app.status),
      )
      if (!hasActive) return false

      if (!pollStartRef.current) {
        pollStartRef.current = Date.now()
      }

      const elapsed = Date.now() - pollStartRef.current
      if (elapsed > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return false
      }

      return PIPELINE_POLL_INTERVAL
    },
  })

  useEffect(() => {
    const data = query.data
    if (!data) return

    const hasActive = data.some((app) =>
      ACTIVE_PIPELINE_STATUSES.has(app.status),
    )
    if (!hasActive) {
      pollStartRef.current = null
      setTimedOut(false)
    }
  }, [query.data])

  return { ...query, timedOut }
}

export function useApplicationDetail(slug: string) {
  const pollStartRef = useRef<number | null>(null)
  // Last-seen updatedAt — when it advances, the run made progress and the stall
  // timer resets, so a long-but-active run never times out.
  const lastUpdatedRef = useRef<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  const query = useQuery<ApplicationDetail>({
    queryKey: adminKeys.applications.detail(slug),
    queryFn: async () => {
      if (slug.startsWith('mock-')) {
        const timestamp = Number.parseInt(slug.replace('mock-', ''), 10)
        const elapsed = Date.now() - timestamp
        // FAKE progress for 26 seconds to match FAKE_STEPS UI exactly
        const isReady = elapsed > 26000 
        return {
          slug,
          targetCompany: 'Mock Company Inc',
          targetRole: 'Mock Developer',
          status: isReady ? 'analysis-ready' : 'analysing',
          interviewStage: 'applied',
          createdAt: new Date(timestamp).toISOString(),
          updatedAt: new Date().toISOString(),
          context: {
            pipelineId: 'mock-abc',
            cumulativeInputTokens: 100,
            cumulativeOutputTokens: 200,
            cumulativeThinkingTokens: 0,
            cumulativeCostUsd: 0.05
          },
          research: isReady ? {
             fitSummary: 'This is a mock fit summary.',
             fitRating: 'STRONG_FIT',
             verifiedMatches: [],
             partialMatches: [],
             gaps: [],
             experienceSignals: { yearsExpected: '3+', domain: 'Web', leadership: 'None', scale: 'Global' },
             technologyInventory: { languages: [], frameworks: [], infrastructure: [], tools: [], methodologies: [] }
          } : null,
          analysis: isReady ? {
             analysisXml: '<xml>Mock</xml>',
             coverLetter: {
               greeting: 'Dear Hiring Manager,',
               paragraphs: ['I am a mock applicant.'],
               signoff: { name: 'Mock User', email: 'mock@example.com', linkedin: '', github: '' },
             },
             metadata: { overallFitRating: 'STRONG_FIT', applicationRecommendation: 'APPLY' },
             resumeSuggestions: { additions: 1, reframes: 1, eslCorrections: 0, summary: 'Pretty good.' }
          } : null,
          interviewPrep: null
        } as ApplicationDetail
      }
      return getApplicationDetailFn({ data: slug }) as Promise<ApplicationDetail>
    },
    enabled: Boolean(slug),
    // NEVER self-poll: the full detail is a 9-query transaction. Live-follow
    // happens through the lightweight status probe below, which invalidates
    // this query only when something actually changed (see the
    // pool-saturation incident, docs/troubleshooting/).
  })

  // Reset timeout state when status changes to non-active and no queued stages
  useEffect(() => {
    const detail = query.data
    const status = detail?.status
    if (!status) return
    const hasQueuedStage =
      detail?.stages != null &&
      Object.values(detail.stages).some((s) => s.prep_status === 'queued')
    if (!ACTIVE_PIPELINE_STATUSES.has(status) && !hasQueuedStage) {
      pollStartRef.current = null
      lastUpdatedRef.current = null
      setTimedOut(false)
    }
  }, [query.data])

  // ── Live-follow via the lightweight status probe ──────────────────────────
  // While the application is in an active pipeline state (or a coach run is
  // queued), poll the one-query probe and invalidate the heavy detail query
  // only when the probe reports a change. Stall detection: if the probe
  // watermark stops advancing for POLL_TIMEOUT_MS, latch timedOut (same
  // contract the old self-polling exposed to ProgressBars).
  const queryClient = useQueryClient()
  const detailStatus = query.data?.status
  const detailHasQueuedStage =
    query.data?.stages != null &&
    Object.values(query.data.stages).some((s) => s.prep_status === 'queued')
  const followActive =
    !timedOut &&
    Boolean(slug) &&
    !slug.startsWith('mock-') &&
    Boolean(detailStatus) &&
    (ACTIVE_PIPELINE_STATUSES.has(detailStatus as ApplicationStatus) || detailHasQueuedStage)

  const probe = useQuery<ApplicationStatusProbe>({
    queryKey: adminKeys.applications.statusProbe(slug),
    queryFn: () => getApplicationStatusFn({ data: slug }) as Promise<ApplicationStatusProbe>,
    enabled: followActive,
    refetchInterval: () => {
      if (timedOut) return false
      if (!pollStartRef.current) pollStartRef.current = Date.now()
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return false
      }
      return PIPELINE_POLL_INTERVAL
    },
  })

  useEffect(() => {
    const p = probe.data
    if (!p || !followActive) return

    // Any watermark advance = progress → reset the stall timer.
    const watermark = `${p.status}|${String(p.hasQueuedStage)}|${p.updatedAt ?? ''}`
    if (lastUpdatedRef.current !== watermark) {
      lastUpdatedRef.current = watermark
      pollStartRef.current = Date.now()
    }

    // Refetch the heavy detail only when the probe disagrees with it.
    const statusChanged = p.status !== detailStatus
    const queuedCleared = detailHasQueuedStage && !p.hasQueuedStage
    if (statusChanged || queuedCleared) {
      void queryClient.invalidateQueries({ queryKey: adminKeys.applications.detail(slug) })
    }
  }, [probe.data, followActive, detailStatus, detailHasQueuedStage, queryClient, slug])

  // Leaving the active state clears the stall latch for the next run.
  useEffect(() => {
    if (!followActive && !timedOut) {
      pollStartRef.current = null
      lastUpdatedRef.current = null
    }
  }, [followActive, timedOut])

  return { ...query, timedOut }
}

interface StatusUpdateVariables {
  readonly slug: string
  readonly status: ApplicationStatus
  readonly interviewStage?: InterviewStage
}

export function useApplicationStatus() {
  const queryClient = useQueryClient()

  return useMutation<unknown, Error, StatusUpdateVariables>({
    mutationFn: ({ slug, status, interviewStage }) =>
      updateApplicationStatusFn({ data: { slug, status, interviewStage } }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: adminKeys.applications.detail(variables.slug),
      })
      void queryClient.invalidateQueries({
        queryKey: adminKeys.applications.all,
      })
    },
  })
}

export function useDeleteApplication() {
  const queryClient = useQueryClient()
  const addToast = useToastStore((s) => s.addToast)

  return useMutation({
    mutationFn: (slug: string) => deleteApplicationFn({ data: slug }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.applications.all })
      addToast('success', 'Application deleted.')
    },
    onError: (err) => {
      notifyError(err, 'delete')
    },
  })
}

/**
 * Polls pipeline_runs status for an in-flight K8s Job.
 * Maps raw status string to a stage ID used by ProgressBars.
 */
export function usePipelineRunStatus(runId: string | null, enabled: boolean) {
  const { data } = useQuery({
    queryKey: ['pipeline-run', runId],
    queryFn: () => getPipelineRunStatusFn({ data: runId! }),
    enabled: Boolean(runId) && enabled,
    refetchInterval: enabled ? PIPELINE_POLL_INTERVAL : false,
    staleTime: 3_000,
  })
  return data ?? null
}


/** Terminal statuses at which the notification watchers stop polling. */
const WATCHER_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'analysis-ready',
  'failed',
  'rejected',
])

/**
 * Lightweight status probe for the pipeline notification watchers.
 *
 * Polls GET /applications/:slug/status (one indexed query) instead of the
 * full detail endpoint (9 queries) — many watchers can mount at once after a
 * page load, and the heavy variant saturated the API's 5-connection pool
 * (5 s connect-timeout failures, 2026-07-18 incident).
 */
export interface ApplicationStatusProbe {
  slug: string
  status: string
  hasQueuedStage: boolean
  updatedAt: string | null
}

export const useApplicationStatusProbe = (slug: string) =>
  useQuery<ApplicationStatusProbe>({
    queryKey: adminKeys.applications.statusProbe(slug),
    queryFn: () => getApplicationStatusFn({ data: slug }) as Promise<ApplicationStatusProbe>,
    enabled: Boolean(slug),
    refetchInterval: (queryResult) => {
      const probe = queryResult.state.data
      if (probe && WATCHER_TERMINAL_STATUSES.has(probe.status) && !probe.hasQueuedStage) return false
      return PIPELINE_POLL_INTERVAL
    },
  })
