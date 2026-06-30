/**
 * GA4 (Google Analytics 4) loader with Consent Mode v2.
 *
 * gtag.js is injected lazily and only when GA4 is configured. Page views are
 * tracked manually because GA4 does not auto-track client-side route changes
 * in a SPA. All functions are SSR-safe and idempotent.
 */
import { ensureGtagStub } from '../../features/consent/consent-mode'

const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js'

let scriptInjected = false

export function getMeasurementId(): string {
  return import.meta.env.VITE_GA4_MEASUREMENT_ID ?? ''
}

export function isGa4Enabled(): boolean {
  return import.meta.env.VITE_GA4_ENABLED === 'true' && getMeasurementId() !== ''
}

/**
 * Inject gtag.js and run the initial config. Idempotent and no-op when GA4 is
 * disabled or unconfigured. Consent defaults must already be set (see
 * setConsentDefault) so the first config respects the denied state.
 */
export function loadGtagScript(): void {
  if (typeof window === 'undefined') return
  if (!isGa4Enabled() || scriptInjected) return

  const id = getMeasurementId()
  ensureGtagStub()

  const script = document.createElement('script')
  script.async = true
  script.src = `${GTAG_SRC}?id=${id}`
  document.head.appendChild(script)
  scriptInjected = true

  window.gtag?.('js', new Date())
  // We send page_view manually on each route change.
  window.gtag?.('config', id, { send_page_view: false })
}

/** Send a manual GA4 page_view. No-op when gtag is absent. */
export function trackPageView(path: string, title?: string): void {
  if (typeof window === 'undefined' || !window.gtag) return
  const params: Record<string, string> = { page_path: path }
  if (title) params.page_title = title
  window.gtag('event', 'page_view', params)
}
