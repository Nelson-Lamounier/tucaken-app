/**
 * @format
 * Self-healing customer link tests for the Stripe webhook handler.
 *
 * The user<->Stripe-customer link must not depend solely on the best-effort
 * pre-checkout persist. When a webhook event carries the user identity
 * (client_reference_id or subscription/session metadata.userId), the handler
 * links the customer idempotently before patching subscription state, so a
 * paying user can never end up with stripe_customer_id = null.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockInternalApiFetch = vi.fn()
const mockConstructEvent = vi.fn()
const mockTierForPriceId = vi.fn()

vi.mock('../../server/_internal-api-client', () => ({
  internalApiFetch: (...a: unknown[]) => mockInternalApiFetch(...a),
}))

vi.mock('../../server/stripe', () => ({
  stripe: () => ({
    webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) },
  }),
  tierForPriceId: (...a: unknown[]) => mockTierForPriceId(...a),
}))

vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { handleStripeWebhook } = await import('../../server/stripe-webhook')

const CUSTOMERS = '/api/internal/billing/customers'
const SUBSCRIPTION = '/api/internal/billing/subscription'
const PENDING = '/api/internal/billing/pending'

function callsTo(path: string) {
  return mockInternalApiFetch.mock.calls.filter((c) => c[0] === path)
}

function conflictError() {
  return Object.assign(new Error('conflict'), { status: 409 })
}

describe('stripe webhook — self-healing customer link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    mockInternalApiFetch.mockResolvedValue({ ok: true })
  })

  it('links the customer to the user before patching on an authenticated checkout', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          client_reference_id: 'user-1',
          customer: 'cus_1',
          subscription: 'sub_1',
          payment_status: 'paid',
          status: 'complete',
          customer_details: { email: 'u@e.com' },
          metadata: { tier: 'pro', userId: 'user-1' },
        },
      },
    })

    await handleStripeWebhook({ rawBody: '{}', signature: 'sig' })

    expect(mockInternalApiFetch).toHaveBeenCalledWith(
      CUSTOMERS,
      expect.objectContaining({
        method: 'POST',
        json: { userId: 'user-1', customerId: 'cus_1' },
      }),
    )
    expect(mockInternalApiFetch).toHaveBeenCalledWith(
      SUBSCRIPTION,
      expect.objectContaining({
        method: 'PATCH',
        json: expect.objectContaining({
          customerId: 'cus_1',
          plan: 'pro',
          stripeSubscriptionId: 'sub_1',
          subscriptionStatus: 'active',
        }),
      }),
    )
  })

  it('links the customer when a subscription event carries metadata.userId', async () => {
    mockTierForPriceId.mockReturnValue('pro')
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          items: { data: [{ price: { id: 'price_1' }, current_period_end: 1_800_000_000 }] },
          cancel_at_period_end: false,
          metadata: { userId: 'user-1' },
        },
      },
    })

    await handleStripeWebhook({ rawBody: '{}', signature: 'sig' })

    expect(mockInternalApiFetch).toHaveBeenCalledWith(
      CUSTOMERS,
      expect.objectContaining({
        method: 'POST',
        json: { userId: 'user-1', customerId: 'cus_1' },
      }),
    )
    expect(callsTo(SUBSCRIPTION)).toHaveLength(1)
  })

  it('does NOT patch the subscription when the customer is already linked to a different user (409)', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          client_reference_id: 'user-1',
          customer: 'cus_1',
          subscription: 'sub_1',
          payment_status: 'paid',
          status: 'complete',
          metadata: { tier: 'pro', userId: 'user-1' },
        },
      },
    })
    mockInternalApiFetch.mockImplementation((path: string) => {
      if (path === CUSTOMERS) return Promise.reject(conflictError())
      return Promise.resolve({ ok: true })
    })

    await handleStripeWebhook({ rawBody: '{}', signature: 'sig' })

    expect(callsTo(SUBSCRIPTION)).toHaveLength(0)
  })

  it('rethrows a transient link failure so Stripe retries the event', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          client_reference_id: 'user-1',
          customer: 'cus_1',
          subscription: 'sub_1',
          payment_status: 'paid',
          status: 'complete',
          metadata: { tier: 'pro', userId: 'user-1' },
        },
      },
    })
    mockInternalApiFetch.mockImplementation((path: string) => {
      if (path === CUSTOMERS) return Promise.reject(Object.assign(new Error('boom'), { status: 503 }))
      return Promise.resolve({ ok: true })
    })

    await expect(
      handleStripeWebhook({ rawBody: '{}', signature: 'sig' }),
    ).rejects.toThrow()
  })

  it('parks a guest checkout as pending without attempting a customer link', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_g',
          client_reference_id: null,
          customer: 'cus_g',
          subscription: 'sub_g',
          payment_status: 'paid',
          status: 'complete',
          customer_details: { email: 'g@e.com' },
          metadata: { tier: 'pro' },
        },
      },
    })

    await handleStripeWebhook({ rawBody: '{}', signature: 'sig' })

    expect(callsTo(PENDING)).toHaveLength(1)
    expect(callsTo(CUSTOMERS)).toHaveLength(0)
  })
})
