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
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ subscribe: () => () => {} }),
}))

import { ConsentEffects } from '../../../features/consent/ConsentEffects'
import { useConsentStore } from '../../../features/consent/store'
import { CONSENT_VERSION } from '../../../features/consent/types'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
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
    expect(mocks.syncConsentMode).toHaveBeenCalled()
    expect(mocks.loadGtagScript).toHaveBeenCalled()
    expect(mocks.initialiseFaroAdmin).toHaveBeenCalled()
  })

  it('does not load GA4/Faro when analytics denied', () => {
    render(<ConsentEffects />)
    act(() => { useConsentStore.getState().rejectAll() })
    expect(mocks.loadGtagScript).not.toHaveBeenCalled()
    expect(mocks.initialiseFaroAdmin).not.toHaveBeenCalled()
  })
})
