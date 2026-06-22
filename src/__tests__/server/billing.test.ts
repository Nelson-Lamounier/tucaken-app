/**
 * @format
 * Security-focused tests for billing server functions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain: Record<string, unknown> = {}
    chain.inputValidator = () => chain
    chain.handler = (fn: unknown) => fn
    return chain
  },
}))

const mockRequireAuth = vi.fn()
const mockApiFetch = vi.fn()
const mockPortalCreate = vi.fn()

vi.mock('../../server/auth-guard', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  tryAuth: vi.fn(),
}))

vi.mock('../../server/_api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

vi.mock('../../server/_internal-api-client', () => ({
  internalApiFetch: vi.fn(),
}))

vi.mock('../../server/stripe', () => ({
  appOrigin: () => 'https://tucaken.io',
  priceIdForTier: vi.fn(),
  tierForPriceId: vi.fn(),
  stripe: () => ({
    billingPortal: {
      sessions: {
        create: mockPortalCreate,
      },
    },
  }),
}))

vi.mock('@/lib/observability/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

const { createPortalSessionFn } = await import('../../server/billing')

type PortalHandler = (input: {
  data: { customerId: string; returnPath?: string }
}) => Promise<{ url: string }>

describe('createPortalSessionFn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', email: 'user@example.com' })
    mockApiFetch.mockResolvedValue({ plan: { stripeCustomerId: 'cus_owner' } })
    mockPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.test/session' })
  })

  it('requires an authenticated user before creating a Stripe Billing Portal session', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Authentication required'))

    const handler = createPortalSessionFn as PortalHandler

    await expect(handler({ data: { customerId: 'cus_owner', returnPath: '/billing' } }))
      .rejects
      .toThrow(/Authentication required/)
    expect(mockPortalCreate).not.toHaveBeenCalled()
  })

  it('rejects a portal session for a Stripe customer that is not owned by the current user', async () => {
    const handler = createPortalSessionFn as PortalHandler

    await expect(handler({ data: { customerId: 'cus_victim', returnPath: '/billing' } }))
      .rejects
      .toThrow(/does not belong/i)
    expect(mockPortalCreate).not.toHaveBeenCalled()
  })

  it('creates a portal session only for the authenticated user owned customer', async () => {
    const handler = createPortalSessionFn as PortalHandler

    const result = await handler({ data: { customerId: 'cus_owner', returnPath: '/billing' } })

    expect(result.url).toBe('https://billing.stripe.test/session')
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_owner',
      return_url: 'https://tucaken.io/billing',
    })
  })

  it('rejects protocol-relative return paths before sending anything to Stripe', async () => {
    const handler = createPortalSessionFn as PortalHandler

    await expect(handler({ data: { customerId: 'cus_owner', returnPath: '//evil.example' } }))
      .rejects
      .toThrow(/return path/i)
    expect(mockPortalCreate).not.toHaveBeenCalled()
  })
})
