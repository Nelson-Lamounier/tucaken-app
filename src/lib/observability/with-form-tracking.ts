/** @format */

import { trackFormSubmission } from './analytics'

/**
 * Run an async form action and report its outcome to GA4.
 * Fires `trackFormSubmission(formName, 'success')` when `run` resolves and
 * `(formName, 'error')` when it throws, then returns/rethrows unchanged so the
 * caller's existing success/error handling is untouched.
 */
export async function withFormTracking<T>(
  formName: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    const result = await run()
    trackFormSubmission(formName, 'success')
    return result
  } catch (error) {
    trackFormSubmission(formName, 'error')
    throw error
  }
}
