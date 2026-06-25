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
const mockCustomersRetrieve = vi.fn()
const mockPmRetrieve = vi.fn()
const mockPmList = vi.fn()
const mockInvoicesList = vi.fn()

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
  priceIdForTierFromConfig: vi.fn(),
  tierForPriceIdFromConfig: vi.fn(),
  stripe: () => ({
    billingPortal: {
      sessions: {
        create: mockPortalCreate,
      },
    },
    customers: { retrieve: mockCustomersRetrieve },
    paymentMethods: { retrieve: mockPmRetrieve, list: mockPmList },
    invoices: { list: mockInvoicesList },
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

const { getPaymentMethodFn } = await import('../../server/billing')

describe('getPaymentMethodFn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', email: 'user@example.com' })
  })

  it('returns null without calling Stripe when the user has no customer', async () => {
    mockApiFetch.mockResolvedValue({ plan: { stripeCustomerId: null } })
    const fn = getPaymentMethodFn as () => Promise<unknown>
    await expect(fn()).resolves.toBeNull()
    expect(mockCustomersRetrieve).not.toHaveBeenCalled()
  })

  it('maps the expanded default card to a PaymentMethodView', async () => {
    mockApiFetch.mockResolvedValue({ plan: { stripeCustomerId: 'cus_1' } })
    mockCustomersRetrieve.mockResolvedValue({
      invoice_settings: {
        default_payment_method: {
          card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2031, wallet: null },
        },
      },
    })
    const fn = getPaymentMethodFn as () => Promise<unknown>
    await expect(fn()).resolves.toEqual({
      brand: 'visa', last4: '4242', expMonth: 12, expYear: 2031, wallet: null,
    })
  })

  it('falls back to the first card payment method when no default is set', async () => {
    mockApiFetch.mockResolvedValue({ plan: { stripeCustomerId: 'cus_1' } })
    mockCustomersRetrieve.mockResolvedValue({ invoice_settings: { default_payment_method: null } })
    mockPmList.mockResolvedValue({
      data: [{ card: { brand: 'mastercard', last4: '5555', exp_month: 1, exp_year: 2030, wallet: { type: 'apple_pay' } } }],
    })
    const fn = getPaymentMethodFn as () => Promise<unknown>
    await expect(fn()).resolves.toEqual({
      brand: 'mastercard', last4: '5555', expMonth: 1, expYear: 2030, wallet: 'apple_pay',
    })
  })
})

const { getBillingDetailsFn } = await import('../../server/billing')

describe('getBillingDetailsFn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', email: 'user@example.com' })
  })

  it('returns empty details without calling Stripe when no customer', async () => {
    mockApiFetch.mockResolvedValue({ plan: { stripeCustomerId: null } })
    const fn = getBillingDetailsFn as () => Promise<unknown>
    await expect(fn()).resolves.toEqual({ email: null, taxIds: [], address: null })
    expect(mockCustomersRetrieve).not.toHaveBeenCalled()
  })

  it('maps customer email, tax IDs and address', async () => {
    mockApiFetch.mockResolvedValue({ plan: { stripeCustomerId: 'cus_1' } })
    mockCustomersRetrieve.mockResolvedValue({
      email: 'pay@acme.test',
      tax_ids: { data: [{ type: 'eu_vat', value: 'GB123' }] },
      address: { line1: '1 St', line2: null, city: 'Leeds', state: null, postal_code: 'LS1', country: 'GB' },
    })
    const fn = getBillingDetailsFn as () => Promise<unknown>
    await expect(fn()).resolves.toEqual({
      email: 'pay@acme.test',
      taxIds: [{ type: 'eu_vat', value: 'GB123' }],
      address: { line1: '1 St', line2: null, city: 'Leeds', state: null, postal: 'LS1', country: 'GB' },
    })
  })
})

const { getInvoicesFn } = await import('../../server/billing')

describe('getInvoicesFn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', email: 'user@example.com' })
  })

  it('returns [] without calling Stripe when the user has no customer', async () => {
    mockApiFetch.mockResolvedValue({ plan: { stripeCustomerId: null } })
    const fn = getInvoicesFn as () => Promise<unknown[]>
    await expect(fn()).resolves.toEqual([])
    expect(mockInvoicesList).not.toHaveBeenCalled()
  })

  it('maps Stripe invoices to InvoiceView in major units', async () => {
    mockApiFetch.mockResolvedValue({ plan: { stripeCustomerId: 'cus_1' } })
    mockInvoicesList.mockResolvedValue({
      data: [{
        id: 'in_1', number: 'TUC-001', created: 1_700_000_000,
        amount_paid: 1500, amount_due: 1500, currency: 'usd', status: 'paid',
        invoice_pdf: 'https://stripe/pdf', hosted_invoice_url: 'https://stripe/hosted',
      }],
    })
    const fn = getInvoicesFn as () => Promise<unknown[]>
    const result = await fn()
    expect(result).toEqual([{
      id: 'in_1', number: 'TUC-001',
      date: new Date(1_700_000_000 * 1000).toISOString(),
      amount: 15, currency: 'usd', status: 'paid',
      invoicePdf: 'https://stripe/pdf', hostedUrl: 'https://stripe/hosted',
    }])
    expect(mockInvoicesList).toHaveBeenCalledWith({ customer: 'cus_1', limit: 12 })
  })
})
