/**
 * Pipeline Notifications Store
 *
 * Persisted Zustand store for tracking active and completed pipeline
 * notifications across page navigations and refreshes.
 *
 * Stores notifications for both article generation pipelines and
 * application analysis pipelines, each with a link the user can follow
 * to monitor progress at any time.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

let fallbackNotificationIdCounter = 0

function createNotificationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `notif-${crypto.randomUUID()}`
  }

  fallbackNotificationIdCounter += 1
  return `notif-${Date.now()}-${fallbackNotificationIdCounter}`
}

// =============================================================================
// Types
// =============================================================================

/** Pipeline types tracked by the notification system */
export type PipelineNotificationType = 'article' | 'application' | 'case_study'

/** Status values for a tracked pipeline */
export type PipelineNotificationStatus = 'running' | 'review' | 'complete' | 'failed'

/** A single pipeline notification entry */
export interface PipelineNotification {
  /** Unique notification ID */
  readonly id: string
  /**
   * Canonical id (users.id) of the user this notification belongs to. Stamped
   * from the current session at creation time so the browser-local store — which
   * is shared across every account that signs into this browser — never surfaces
   * one user's pipeline to another. Optional only for legacy entries persisted
   * before scoping existed; those are dropped on the next setCurrentUser call.
   */
  readonly userId?: string
  /** Pipeline type — determines which polling strategy to use */
  readonly type: PipelineNotificationType
  /** Pipeline/article/application slug */
  readonly slug: string
  /** Human-readable label (article slug, or "Company — Role") */
  readonly label: string
  /** Current pipeline status */
  status: PipelineNotificationStatus
  /** Deep link to the monitoring page */
  readonly link: string
  /** Pipeline run id, when known — lets a reopened progress modal track real stages. */
  readonly pipelineRunId?: string
  /** Unix timestamp (ms) when the pipeline was started */
  readonly createdAt: number
  /** Unix timestamp (ms) when the pipeline reached a terminal state */
  completedAt?: number
  /** Whether the user has read/acknowledged this notification */
  read: boolean
}

// =============================================================================
// Store interface
// =============================================================================

interface PipelineNotificationsState {
  notifications: PipelineNotification[]
  /**
   * Canonical id (users.id) of the signed-in user, or null when signed out.
   * Not persisted — it is re-established from the session on every load so a
   * stale value can never widen visibility.
   */
  currentUserId: string | null
}

interface PipelineNotificationsActions {
  /**
   * Adds a new pipeline notification (duplicate slugs are ignored). The entry is
   * stamped with the current `currentUserId` so it stays scoped to its owner.
   */
  addNotification: (
    notification: Omit<PipelineNotification, 'id' | 'createdAt' | 'read' | 'userId'>,
  ) => void

  /**
   * Sets the active user and drops every notification that does not belong to
   * them. Call on sign-in (with users.id) and sign-out (with null). This is the
   * teardown that prevents one account's pipelines leaking into another's bell
   * on a shared browser.
   */
  setCurrentUser: (userId: string | null) => void

  /**
   * Updates the status (and optionally completedAt) of an existing notification.
   */
  updateNotification: (slug: string, status: PipelineNotificationStatus) => void

  /** Marks a single notification as read. */
  markAsRead: (id: string) => void

  /** Marks all notifications as read. */
  markAllAsRead: () => void

  /** Removes a single notification by ID. */
  removeNotification: (id: string) => void

  /** Removes all completed/failed notifications. */
  clearCompleted: () => void
}

// =============================================================================
// Store
// =============================================================================

/**
 * Persisted pipeline notification store.
 *
 * Uses localStorage so notifications survive page refresh and navigation.
 *
 * @example
 * ```typescript
 * const { addNotification } = usePipelineNotificationsStore()
 * addNotification({
 *   type: 'article',
 *   slug: 'my-article',
 *   label: 'my-article',
 *   status: 'running',
 *   link: '/ai-agent?mode=pipeline&slug=my-article',
 * })
 * ```
 */
/**
 * Running entries older than this can never legitimately complete — the
 * client poll gives up after 20 minutes — so they are pruned on rehydrate.
 * Regression guard for the notification-stampede incident where persisted
 * stale 'running' entries each mounted a detail-polling watcher on every
 * page load (~24 concurrent heavy requests → pool saturation → 5 s
 * connect-timeout failures).
 */
export const STALE_RUNNING_MAX_AGE_MS = 25 * 60_000

/** Drop running notifications older than the stale ceiling; terminal entries are kept. */
export const pruneStaleRunning = (
  notifications: PipelineNotification[],
  nowMs: number,
): PipelineNotification[] =>
  notifications.filter(
    (n) => n.status !== 'running' || nowMs - n.createdAt <= STALE_RUNNING_MAX_AGE_MS,
  )

export const usePipelineNotificationsStore = create<
  PipelineNotificationsState & PipelineNotificationsActions
>()(
  persist(
    (set) => ({
      notifications: [],
      currentUserId: null,

      addNotification: (notification) => {
        set((state) => {
          // Prevent duplicate entries for the same slug, scoped to this user.
          const exists = state.notifications.some(
            (n) => n.slug === notification.slug && n.userId === state.currentUserId,
          )
          if (exists) {
            // Re-activate if previously completed
            return {
              notifications: state.notifications.map((n) =>
                n.slug === notification.slug && n.userId === state.currentUserId
                  ? { ...n, status: notification.status, completedAt: undefined, read: false }
                  : n,
              ),
            }
          }

          const id = createNotificationId()
          const newNotification: PipelineNotification = {
            ...notification,
            id,
            userId: state.currentUserId ?? undefined,
            createdAt: Date.now(),
            read: false,
          }
          return { notifications: [newNotification, ...state.notifications] }
        })
      },

      setCurrentUser: (userId) => {
        set((state) => ({
          currentUserId: userId,
          notifications: state.notifications.filter((n) => n.userId === userId),
        }))
      },

      updateNotification: (slug, status) => {
        set((state) => ({
          notifications: state.notifications.map((n) => {
            if (n.slug !== slug) return n
            const isTerminal = status === 'complete' || status === 'failed' || status === 'review'
            return {
              ...n,
              status,
              completedAt: isTerminal && !n.completedAt ? Date.now() : n.completedAt,
            }
          }),
        }))
      },

      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          ),
        }))
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }))
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }))
      },

      clearCompleted: () => {
        set((state) => ({
          notifications: state.notifications.filter(
            (n) => n.status === 'running',
          ),
        }))
      },
    }),
    {
      name: 'pipeline-notifications',
      // Persist only the entries — currentUserId is re-established from the
      // session on load, so notifications stay hidden until the owner is known.
      partialize: (state) => ({ notifications: state.notifications }),
      // Prune stale 'running' entries as persisted state loads, so a watcher
      // is never mounted for a pipeline that gave up long ago.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.notifications = pruneStaleRunning(state.notifications, Date.now())
      },
    },
  ),
)
