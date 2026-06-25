/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockCreatePortalSessionFn = vi.fn()
vi.mock('@/server/billing', () => ({
  createPortalSessionFn: (...args: unknown[]) => mockCreatePortalSessionFn(...args),
}))

import { PortalButton } from '@/features/account/billing/PortalButton'

const PORTAL_URL = 'https://billing.stripe.test/session'

describe('PortalButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreatePortalSessionFn.mockResolvedValue({ url: PORTAL_URL })
  })

  it('opens the Stripe portal in a NEW tab and never navigates the current window', async () => {
    const fakeTab = { location: { href: '' }, opener: {} as unknown, close: vi.fn() }
    const openSpy = vi
      .spyOn(window, 'open')
      .mockReturnValue(fakeTab as unknown as Window)
    const assignSpy = vi
      .spyOn(window.location, 'assign')
      .mockImplementation(() => undefined)

    render(<PortalButton customerId="cus_1" />)
    await userEvent.click(screen.getByRole('button'))

    // Tab is opened synchronously (popup-blocker safe), then pointed at Stripe.
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank')
    expect(fakeTab.location.href).toBe(PORTAL_URL)
    // opener severed so the Stripe tab cannot script back into our window.
    expect(fakeTab.opener).toBeNull()
    // The current window must NOT be redirected.
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('falls back to a same-tab redirect when the popup is blocked (window.open returns null)', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const assignSpy = vi
      .spyOn(window.location, 'assign')
      .mockImplementation(() => undefined)

    render(<PortalButton customerId="cus_1" />)
    await userEvent.click(screen.getByRole('button'))

    expect(assignSpy).toHaveBeenCalledWith(PORTAL_URL)
  })
})
