import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { useToastStore } from '@/lib/stores/toast-store'
import { notifyError } from '@/lib/errors/notify'
import type { ApplicationStatus, ApplicationSummary, ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { getApplicationsFn, deleteApplicationFn, getApplicationDetailFn, updateApplicationStatusFn } from '../server/applications'
import { getPipelineRunStatusFn } from '../server/pipelines'

const PIPELINE_POLL_INTERVAL = 5_000
const POLL_TIMEOUT_MS = 10 * 60 * 1_000

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
    refetchInterval: (queryResult) => {
      if (timedOut) return false

      const detail = queryResult.state.data
      const status = detail?.status
      if (!status) return false

      const isActive = ACTIVE_PIPELINE_STATUSES.has(status)

      // Also poll while any stage has prep_status === 'queued'
      const hasQueuedStage =
        detail?.stages != null &&
        Object.values(detail.stages).some((s) => s.prep_status === 'queued')

      if (!isActive && !hasQueuedStage) return false

      // Start timeout timer on first active poll
      if (!pollStartRef.current) {
        pollStartRef.current = Date.now()
      }

      // Check if we've exceeded the timeout
      const elapsed = Date.now() - pollStartRef.current
      if (elapsed > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return false
      }

      return PIPELINE_POLL_INTERVAL
    },
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
      setTimedOut(false)
    }
  }, [query.data])

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

