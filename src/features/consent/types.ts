/**
 * Consent domain types. Necessary cookies are always granted and are NOT
 * represented here — only the user-controllable categories are stored.
 */

/** A single Consent Mode v2 signal value. */
export type ConsentValue = 'granted' | 'denied'

/** User-controllable consent categories. Necessary is implicit/always-on. */
export type ConsentCategory = 'analytics' | 'marketing'

/** Bump to force re-consent when categories or policy change. */
export const CONSENT_VERSION = 1

/** Persisted consent state. `undefined` category = undecided (banner shows). */
export interface ConsentState {
  analytics?: ConsentValue
  marketing?: ConsentValue
  /** True once the user has actioned the banner (accept/reject/saved prefs). */
  decided: boolean
  version: number
}

export interface ConsentActions {
  acceptAll: () => void
  rejectAll: () => void
  setCategory: (category: ConsentCategory, value: ConsentValue) => void
  /** Clear the decision so the banner shows again (used on version bump). */
  reset: () => void
}
