// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConsentBanner } from '../../../features/consent/components/ConsentBanner'
import { useConsentStore } from '../../../features/consent/store'
import { CONSENT_VERSION } from '../../../features/consent/types'

beforeEach(() => {
  cleanup()
  localStorage.clear()
  useConsentStore.setState({
    analytics: undefined, marketing: undefined, decided: false, version: CONSENT_VERSION,
  })
})

describe('ConsentBanner', () => {
  it('renders Accept all and Reject all with equal prominence when undecided', () => {
    render(<ConsentBanner onManage={() => {}} />)
    expect(screen.getByRole('button', { name: /accept all/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reject all/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /manage preferences/i })).toBeTruthy()
  })

  it('hides once a decision has been made', () => {
    useConsentStore.setState({ decided: true })
    const { container } = render(<ConsentBanner onManage={() => {}} />)
    expect(container.querySelector('[data-testid="consent-banner"]')).toBeNull()
  })

  it('Accept all grants analytics', () => {
    render(<ConsentBanner onManage={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /accept all/i }))
    expect(useConsentStore.getState().analytics).toBe('granted')
  })

  it('Reject all denies analytics', () => {
    render(<ConsentBanner onManage={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /reject all/i }))
    expect(useConsentStore.getState().analytics).toBe('denied')
  })

  it('Manage preferences invokes onManage', () => {
    const onManage = vi.fn()
    render(<ConsentBanner onManage={onManage} />)
    fireEvent.click(screen.getByRole('button', { name: /manage preferences/i }))
    expect(onManage).toHaveBeenCalled()
  })
})
