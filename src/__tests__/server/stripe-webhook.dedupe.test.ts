/**
 * @format
 * Webhook idempotency tests: a duplicate Stripe delivery (same event id) is
 * claimed via admin-api and skipped; a failed dedupe check fails open so the
 * event is still processed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockInternalApiFetch = vi.fn()
const mockApiFetch = vi.fn()
const mockConstructEvent = vi.fn()
const mockTierForPriceIdFromConfig = vi.fn()

vi.mock('../../server/_internal-api-client', () => ({
  internalApiFetch: (...a: unknown[]) => mockInternalApiFetch(...a),
}))
vi.mock('../../server/_api-client', () => ({
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
}))
vi.mock('../../server/stripe', () => ({
  stripe: () => ({
    webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) },
  }),
  tierForPriceIdFromConfig: (...a: unknown[]) => mockTierForPriceIdFromConfig(...a),
}))
vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { handleStripeWebhook } = await import('../../server/stripe-webhook')

const WEBHOOK_SEEN = '/api/internal/billing/webhook-seen'
const SUBSCRIPTION = '/api/internal/billing/subscription'

function callsTo(path: string) {
  return mockInternalApiFetch.mock.calls.filter((c) => c[0] === path)
}

function subscriptionEvent() {
  return {
    id: 'evt_dupe_1',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro' } }] },
        metadata: { userId: 'user-1' },
      },
    },
  }
}

describe('stripe webhook — idempotency / dedupe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    mockConstructEvent.mockReturnValue(subscriptionEvent())
  })

  it('skips processing when the event id was already seen', async () => {
    mockInternalApiFetch.mockImplementation((path: string) => {
      if (path === WEBHOOK_SEEN) return Promise.resolve({ alreadyProcessed: true })
      return Promise.resolve({})
    })

    const res = await handleStripeWebhook({ rawBody: '{}', signature: 'sig' })

    expect(res).toEqual({ received: true })
    expect(callsTo(WEBHOOK_SEEN)).toHaveLength(1)
    // The event was a duplicate → no subscription sync happened.
    expect(callsTo(SUBSCRIPTION)).toHaveLength(0)
  })

  it('processes the event when the dedupe check fails (fail-open)', async () => {
    mockInternalApiFetch.mockImplementation((path: string) => {
      if (path === WEBHOOK_SEEN) return Promise.reject(new Error('table missing'))
      return Promise.resolve({ updated: true })
    })
    // onSubscriptionChanged fetches the tier config (then .catch); stub it.
    mockApiFetch.mockResolvedValue(null)
    mockTierForPriceIdFromConfig.mockReturnValue('pro')

    const res = await handleStripeWebhook({ rawBody: '{}', signature: 'sig' })

    expect(res).toEqual({ received: true })
    // Fail-open: the subscription sync still ran despite the dedupe error.
    expect(callsTo(SUBSCRIPTION).length).toBeGreaterThan(0)
  })
})
