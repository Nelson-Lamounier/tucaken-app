'use client'

/**
 * PipelineNotificationWatcher
 *
 * Null-rendering root-level component that polls the status of all running
 * pipeline notifications and updates the notification store when they complete.
 *
 * Mount once in AppLayout so it persists across all page navigations.
 * Each running notification gets its own watcher child that owns a TanStack
 * Query polling hook — no manual interval management needed.
 */

import { useEffect } from 'react'
import { usePipelineNotificationsStore } from '@/lib/stores/pipeline-notifications-store'
import { usePipelineStatus } from '@/features/ai-agent/hooks/use-pipeline-status'
import { useApplicationDetail, usePipelineRunStatus } from '@/hooks/use-admin-applications'

// ── Article watcher ───────────────────────────────────────────────────────────

/**
 * Watches a single article pipeline and updates the notification store
 * when it reaches a terminal state.
 */
function ArticleNotificationWatcher({ slug }: { slug: string }) {
  const updateNotification = usePipelineNotificationsStore((s) => s.updateNotification)
  const pipelineStatus = usePipelineStatus(slug)

  useEffect(() => {
    const state = pipelineStatus.data?.pipelineState
    if (!state) return

    if (state === 'review' || state === 'flagged') {
      updateNotification(slug, 'review')
    } else if (state === 'published') {
      updateNotification(slug, 'complete')
    } else if (state === 'rejected' || state === 'failed') {
      updateNotification(slug, 'failed')
    }
    // 'pending' and 'processing' keep status as 'running'
  }, [pipelineStatus.data?.pipelineState, slug, updateNotification])

  return null
}

// ── Application watcher ───────────────────────────────────────────────────────

/**
 * Watches a single application pipeline and updates the notification store
 * when it reaches a terminal state.
 */
function ApplicationNotificationWatcher({ slug }: { slug: string }) {
  const updateNotification = usePipelineNotificationsStore((s) => s.updateNotification)
  const detail = useApplicationDetail(slug)

  useEffect(() => {
    const status = detail.data?.status
    if (!status) return

    // Terminal non-active states
    if (status === 'analysis-ready') {
      updateNotification(slug, 'complete')
    } else if (status === 'failed' || status === 'rejected') {
      updateNotification(slug, 'failed')
    }
    // 'analysing' / 'coaching' keep status as 'running'
  }, [detail.data?.status, slug, updateNotification])

  return null
}

// ── Case-study watcher ──────────────────────────────────────────────────────

/**
 * Watches a single case-study regenerate pipeline (folding a repo into a
 * project) and updates the notification store when it settles. Unlike the
 * application pipeline there is no detail page status to read — the run only
 * resolves queued → complete/failed — so it polls the pipeline run directly.
 */
function CaseStudyNotificationWatcher({ slug, pipelineRunId }: { slug: string; pipelineRunId?: string }) {
  const updateNotification = usePipelineNotificationsStore((s) => s.updateNotification)
  const run = usePipelineRunStatus(pipelineRunId ?? null, Boolean(pipelineRunId))

  useEffect(() => {
    const status = run?.status
    if (status === 'complete') {
      updateNotification(slug, 'complete')
    } else if (status === 'failed') {
      updateNotification(slug, 'failed')
    }
    // 'queued' keeps status as 'running'
  }, [run?.status, slug, updateNotification])

  return null
}

// ── Root watcher ──────────────────────────────────────────────────────────────

/**
 * Renders one background watcher per running pipeline notification.
 * Mount this once at the AppLayout level.
 */
export function PipelineNotificationWatcher() {
  const notifications = usePipelineNotificationsStore((s) => s.notifications)
  const currentUserId = usePipelineNotificationsStore((s) => s.currentUserId)

  // Defence-in-depth: only poll the signed-in user's pipelines. setCurrentUser
  // already prunes the store, but this guards the render path against any timing
  // window where a foreign entry is still present.
  const running = notifications.filter(
    (n) => n.status === 'running' && n.userId === currentUserId,
  )

  return (
    <>
      {running.map((n) => {
        if (n.type === 'article') return <ArticleNotificationWatcher key={n.slug} slug={n.slug} />
        if (n.type === 'case_study') {
          return <CaseStudyNotificationWatcher key={n.slug} slug={n.slug} pipelineRunId={n.pipelineRunId} />
        }
        return <ApplicationNotificationWatcher key={n.slug} slug={n.slug} />
      })}
    </>
  )
}
