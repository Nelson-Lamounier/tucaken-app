// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConsentPreferences } from '../../../features/consent/components/ConsentPreferences'
import { CookiePreferencesLink } from '../../../features/consent/components/CookiePreferencesLink'
import { usePreferencesUiStore } from '../../../features/consent/store-ui'
import { useConsentStore } from '../../../features/consent/store'
import { CONSENT_VERSION } from '../../../features/consent/types'

beforeEach(() => {
  cleanup()
  localStorage.clear()
  useConsentStore.setState({
    analytics: undefined, marketing: undefined, decided: false, version: CONSENT_VERSION,
  })
  usePreferencesUiStore.setState({ open: false })
})

describe('CookiePreferencesLink', () => {
  it('opens the preferences panel when clicked', () => {
    render(<CookiePreferencesLink />)
    fireEvent.click(screen.getByRole('button', { name: /cookie preferences/i }))
    expect(usePreferencesUiStore.getState().open).toBe(true)
  })
})

describe('ConsentPreferences', () => {
  it('is not rendered when closed', () => {
    const { container } = render(<ConsentPreferences />)
    expect(container.querySelector('[data-testid="consent-preferences"]')).toBeNull()
  })

  it('renders a locked Necessary row and a toggleable Analytics row when open', () => {
    usePreferencesUiStore.setState({ open: true })
    render(<ConsentPreferences />)
    const necessary = screen.getByLabelText(/necessary/i) as HTMLInputElement
    expect(necessary.disabled).toBe(true)
    expect(necessary.checked).toBe(true)
    expect(screen.getByLabelText(/analytics/i)).toBeTruthy()
    expect(screen.getByLabelText(/marketing/i)).toBeTruthy()
  })

  it('saving persists the chosen analytics value and closes', () => {
    usePreferencesUiStore.setState({ open: true })
    render(<ConsentPreferences />)
    fireEvent.click(screen.getByLabelText(/analytics/i))
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))
    expect(useConsentStore.getState().analytics).toBe('granted')
    expect(usePreferencesUiStore.getState().open).toBe(false)
  })
})
