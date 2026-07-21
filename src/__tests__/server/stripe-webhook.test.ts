/**
 * @format
 * Unit tests for the Stripe webhook idempotency guard.
 *
 * The handler claims each event id via admin-api's
 * POST /api/internal/billing/webhook-seen before processing:
 *   - duplicate delivery → skip (no billing mutation)
 *   - first delivery     → process normally
 *   - dedupe call fails  → FAIL OPEN and process anyway (conditional writes
 *                          remain the safety net; dropping a real billing
 *                          event is worse than a rare reprocess)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const constructEventMock = vi.fn()
vi.mock('@/server/stripe', () => ({
  stripe: () => ({ webhooks: { constructEvent: constructEventMock } }),
  tierForPriceId: vi.fn(() => 'pro'),
}))

const internalApiFetchMock = vi.fn()
vi.mock('@/server/_internal-api-client', () => ({
  internalApiFetch: (...args: unknown[]) => internalApiFetchMock(...args),
}))

vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { handleStripeWebhook } from '@/server/stripe-webhook'

const CTX = { rawBody: '{}', signature: 'sig' }

function invoicePaidEvent() {
  return {
    id: 'evt_test_1',
    type: 'invoice.paid',
    data: { object: { customer: 'cus_123' } },
  }
}

/** Calls internalApiFetch received for a given path prefix. */
function callsTo(path: string) {
  return internalApiFetchMock.mock.calls.filter(
    (c) => typeof c[0] === 'string' && (c[0] as string).startsWith(path),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  constructEventMock.mockReturnValue(invoicePaidEvent())
})

describe('handleStripeWebhook — idempotency', () => {
  it('skips processing when the event id was already seen', async () => {
    internalApiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/internal/billing/webhook-seen') {
        return { alreadyProcessed: true }
      }
      return { updated: true }
    })

    const res = await handleStripeWebhook(CTX)

    expect(res).toEqual({ received: true })
    expect(callsTo('/api/internal/billing/webhook-seen')).toHaveLength(1)
    expect(callsTo('/api/internal/billing/subscription')).toHaveLength(0)
  })

  it('processes a first-seen event normally', async () => {
    internalApiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/internal/billing/webhook-seen') {
        return { alreadyProcessed: false }
      }
      return { updated: true }
    })

    await handleStripeWebhook(CTX)

    expect(callsTo('/api/internal/billing/subscription')).toHaveLength(1)
  })

  it('fails open and processes when the dedupe call errors', async () => {
    internalApiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/internal/billing/webhook-seen') {
        throw new Error('dedupe table unavailable')
      }
      return { updated: true }
    })

    const res = await handleStripeWebhook(CTX)

    expect(res).toEqual({ received: true })
    expect(callsTo('/api/internal/billing/subscription')).toHaveLength(1)
  })
})
