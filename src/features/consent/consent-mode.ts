/**
 * Google Consent Mode v2 bridge.
 *
 * Translates the consent store's categories into the Google signals that
 * gtag.js reads. All signals default to `denied`; nothing is granted until
 * the user opts in. Pushing to `dataLayer` works whether or not gtag.js has
 * loaded yet — once it loads it replays the queued commands in order.
 */
import type { ConsentState, ConsentValue } from './types'

declare global {
  interface Window {
    // gtag itself is declared in src/lib/observability/analytics.ts
    dataLayer?: IArguments[]
  }
}

/** Idempotently install the dataLayer + gtag shim. */
export function ensureGtagStub(): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer ?? []
  if (window.gtag) return
  function gtag() {
    // gtag.js requires the raw `arguments` object, not a rest array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments as unknown as IArguments)
  }
  window.gtag = gtag as Window['gtag']
}

/** Push the all-denied consent default. Call before loading gtag.js. */
export function setConsentDefault(): void {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500,
  })
}

function normalise(value: ConsentValue | undefined): ConsentValue {
  return value === 'granted' ? 'granted' : 'denied'
}

/** Push a consent update reflecting the current store categories. */
export function syncConsentMode(
  state: Pick<ConsentState, 'analytics' | 'marketing'>,
): void {
  if (typeof window === 'undefined' || !window.gtag) return
  const analytics = normalise(state.analytics)
  const marketing = normalise(state.marketing)
  window.gtag('consent', 'update', {
    analytics_storage: analytics,
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
  })
}
