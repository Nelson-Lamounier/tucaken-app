// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

function loadModule() {
  return import('../../../lib/observability/ga4')
}

beforeEach(() => {
  vi.resetModules()
  document.head.innerHTML = ''
  window.dataLayer = []
  ;(window as unknown as Record<string, unknown>).gtag = undefined
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ga4 loader', () => {
  it('isGa4Enabled is false when id is empty', async () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', '')
    const { isGa4Enabled } = await loadModule()
    expect(isGa4Enabled()).toBe(false)
  })

  it('isGa4Enabled is true when enabled and id present', async () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123')
    const { isGa4Enabled } = await loadModule()
    expect(isGa4Enabled()).toBe(true)
  })

  it('loadGtagScript injects exactly one gtag.js script (idempotent)', async () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123')
    const { loadGtagScript } = await loadModule()
    loadGtagScript()
    loadGtagScript()
    const scripts = document.head.querySelectorAll(
      'script[src*="googletagmanager.com/gtag/js"]',
    )
    expect(scripts.length).toBe(1)
    expect(scripts[0].getAttribute('src')).toContain('id=G-TEST123')
  })

  it('loadGtagScript is a no-op when disabled', async () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'false')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123')
    const { loadGtagScript } = await loadModule()
    loadGtagScript()
    expect(document.head.querySelectorAll('script').length).toBe(0)
  })

  it('trackPageView calls gtag with page_view event', async () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123')
    const { trackPageView } = await loadModule()
    const spy = vi.fn()
    window.gtag = spy
    trackPageView('/about', 'About')
    expect(spy).toHaveBeenCalledWith('event', 'page_view', {
      page_path: '/about',
      page_title: 'About',
    })
  })
})
