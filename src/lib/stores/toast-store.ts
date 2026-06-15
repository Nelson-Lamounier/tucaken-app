/**
 * Toast Zustand Store
 *
 * Global toast notification system for the admin dashboard.
 * Renders non-blocking notifications for mutation results,
 * API errors, and user feedback.
 *
 * Toasts auto-dismiss after a configurable duration.
 */

import { create } from 'zustand'

// =============================================================================
// TYPES
// =============================================================================

/** Toast severity levels */
export type ToastType = 'success' | 'error' | 'info' | 'warning'

/** An optional inline action rendered as a button on the toast (e.g. Retry). */
export interface ToastAction {
  readonly label: string
  readonly onClick: () => void
}

/** Individual toast notification */
export interface Toast {
  readonly id: string
  readonly type: ToastType
  /** Optional bold headline shown above the message. */
  readonly title?: string
  readonly message: string
  /** Optional single action button (e.g. Retry). */
  readonly action?: ToastAction
  readonly duration: number
}

/** Structured input for {@link ToastActions.notify}. */
export interface NotifyInput {
  readonly type: ToastType
  readonly title?: string
  readonly message: string
  readonly action?: ToastAction
  readonly duration?: number
}

/** Toast store state */
interface ToastState {
  /** Active toast notifications */
  toasts: Toast[]
}

/** Toast store actions */
interface ToastActions {
  /**
   * Adds a toast notification.
   *
   * @param type - Severity level
   * @param message - Display message
   * @param duration - Auto-dismiss time in milliseconds (default: 4000)
   */
  addToast: (type: ToastType, message: string, duration?: number) => void

  /**
   * Adds a structured toast (title + message + optional action). Preferred for
   * standardized errors/notifications — see `notifyError`.
   */
  notify: (input: NotifyInput) => void

  /** Removes a toast by ID */
  removeToast: (id: string) => void

  /** Clears all toasts */
  clearToasts: () => void
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default toast display duration (milliseconds) */
const DEFAULT_TOAST_DURATION_MS = 4_000

// =============================================================================
// STORE
// =============================================================================

/**
 * Global toast notification store.
 *
 * @example
 * ```typescript
 * const { addToast } = useToastStore()
 * addToast('success', 'Article published successfully!')
 * addToast('error', 'Failed to save changes', 6000)
 * ```
 */

/**
 * Creates the toast store state and actions.
 * Extracted to module-level to reduce function nesting depth.
 *
 * @param set - Zustand set function
 * @returns Initial state and action handlers
 */
function createToastSlice(
  set: (fn: (state: ToastState) => Partial<ToastState>) => void,
): ToastState & ToastActions {
  const dismiss = (id: string) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))

  /** Append a toast and schedule its auto-dismiss. */
  const push = (toast: Toast) => {
    set((state) => ({ toasts: [...state.toasts, toast] }))
    globalThis.setTimeout(() => dismiss(toast.id), toast.duration)
  }

  return {
    toasts: [],

    addToast: (type, message, duration = DEFAULT_TOAST_DURATION_MS) => {
      push({ id: crypto.randomUUID(), type, message, duration })
    },

    notify: ({ type, title, message, action, duration = DEFAULT_TOAST_DURATION_MS }) => {
      push({ id: crypto.randomUUID(), type, title, message, action, duration })
    },

    removeToast: dismiss,

    clearToasts: () => set(() => ({ toasts: [] })),
  }
}

export const useToastStore = create<ToastState & ToastActions>()(createToastSlice)
