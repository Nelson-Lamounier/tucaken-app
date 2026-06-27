// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useConsentStore } from '../../../features/consent/store'
import { CONSENT_VERSION } from '../../../features/consent/types'

function resetStore() {
  localStorage.clear()
  useConsentStore.setState({
    analytics: undefined,
    marketing: undefined,
    decided: false,
    version: CONSENT_VERSION,
  })
}

describe('useConsentStore', () => {
  beforeEach(resetStore)

  it('starts undecided with no category set', () => {
    const s = useConsentStore.getState()
    expect(s.decided).toBe(false)
    expect(s.analytics).toBeUndefined()
    expect(s.marketing).toBeUndefined()
  })

  it('acceptAll grants every category and marks decided', () => {
    useConsentStore.getState().acceptAll()
    const s = useConsentStore.getState()
    expect(s.analytics).toBe('granted')
    expect(s.marketing).toBe('granted')
    expect(s.decided).toBe(true)
  })

  it('rejectAll denies every category and marks decided', () => {
    useConsentStore.getState().rejectAll()
    const s = useConsentStore.getState()
    expect(s.analytics).toBe('denied')
    expect(s.marketing).toBe('denied')
    expect(s.decided).toBe(true)
  })

  it('setCategory updates one category and marks decided', () => {
    useConsentStore.getState().setCategory('analytics', 'granted')
    const s = useConsentStore.getState()
    expect(s.analytics).toBe('granted')
    expect(s.marketing).toBeUndefined()
    expect(s.decided).toBe(true)
  })

  it('persists decided choices to localStorage under tucaken-consent', () => {
    useConsentStore.getState().acceptAll()
    const raw = localStorage.getItem('tucaken-consent')
    expect(raw).toBeTruthy()
    expect(raw).toContain('"analytics":"granted"')
  })
})
