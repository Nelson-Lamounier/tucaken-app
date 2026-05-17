/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

import { ReviewStep } from '@/features/onboarding/components/steps/ReviewStep'

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ReviewStep', () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })

  it('renders the all-set finish screen when no importId is present', () => {
    renderWithClient(<ReviewStep importId={undefined} />)
    expect(screen.getByText(/you're all set/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /finish/i })).toBeTruthy()
  })

  it('navigates to /overview when Finish is clicked (no-id path)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    renderWithClient(<ReviewStep importId={undefined} />)
    await userEvent.click(screen.getByRole('button', { name: /finish/i }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/overview', replace: true })
  })

  it('calls onFinish instead of navigating when onFinish is provided', async () => {
    const onFinish = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    renderWithClient(<ReviewStep importId={undefined} onFinish={onFinish} />)
    await userEvent.click(screen.getByRole('button', { name: /finish/i }))
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
