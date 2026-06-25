# Stripe-owned Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Stripe the sole source of card / invoice / billing-detail data, fetched live and never stored, and delete the inline raw-card form that breaks PCI SAQ-A.

**Architecture:** Three new GET `createServerFn`s read live Stripe data, resolving the customer server-side from the authenticated user's `/me` projection (never from client input). Three `useQuery` hooks feed read-only UI sections; all edits route to the existing Stripe Customer Portal. The `Billing` model is then stripped of the fields that implied local persistence.

**Tech Stack:** TanStack Start (`createServerFn`), TanStack Query, Stripe Node SDK (pinned `2026-04-22.dahlia`), Zod, Vitest, Tailwind v4.

## Global Constraints

- Package manager: **Yarn 4 only** (`yarn add`, `yarn test`, `yarn typecheck`, `yarn lint`). Never npm/pnpm/npx.
- Server-only Stripe access stays in `src/server/**`; never import `src/server/stripe.ts` from a `.tsx` client component.
- Every server boundary validates input with Zod; these fns take **no** client input (no `customerId` param) — customer resolved server-side.
- SonarLint rules: no nested ternaries (`S3358`), guard clauses / early returns, no redundant casts / `as any` (`S4325`), `catch (e: unknown)`, optional chaining over `&&` (`S6582`), `Number.parseInt`/`Number.isNaN` (`S7773`), `Set.has()` for allow-lists (`S7776`), stable React keys (`S6479`), no `console.*` (use Pino logger), cyclomatic complexity ≤ 10.
- New/edited components default to `rounded-md`; render correctly in dark mode; use existing palette tokens, no arbitrary hex.
- Prose / copy in **English (UK)**, ASCII only; product name **Tucaken**.
- Before writing any Stripe SDK call, verify method names + `expand` paths against the pinned API version via **context7 MCP** (`resolve-library-id` → `query-docs` for `stripe`).
- Before claiming done: `yarn typecheck && yarn lint && yarn test` all green.

---

### Task 1: `getPaymentMethodFn` + shared customer resolver

**Files:**
- Modify: `src/features/account/types.ts` (add `PaymentMethodView`)
- Modify: `src/lib/api/query-keys.ts` (add `adminKeys.billing`)
- Modify: `src/server/billing.ts` (add `requireCustomerId`, `getPaymentMethodFn`)
- Test: `src/__tests__/server/billing.test.ts` (extend)

**Interfaces:**
- Consumes: `requireAuth` (`./auth-guard`), `apiFetch` (`./_api-client`), `stripe()` (`./stripe`).
- Produces:
  - `requireCustomerId(): Promise<string | null>` (private to `billing.ts`)
  - `getPaymentMethodFn(): Promise<PaymentMethodView | null>`
  - `PaymentMethodView = { brand: string; last4: string; expMonth: number; expYear: number; wallet: string | null }`
  - `adminKeys.billing.paymentMethod(): readonly ['admin','billing','payment-method']`

- [ ] **Step 1: Add the `PaymentMethodView` type**

In `src/features/account/types.ts`, under the `// ---- Billing ----` block, **add** (do not yet remove the existing `PaymentMethod`):

```ts
/** Read-only card view fetched live from Stripe — never persisted. */
export interface PaymentMethodView {
  brand: string
  last4: string
  expMonth: number
  expYear: number
  wallet: string | null
}
```

- [ ] **Step 2: Add the `billing` query-key group**

In `src/lib/api/query-keys.ts`, inside the `adminKeys` object (next to the `me` group), add:

```ts
  /** Live Stripe billing reads (payment method, invoices, customer details) */
  billing: {
    all: ['admin', 'billing'] as const,
    paymentMethod: () => ['admin', 'billing', 'payment-method'] as const,
    invoices: () => ['admin', 'billing', 'invoices'] as const,
    details: () => ['admin', 'billing', 'details'] as const,
  },
```

- [ ] **Step 3: Write the failing test**

In `src/__tests__/server/billing.test.ts`, extend the `stripe()` mock so its returned object also exposes `customers.retrieve`, `paymentMethods.retrieve`, `paymentMethods.list`, and `invoices.list`. Add module-level mock fns near the existing ones:

```ts
const mockCustomersRetrieve = vi.fn()
const mockPmRetrieve = vi.fn()
const mockPmList = vi.fn()
const mockInvoicesList = vi.fn()
```

Update the `vi.mock('../../server/stripe', ...)` `stripe: () => ({ ... })` factory to include:

```ts
    customers: { retrieve: mockCustomersRetrieve },
    paymentMethods: { retrieve: mockPmRetrieve, list: mockPmList },
    invoices: { list: mockInvoicesList },
```

Then add a new describe block at the end of the file:

```ts
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `yarn test src/__tests__/server/billing.test.ts`
Expected: FAIL — `getPaymentMethodFn` is not exported.

- [ ] **Step 5: Verify Stripe API shapes via context7**

Use context7 MCP to confirm, for API version `2026-04-22.dahlia`: `customers.retrieve` `expand: ['invoice_settings.default_payment_method']`, `paymentMethods.list({ customer, type: 'card' })`, and the `PaymentMethod.card.wallet.type` field. Adjust the implementation in Step 6 if the shapes differ.

- [ ] **Step 6: Implement `requireCustomerId` + `getPaymentMethodFn`**

In `src/server/billing.ts`, add after the existing imports (note: `requireAuth` is already imported) and below the `ensureStripeCustomerForUser` block:

```ts
import type { PaymentMethodView } from '@/features/account/types'

/**
 * Resolves the authenticated user's Stripe customer ID server-side via the
 * user-JWT-protected /me endpoint. Returns null for free-tier users with no
 * customer yet. Never trusts a client-supplied customerId (prevents IDOR).
 */
async function requireCustomerId(): Promise<string | null> {
  const me = await apiFetch<{ plan: { stripeCustomerId: string | null } }>(
    '/me',
    { pathTemplate: '/me' },
  )
  return me.plan.stripeCustomerId
}

/**
 * Live read of the customer's default card. Resolution order:
 *   invoice_settings.default_payment_method → first card on file → null.
 * Card data is never persisted — this is fetched per request.
 */
export const getPaymentMethodFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PaymentMethodView | null> => {
    await requireAuth()
    const customerId = await requireCustomerId()
    if (!customerId) return null

    const customer = await stripe().customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    })
    if ('deleted' in customer && customer.deleted) return null

    let pm = customer.invoice_settings?.default_payment_method ?? null
    if (typeof pm === 'string') {
      pm = await stripe().paymentMethods.retrieve(pm)
    }
    if (!pm) {
      const list = await stripe().paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1,
      })
      pm = list.data[0] ?? null
    }
    if (!pm?.card) return null

    return {
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
      wallet: pm.card.wallet?.type ?? null,
    }
  },
)
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `yarn test src/__tests__/server/billing.test.ts`
Expected: PASS (existing portal tests + 3 new payment-method tests).

- [ ] **Step 8: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors. (If the `customers.retrieve` union needs narrowing beyond `'deleted' in customer`, keep the load-bearing guard — do not strip it.)

- [ ] **Step 9: Commit**

```bash
git add src/server/billing.ts src/features/account/types.ts src/lib/api/query-keys.ts src/__tests__/server/billing.test.ts
git commit -m "feat(billing): add getPaymentMethodFn live Stripe read"
```

---

### Task 2: `getInvoicesFn`

**Files:**
- Modify: `src/features/account/types.ts` (add `InvoiceView`)
- Modify: `src/server/billing.ts` (add `getInvoicesFn` + `toInvoiceView`)
- Test: `src/__tests__/server/billing.test.ts` (extend)

**Interfaces:**
- Consumes: `requireCustomerId`, `requireAuth`, `stripe()` (from Task 1).
- Produces:
  - `getInvoicesFn(): Promise<InvoiceView[]>`
  - `InvoiceView = { id: string; number: string | null; date: string; amount: number; currency: string; status: 'paid'|'open'|'void'|'uncollectible'|'draft'; invoicePdf: string | null; hostedUrl: string | null }`

- [ ] **Step 1: Add the `InvoiceView` type**

In `src/features/account/types.ts`, add (keep the existing `Invoice` for now):

```ts
/** Read-only invoice view fetched live from Stripe. */
export interface InvoiceView {
  id: string
  number: string | null
  date: string                // ISO
  amount: number              // major units
  currency: string
  status: 'paid' | 'open' | 'void' | 'uncollectible' | 'draft'
  invoicePdf: string | null
  hostedUrl: string | null
}
```

- [ ] **Step 2: Write the failing test**

Append to `src/__tests__/server/billing.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn test src/__tests__/server/billing.test.ts`
Expected: FAIL — `getInvoicesFn` not exported.

- [ ] **Step 4: Verify Stripe shapes via context7**

Confirm `invoices.list({ customer, limit })` return fields `number`, `created`, `amount_paid`, `amount_due`, `currency`, `status`, `invoice_pdf`, `hosted_invoice_url` for the pinned API version.

- [ ] **Step 5: Implement `getInvoicesFn`**

In `src/server/billing.ts`, add (extend the `import type` from Task 1 to include `InvoiceView`):

```ts
import type { PaymentMethodView, InvoiceView } from '@/features/account/types'

function toInvoiceView(inv: import('stripe').default.Invoice): InvoiceView {
  const cents = inv.amount_paid || inv.amount_due
  return {
    id: inv.id ?? '',
    number: inv.number ?? null,
    date: new Date(inv.created * 1000).toISOString(),
    amount: cents / 100,
    currency: inv.currency,
    status: inv.status ?? 'draft',
    invoicePdf: inv.invoice_pdf ?? null,
    hostedUrl: inv.hosted_invoice_url ?? null,
  }
}

/** Live read of the most recent 12 invoices for the user's customer. */
export const getInvoicesFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<InvoiceView[]> => {
    await requireAuth()
    const customerId = await requireCustomerId()
    if (!customerId) return []
    const list = await stripe().invoices.list({ customer: customerId, limit: 12 })
    return list.data.map(toInvoiceView)
  },
)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test src/__tests__/server/billing.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/billing.ts src/features/account/types.ts src/__tests__/server/billing.test.ts
git commit -m "feat(billing): add getInvoicesFn live Stripe read"
```

---

### Task 3: `getBillingDetailsFn`

**Files:**
- Modify: `src/features/account/types.ts` (add `BillingDetailsView`)
- Modify: `src/server/billing.ts` (add `getBillingDetailsFn`)
- Test: `src/__tests__/server/billing.test.ts` (extend)

**Interfaces:**
- Consumes: `requireCustomerId`, `requireAuth`, `stripe()`.
- Produces:
  - `getBillingDetailsFn(): Promise<BillingDetailsView>`
  - `BillingDetailsView = { email: string | null; taxIds: { type: string; value: string }[]; address: { line1: string|null; line2: string|null; city: string|null; state: string|null; postal: string|null; country: string|null } | null }`

- [ ] **Step 1: Add the `BillingDetailsView` type**

In `src/features/account/types.ts`, add:

```ts
/** Read-only billing details fetched live from the Stripe customer. */
export interface BillingDetailsView {
  email: string | null
  taxIds: { type: string; value: string }[]
  address: {
    line1: string | null
    line2: string | null
    city: string | null
    state: string | null
    postal: string | null
    country: string | null
  } | null
}
```

- [ ] **Step 2: Write the failing test**

Append to `src/__tests__/server/billing.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn test src/__tests__/server/billing.test.ts`
Expected: FAIL — `getBillingDetailsFn` not exported.

- [ ] **Step 4: Verify Stripe shapes via context7**

Confirm `customers.retrieve(id, { expand: ['tax_ids'] })` exposes `email`, `tax_ids.data[].type/value`, and `address.{line1,line2,city,state,postal_code,country}`.

- [ ] **Step 5: Implement `getBillingDetailsFn`**

In `src/server/billing.ts`, extend the `import type` to add `BillingDetailsView`, then add:

```ts
const EMPTY_DETAILS: BillingDetailsView = { email: null, taxIds: [], address: null }

/** Live read of customer billing details (read-only; edits go via Portal). */
export const getBillingDetailsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BillingDetailsView> => {
    await requireAuth()
    const customerId = await requireCustomerId()
    if (!customerId) return EMPTY_DETAILS

    const customer = await stripe().customers.retrieve(customerId, {
      expand: ['tax_ids'],
    })
    if ('deleted' in customer && customer.deleted) return EMPTY_DETAILS

    const taxIds = (customer.tax_ids?.data ?? []).map((t) => ({
      type: t.type,
      value: t.value ?? '',
    }))
    const a = customer.address
    return {
      email: customer.email,
      taxIds,
      address: a
        ? {
            line1: a.line1,
            line2: a.line2,
            city: a.city,
            state: a.state,
            postal: a.postal_code,
            country: a.country,
          }
        : null,
    }
  },
)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test src/__tests__/server/billing.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/billing.ts src/features/account/types.ts src/__tests__/server/billing.test.ts
git commit -m "feat(billing): add getBillingDetailsFn live Stripe read"
```

---

### Task 4: Read hooks

**Files:**
- Create: `src/features/account/hooks/use-payment-method.ts`
- Create: `src/features/account/hooks/use-invoices.ts`
- Create: `src/features/account/hooks/use-billing-details.ts`

**Interfaces:**
- Consumes: `getPaymentMethodFn`, `getInvoicesFn`, `getBillingDetailsFn`, `adminKeys.billing.*`.
- Produces:
  - `usePaymentMethod(): { paymentMethod: PaymentMethodView | null; isLoading: boolean }`
  - `useInvoices(): { invoices: InvoiceView[]; isLoading: boolean }`
  - `useBillingDetails(): { details: BillingDetailsView | null; isLoading: boolean }`

- [ ] **Step 1: Create `use-payment-method.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getPaymentMethodFn } from '@/server/billing'

export function usePaymentMethod() {
  const { data, isLoading } = useQuery({
    queryKey: adminKeys.billing.paymentMethod(),
    queryFn: getPaymentMethodFn,
  })
  return { paymentMethod: data ?? null, isLoading }
}
```

- [ ] **Step 2: Create `use-invoices.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getInvoicesFn } from '@/server/billing'

export function useInvoices() {
  const { data, isLoading } = useQuery({
    queryKey: adminKeys.billing.invoices(),
    queryFn: getInvoicesFn,
  })
  return { invoices: data ?? [], isLoading }
}
```

- [ ] **Step 3: Create `use-billing-details.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getBillingDetailsFn } from '@/server/billing'

export function useBillingDetails() {
  const { data, isLoading } = useQuery({
    queryKey: adminKeys.billing.details(),
    queryFn: getBillingDetailsFn,
  })
  return { details: data ?? null, isLoading }
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors (hooks compile against the Task 1–3 server fns).

- [ ] **Step 5: Commit**

```bash
git add src/features/account/hooks/use-payment-method.ts src/features/account/hooks/use-invoices.ts src/features/account/hooks/use-billing-details.ts
git commit -m "feat(billing): add live Stripe read hooks"
```

---

### Task 5: PaymentSection — read-only, delete the card/CVC form

**Files:**
- Modify (full rewrite): `src/features/account/billing/PaymentSection.tsx`

**Interfaces:**
- Consumes: `usePaymentMethod` (Task 4), `PaymentMethodView`, `Billing` (for `stripeCustomerId`), `PortalButton`, `Card` primitive.
- Produces: `PaymentSection({ billing }: { billing: Billing })` — note `onUpdateBilling` prop is removed.

- [ ] **Step 1: Replace the whole file**

Overwrite `src/features/account/billing/PaymentSection.tsx` with:

```tsx
// src/features/account/billing/PaymentSection.tsx
//
// Read-only payment method. Card details are fetched live from Stripe and
// never persisted. All edits route to the Stripe Customer Portal — we never
// see or store a raw card number.

import type { Billing, PaymentMethodView } from '../types'
import { Card } from '../components/primitives'
import { PortalButton } from './PortalButton'
import { usePaymentMethod } from '../hooks/use-payment-method'

interface Props {
  billing: Billing
}

export function PaymentSection({ billing }: Props) {
  const { paymentMethod, isLoading } = usePaymentMethod()

  if (isLoading) {
    return (
      <Card>
        <div className="h-12 w-full animate-pulse rounded-md bg-white/[0.04]" />
      </Card>
    )
  }

  if (!paymentMethod) {
    return (
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-400">
            No card on file. Subscribe to a paid plan to add a payment method.
          </p>
          {billing.stripeCustomerId && (
            <PortalButton customerId={billing.stripeCustomerId} returnPath="/billing">
              Add card
            </PortalButton>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <CardArt brand={paymentMethod.brand} last4={paymentMethod.last4} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-100">
                {paymentMethod.brand} ending in {paymentMethod.last4}
              </span>
              {isExpiringSoon(paymentMethod) && (
                <span className="whitespace-nowrap rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-200 ring-1 ring-amber-400/30">
                  Expiring soon
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Expires {String(paymentMethod.expMonth).padStart(2, '0')}/
              {String(paymentMethod.expYear).slice(-2)} · Default for invoices
            </p>
          </div>
        </div>
        <PortalButton customerId={billing.stripeCustomerId} returnPath="/billing">
          Update card
        </PortalButton>
      </div>
    </Card>
  )
}

function isExpiringSoon(pm: PaymentMethodView): boolean {
  const now = new Date()
  const exp = new Date(pm.expYear, pm.expMonth - 1, 1)
  const monthsLeft =
    (exp.getFullYear() - now.getFullYear()) * 12 +
    (exp.getMonth() - now.getMonth())
  return monthsLeft <= 2
}

function CardArt({ brand, last4 }: { brand: string; last4: string }) {
  return (
    <div className="relative h-12 w-20 overflow-hidden rounded-md bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 ring-1 ring-white/10">
      <div className="absolute left-1.5 top-1.5 size-3 rounded-sm bg-amber-300/80" />
      <div className="absolute bottom-1 right-2 font-mono text-[8px] font-semibold tracking-wider text-zinc-300">
        {brand.toUpperCase()}
      </div>
      <div className="absolute bottom-3 left-1.5 font-mono text-[8px] tabular-nums text-zinc-400">
        •{last4}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `yarn typecheck`
Expected: error only in `BillingPage.tsx` (still passes `onUpdateBilling` to `PaymentSection`). That is fixed in Task 8; if you are running tasks in order, proceed — lint/typecheck fully green is asserted at Task 8. To keep this task self-contained, also remove the `onUpdateBilling` prop from the `<PaymentSection ... />` call in `BillingPage.tsx` now (single-line edit):

In `src/features/account/billing/BillingPage.tsx`, change:

```tsx
        <PaymentSection billing={billing} onUpdateBilling={onUpdateBilling} />
```
to:
```tsx
        <PaymentSection billing={billing} />
```

- [ ] **Step 3: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors. (`onUpdateBilling` is still consumed by Details/Plan/Cancel sections, so `BillingPageProps` is untouched here.)

- [ ] **Step 4: Verify no raw card inputs remain**

Run: `rg -n "CVC|Card number|expMonth=\{|setDraft" src/features/account/billing/PaymentSection.tsx`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/features/account/billing/PaymentSection.tsx src/features/account/billing/BillingPage.tsx
git commit -m "feat(billing): payment method read-only via Stripe, delete raw card form"
```

---

### Task 6: DetailsSection — read-only from Stripe

**Files:**
- Modify (full rewrite): `src/features/account/billing/DetailsSection.tsx`
- Modify: `src/features/account/billing/BillingPage.tsx` (drop `onUpdateBilling` from `<DetailsSection>`)

**Interfaces:**
- Consumes: `useBillingDetails` (Task 4), `Billing` (for `stripeCustomerId`), `PortalButton`, `Card`.
- Produces: `DetailsSection({ billing }: { billing: Billing })`.

- [ ] **Step 1: Replace the whole file**

Overwrite `src/features/account/billing/DetailsSection.tsx` with:

```tsx
// src/features/account/billing/DetailsSection.tsx
//
// Read-only billing details (email, tax IDs, address) fetched live from the
// Stripe customer. Edits route to the Stripe Customer Portal — we do not
// persist these locally.

import type { ReactNode } from 'react'
import type { Billing } from '../types'
import { Card } from '../components/primitives'
import { PortalButton } from './PortalButton'
import { useBillingDetails } from '../hooks/use-billing-details'

interface Props {
  billing: Billing
}

export function DetailsSection({ billing }: Props) {
  const { details, isLoading } = useBillingDetails()

  if (isLoading) {
    return (
      <Card>
        <div className="h-20 w-full animate-pulse rounded-md bg-white/[0.04]" />
      </Card>
    )
  }

  const notSet = <span className="text-zinc-600">Not set</span>
  const address = details?.address
  const taxId = details?.taxIds[0]?.value

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3 text-sm">
          <DetailRow label="Billing email" value={details?.email || notSet} />
          <DetailRow label="Tax ID" value={taxId || notSet} />
          <DetailRow
            label="Address"
            value={address ? <AddressBlock address={address} /> : notSet}
          />
        </div>
        <PortalButton customerId={billing.stripeCustomerId} returnPath="/billing">
          Edit details
        </PortalButton>
      </div>
    </Card>
  )
}

function AddressBlock({
  address,
}: {
  address: NonNullable<import('../types').BillingDetailsView['address']>
}) {
  return (
    <div className="text-zinc-300">
      {address.line1}
      <br />
      {address.line2 && (
        <>
          {address.line2}
          <br />
        </>
      )}
      {address.city}, {address.state} {address.postal}
      <br />
      {address.country}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 text-xs">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="text-zinc-300">{value}</div>
    </div>
  )
}
```

- [ ] **Step 2: Drop `onUpdateBilling` from the `<DetailsSection>` call**

In `src/features/account/billing/BillingPage.tsx`, change:

```tsx
        <DetailsSection billing={billing} onUpdateBilling={onUpdateBilling} />
```
to:
```tsx
        <DetailsSection billing={billing} />
```

- [ ] **Step 3: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors.

- [ ] **Step 4: Verify no edit-form state remains**

Run: `rg -n "useState|inputCls|setDraft|Save details" src/features/account/billing/DetailsSection.tsx`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/features/account/billing/DetailsSection.tsx src/features/account/billing/BillingPage.tsx
git commit -m "feat(billing): billing details read-only from Stripe"
```

---

### Task 7: InvoicesSection — live invoices

**Files:**
- Modify (full rewrite): `src/features/account/billing/InvoicesSection.tsx`

**Interfaces:**
- Consumes: `useInvoices` (Task 4), `InvoiceView`, `Card`, `fmtDate`, `fmtMoney`.
- Produces: `InvoicesSection()` — note the `billing` prop is removed (data comes from the hook).

- [ ] **Step 1: Replace the whole file**

Overwrite `src/features/account/billing/InvoicesSection.tsx` with:

```tsx
// src/features/account/billing/InvoicesSection.tsx
//
// Live invoice history (most recent twelve) from Stripe. PDF links point at
// Stripe's hosted invoice_pdf. Older invoices live in the customer portal.

import { Download } from 'lucide-react'
import type { InvoiceView } from '../types'
import { Card, fmtDate, fmtMoney } from '../components/primitives'
import { useInvoices } from '../hooks/use-invoices'

const STATUS_CLS: Record<InvoiceView['status'], string> = {
  paid: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/20',
  open: 'bg-amber-500/10 text-amber-200 ring-amber-400/20',
  draft: 'bg-zinc-500/10 text-zinc-300 ring-zinc-400/20',
  void: 'bg-zinc-500/10 text-zinc-400 ring-zinc-400/20',
  uncollectible: 'bg-red-500/10 text-red-300 ring-red-400/20',
}

export function InvoicesSection() {
  const { invoices, isLoading } = useInvoices()

  if (isLoading) {
    return (
      <Card>
        <div className="h-24 w-full animate-pulse rounded-md bg-white/[0.04]" />
      </Card>
    )
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <p className="text-sm text-zinc-400">No invoices yet.</p>
      </Card>
    )
  }

  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 bg-white/[0.015] text-left">
            <Th>Date</Th>
            <Th>Number</Th>
            <Th>Amount</Th>
            <Th>Status</Th>
            <th className="px-5 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv, i) => (
            <tr
              key={inv.id}
              className={i < invoices.length - 1 ? 'border-b border-white/[0.04]' : ''}
            >
              <td className="px-5 py-3 text-xs text-zinc-300 whitespace-nowrap">
                {fmtDate(inv.date)}
              </td>
              <td className="px-5 py-3 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                {inv.number ?? '—'}
              </td>
              <td className="px-5 py-3 font-mono text-xs tabular-nums text-zinc-200 whitespace-nowrap">
                {fmtMoney(inv.amount)}
              </td>
              <td className="px-5 py-3">
                <span
                  className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${STATUS_CLS[inv.status]}`}
                >
                  {inv.status}
                </span>
              </td>
              <td className="px-5 py-3 text-right">
                <InvoicePdfLink href={inv.invoicePdf} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function InvoicePdfLink({ href }: { href: string | null }) {
  if (!href) {
    return <span className="text-[11px] text-zinc-600">—</span>
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"
    >
      <Download className="size-3" /> PDF
    </a>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
      {children}
    </th>
  )
}
```

- [ ] **Step 2: Drop the `billing` prop from the `<InvoicesSection>` call**

In `src/features/account/billing/BillingPage.tsx`, change:

```tsx
        <InvoicesSection billing={billing} />
```
to:
```tsx
        <InvoicesSection />
```

- [ ] **Step 3: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/account/billing/InvoicesSection.tsx src/features/account/billing/BillingPage.tsx
git commit -m "feat(billing): live invoices from Stripe with PDF links"
```

---

### Task 8: Model cleanup — strip persisted billing fields

**Files:**
- Modify: `src/features/account/types.ts` (remove `PaymentMethod`, `Invoice`, and `Billing` money fields)
- Modify: `src/features/account/defaults.ts` (remove removed fields from `DEFAULT_BILLING`)
- Modify: `src/features/account/hooks/use-billing.ts` (drop `billingEmail` overlay)
- Modify: `src/__tests__/server/billing.test.ts` if any reference the old types

**Interfaces:**
- Consumes: nothing new.
- Produces: slimmed `Billing` with fields: `plan`, `status`, `interval`, `seats`, `pricePerMonth`, `pricePerYear`, `renewsAt`, `trialEndsAt`, `cancelAtPeriodEnd`, `usage`, `stripeCustomerId`, `stripeSubscriptionId`. `BillingPageProps.onUpdateBilling` retained (Plan/Cancel still write).

- [ ] **Step 1: Confirm no remaining consumers of the fields to remove**

Run:
```bash
rg -n "\.paymentMethod|\.invoices|\.taxId|\.address|billingEmail" src/features/account
```
Expected: matches only in `defaults.ts`, `use-billing.ts`, and `types.ts` (UI consumers were removed in Tasks 5–7). If any `*.tsx` section still references them, fix that section first.

- [ ] **Step 2: Slim the `Billing` interface + remove dead types**

In `src/features/account/types.ts`:
- Delete the `PaymentMethod` interface, the `BillingAddress` interface, and the `Invoice` interface (replaced by `PaymentMethodView` / `InvoiceView` / `BillingDetailsView`).
- In `Billing`, delete these fields: `pricePerMonth`? **keep**; delete `paymentMethod`, `billingEmail`, `taxId`, `address`, `invoices`. Resulting `Billing`:

```ts
export interface Billing {
  plan: PlanId
  status: BillingStatus
  interval: BillingInterval
  seats: number
  pricePerMonth: number
  pricePerYear: number
  renewsAt: string                 // ISO
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
  usage: UsageBlock
  /** Stripe Customer ID once a subscription has been created. */
  stripeCustomerId?: string | null
  /** Stripe Subscription ID once a subscription has been created. */
  stripeSubscriptionId?: string | null
}
```

- [ ] **Step 3: Slim `DEFAULT_BILLING`**

In `src/features/account/defaults.ts`, remove the `paymentMethod`, `billingEmail`, `taxId`, `address`, and `invoices` properties from `DEFAULT_BILLING`. Update the file's top comment to note payment/invoice/detail data is now fetched live from Stripe (not stubbed). Result:

```ts
export const DEFAULT_BILLING: Billing = {
  plan: 'free',
  status: 'active',
  interval: 'monthly',
  seats: 1,
  pricePerMonth: 0,
  pricePerYear: 0,
  renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  trialEndsAt: null,
  cancelAtPeriodEnd: false,
  usage: {
    resumes:  { used: 0, included: 3,  unit: 'resumes'  },
    articles: { used: 0, included: 10, unit: 'articles' },
    repos:    { used: 0, included: 5,  unit: 'repos'    },
    storage:  { used: 0, included: 1,  unit: 'GB'       },
  },
}
```

- [ ] **Step 4: Drop the `billingEmail` overlay in `use-billing.ts`**

In `src/features/account/hooks/use-billing.ts`, remove the `billingEmail: me.email,` line from the returned `billing` object (the field no longer exists on `Billing`; email now comes from `useBillingDetails`). Leave `update` as-is (still consumed by `BillingPageProps`).

- [ ] **Step 5: Typecheck + lint + full test run**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all green. Fix any remaining references the compiler flags (e.g. a stray import of `PaymentMethod`/`Invoice`).

- [ ] **Step 6: Manual smoke (UI)**

Run: `yarn dev` (port 5001). Open `/billing`:
- As a free user (no `stripeCustomerId`): Payment shows "No card on file", Details show "Not set", Invoices show "No invoices yet" — no console errors.
- As a paid test user: real card read-only, "Update card"/"Edit details" open the Stripe Portal, invoices list with working PDF links.

- [ ] **Step 7: Commit**

```bash
git add src/features/account/types.ts src/features/account/defaults.ts src/features/account/hooks/use-billing.ts
git commit -m "refactor(billing): drop persisted card/invoice/detail fields, Stripe is source of truth"
```

---

## Out of scope (do not implement here)

- **UsageSection** stays a stub (product metering, not Stripe). Separate task.
- **Stripe Customer Portal feature configuration** is a Stripe Dashboard setting (Settings → Billing → Customer portal): enable payment-method update, invoice history, customer-detail editing, cancellation. Document in PR description; no code.
- **Stripe MCP** not required — runtime uses the server SDK in `src/server/stripe.ts`.

## Self-review notes

- Spec coverage: payment method (Task 1/5), invoices (Task 2/7), details (Task 3/6), hooks (Task 4), model + DB-no-change assertion (Task 8 + this plan's note). DB requires no migration — asserted, matching spec.
- Type consistency: `PaymentMethodView` / `InvoiceView` / `BillingDetailsView` defined in Tasks 1–3, consumed identically in Tasks 4–7; `requireCustomerId` defined Task 1, reused Tasks 2–3.
- No raw card data persisted or cached anywhere; inline card/CVC form deleted (Task 5, verified by `rg` in Step 4).
