// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  ensureGtagStub: vi.fn(),
  setConsentDefault: vi.fn(),
  syncConsentMode: vi.fn(),
  loadGtagScript: vi.fn(),
  trackPageView: vi.fn(),
  isGa4Enabled: vi.fn(() => true),
  initialiseFaroAdmin: vi.fn(),
}))

vi.mock('../../../features/consent/consent-mode', () => ({
  ensureGtagStub: mocks.ensureGtagStub,
  setConsentDefault: mocks.setConsentDefault,
  syncConsentMode: mocks.syncConsentMode,
}))
vi.mock('../../../lib/observability/ga4', () => ({
  loadGtagScript: mocks.loadGtagScript,
  trackPageView: mocks.trackPageView,
  isGa4Enabled: mocks.isGa4Enabled,
}))
vi.mock('../../../lib/observability/faro-admin', () => ({
  initialiseFaroAdmin: mocks.initialiseFaroAdmin,
}))
const router = vi.hoisted(() => ({
  cb: null as (() => void) | null,
  pathname: '/home',
}))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    subscribe: (_event: string, cb: () => void) => {
      router.cb = cb
      return () => { router.cb = null }
    },
    state: {
      location: {
        get pathname() { return router.pathname },
      },
    },
  }),
}))

import { ConsentEffects } from '../../../features/consent/ConsentEffects'
import { useConsentStore } from '../../../features/consent/store'
import { CONSENT_VERSION } from '../../../features/consent/types'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  router.cb = null
  router.pathname = '/home'
  useConsentStore.setState({
    analytics: undefined,
    marketing: undefined,
    decided: false,
    version: CONSENT_VERSION,
  })
})

describe('ConsentEffects', () => {
  it('bootstraps consent mode default on mount, no tags loaded', () => {
    render(<ConsentEffects />)
    expect(mocks.ensureGtagStub).toHaveBeenCalled()
    expect(mocks.setConsentDefault).toHaveBeenCalled()
    expect(mocks.loadGtagScript).not.toHaveBeenCalled()
    expect(mocks.initialiseFaroAdmin).not.toHaveBeenCalled()
  })

  it('loads GA4 + Faro once analytics is granted', () => {
    render(<ConsentEffects />)
    act(() => { useConsentStore.getState().acceptAll() })
    expect(mocks.syncConsentMode).toHaveBeenCalledWith({ analytics: 'granted', marketing: 'granted' })
    expect(mocks.loadGtagScript).toHaveBeenCalled()
    expect(mocks.initialiseFaroAdmin).toHaveBeenCalled()
  })

  it('does not load GA4/Faro when analytics denied', () => {
    render(<ConsentEffects />)
    act(() => { useConsentStore.getState().rejectAll() })
    expect(mocks.loadGtagScript).not.toHaveBeenCalled()
    expect(mocks.initialiseFaroAdmin).not.toHaveBeenCalled()
  })

  it('tracks page_view via router subscription when analytics is granted', () => {
    render(<ConsentEffects />)
    act(() => { useConsentStore.getState().acceptAll() })
    router.pathname = '/dashboard'
    act(() => { router.cb?.() })
    expect(mocks.trackPageView).toHaveBeenCalledWith('/dashboard', document.title)
  })

  it('does not track page_view when analytics is not granted', () => {
    render(<ConsentEffects />)
    // analytics remains undecided (default state)
    act(() => { router.cb?.() })
    expect(mocks.trackPageView).not.toHaveBeenCalled()
  })

  it('does not track page_view after analytics is rejected', () => {
    render(<ConsentEffects />)
    act(() => { useConsentStore.getState().rejectAll() })
    act(() => { router.cb?.() })
    expect(mocks.trackPageView).not.toHaveBeenCalled()
  })
})
