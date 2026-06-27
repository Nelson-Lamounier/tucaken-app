import { useEffect, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  ensureGtagStub,
  setConsentDefault,
  syncConsentMode,
} from './consent-mode'
import { isGa4Enabled, loadGtagScript, trackPageView } from '../../lib/observability/ga4'
import { initialiseFaroAdmin } from '../../lib/observability/faro-admin'
import { useConsentStore } from './store'

/**
 * Headless component that wires consent state to telemetry. Renders nothing.
 *
 * - On mount: installs the gtag stub and pushes the all-denied default
 *   (before any tag loads).
 * - When Analytics is granted: pushes the consent update, lazy-loads gtag.js,
 *   and initialises Faro RUM.
 * - Subscribes to router navigations and sends a manual page_view, but only
 *   while Analytics consent is granted.
 */
export function ConsentEffects() {
  const router = useRouter()
  const analytics = useConsentStore((s) => s.analytics)
  const marketing = useConsentStore((s) => s.marketing)
  const analyticsRef = useRef(analytics)
  analyticsRef.current = analytics

  // 1. Bootstrap consent mode once, before any tag can load.
  useEffect(() => {
    ensureGtagStub()
    setConsentDefault()
  }, [])

  // 2. React to consent changes: update signals and load tags when granted.
  useEffect(() => {
    syncConsentMode({ analytics, marketing })
    if (analytics !== 'granted') return
    if (isGa4Enabled()) loadGtagScript()
    initialiseFaroAdmin()
  }, [analytics, marketing])

  // 3. Track SPA navigations only while analytics is granted.
  useEffect(() => {
    const unsub = router.subscribe('onResolved', () => {
      if (analyticsRef.current !== 'granted') return
      const { pathname } = router.state.location
      trackPageView(pathname, document.title)
    })
    return unsub
  }, [router])

  return null
}
