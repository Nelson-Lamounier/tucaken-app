/**
 * Standardized notification helpers.
 *
 * One entry point for showing errors/notifications as toasts, so every surface
 * is consistent and no raw server detail ever reaches the screen. Plain
 * functions (not hooks) — usable from mutation callbacks, effects, or event
 * handlers via the store's `getState()`.
 */

import { useToastStore } from '@/lib/stores/toast-store'
import { toUserError, type ErrorContext } from './user-error'

/** Errors linger a bit longer than the default success/info toast. */
const ERROR_TOAST_DURATION_MS = 8_000

/**
 * Show a standardized error toast for a failed action. The raw `err` is mapped
 * through {@link toUserError} (no server detail leaks). Pass `onRetry` to render
 * a Retry button that re-attempts the action.
 */
export function notifyError(
  err: unknown,
  context: ErrorContext = 'generic',
  opts?: { readonly onRetry?: () => void },
): void {
  const { tone, title, message } = toUserError(err, context)
  useToastStore.getState().notify({
    type: tone,
    title,
    message,
    action: opts?.onRetry ? { label: 'Retry', onClick: opts.onRetry } : undefined,
    duration: ERROR_TOAST_DURATION_MS,
  })
}

/** Show a standardized success toast (title + message). */
export function notifySuccess(title: string, message: string): void {
  useToastStore.getState().notify({ type: 'success', title, message })
}
