// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ensureGtagStub,
  setConsentDefault,
  syncConsentMode,
} from '../../../features/consent/consent-mode'

function entries(): unknown[][] {
  return (window.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>))
}

beforeEach(() => {
  window.dataLayer = []
  window.gtag = undefined
})

describe('consent-mode bridge', () => {
  it('ensureGtagStub creates dataLayer + gtag once (idempotent)', () => {
    ensureGtagStub()
    const first = window.gtag
    ensureGtagStub()
    expect(window.gtag).toBe(first)
    expect(Array.isArray(window.dataLayer)).toBe(true)
  })

  it('setConsentDefault denies all controllable signals', () => {
    ensureGtagStub()
    setConsentDefault()
    const def = entries().find((e) => e[0] === 'consent' && e[1] === 'default')
    expect(def).toBeDefined()
    const params = def?.[2] as Record<string, unknown>
    expect(params.analytics_storage).toBe('denied')
    expect(params.ad_storage).toBe('denied')
    expect(params.ad_user_data).toBe('denied')
    expect(params.ad_personalization).toBe('denied')
    expect(params.security_storage).toBe('granted')
  })

  it('syncConsentMode maps granted analytics + denied marketing', () => {
    ensureGtagStub()
    syncConsentMode({ analytics: 'granted', marketing: 'denied' })
    const upd = entries().find((e) => e[0] === 'consent' && e[1] === 'update')
    const params = upd?.[2] as Record<string, unknown>
    expect(params.analytics_storage).toBe('granted')
    expect(params.ad_storage).toBe('denied')
    expect(params.ad_personalization).toBe('denied')
  })

  it('syncConsentMode treats undefined category as denied', () => {
    ensureGtagStub()
    syncConsentMode({ analytics: undefined, marketing: undefined })
    const upd = entries().find((e) => e[0] === 'consent' && e[1] === 'update')
    const params = upd?.[2] as Record<string, unknown>
    expect(params.analytics_storage).toBe('denied')
  })
})
