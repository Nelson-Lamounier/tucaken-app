# Stripe-owned Billing — no stored card info

**Date:** 2026-06-25
**Status:** Approved (design)
**Area:** `src/features/account/billing`, `src/server/billing.ts`

## Problem

The Billing page presents payment-method, invoice, and billing-detail data that
is **mock** (`DEFAULT_BILLING`), and exposes edit forms that imply we persist
this data locally. Two concrete faults:

1. `PaymentSection` renders an inline card form that collects a **raw card
   number and CVC**. Touching raw PAN/CVC removes the app from Stripe's SAQ-A
   PCI scope. This form must be deleted.
2. `Billing.paymentMethod` is a hardcoded `visa / 0000` stub; `Billing.invoices`
   is always `[]`; `DetailsSection`'s edit form is a no-op (`useBilling().update`
   does nothing). The UI lies about persistence.

The user's intent: **do not save card information**. Stripe is already the
system of record (embedded Checkout + Customer Portal are wired). The fix is to
stop pretending we store money data and instead read it **live** from Stripe.

## Principle

Stripe owns everything money. Our database (`users` table) stores only identity
and subscription state — which it already does:

```
plan, subscription_status, stripe_customer_id, stripe_subscription_id,
cancel_at_period_end, current_period_end
```

**No card data is ever stored or cached.** Caching `last4`/`brand` would
reintroduce exactly the data the user wants gone and add needless PCI surface.
Card / invoice / detail data is fetched live from Stripe per page load.

## Database / admin-api

**No schema change.** The `users` table already has zero card columns; the
`/api/admin/me` projection (`getUserPlanStatus`) returns only the subscription
fields above. The internal billing routes
(`admin-api/src/routes/internal-billing.ts`) only mutate `stripe_*` columns and
`pending_subscriptions`. The "update user database" requirement is satisfied by
confirming this — nothing is added. This is asserted, not changed.

## Server layer — new live-read functions

Add to `src/server/billing.ts`. Each function:

- Requires an authenticated session (`requireAuth`).
- Resolves the Stripe customer **server-side** from the user's `/me`
  projection (`me.plan.stripeCustomerId`). It **never** accepts a `customerId`
  from the client — this prevents IDOR (one user reading another's billing).
- Returns a typed, validated, narrow shape (no raw Stripe objects leaked).
- Returns an empty/null result when the user has no Stripe customer yet (free
  tier) — callers render an appropriate empty state rather than erroring.
- Is paired with a `queryOptions` factory so route loaders can
  `ensureQueryData` and SSR-hydrate (per CLAUDE.md TanStack patterns).

Functions:

1. **`getPaymentMethodFn`** → `PaymentMethodView | null`

   ```ts
   interface PaymentMethodView {
     brand: string        // 'visa' | 'mastercard' | ...
     last4: string
     expMonth: number
     expYear: number
     wallet: string | null // 'apple_pay' | 'google_pay' | null
   }
   ```

   Resolution: read the customer's
   `invoice_settings.default_payment_method` (expand it), else fall back to the
   subscription's `default_payment_method`, else the first card payment method
   on file. Return `null` if none. Only `card`-type details are surfaced.

2. **`getInvoicesFn`** → `InvoiceView[]` (most recent 12)

   ```ts
   interface InvoiceView {
     id: string
     number: string | null
     date: string          // ISO, from `created`
     amount: number        // major units (amount_paid / amount_due)
     currency: string
     status: 'paid' | 'open' | 'void' | 'uncollectible' | 'draft'
     invoicePdf: string | null   // Stripe `invoice_pdf`
     hostedUrl: string | null    // Stripe `hosted_invoice_url`
   }
   ```

   `stripe.invoices.list({ customer, limit: 12 })`.

3. **`getBillingDetailsFn`** → `BillingDetailsView`

   ```ts
   interface BillingDetailsView {
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

   `stripe.customers.retrieve(customerId, { expand: ['tax_ids'] })`.

A shared private helper `requireCustomerId()` reads `/me`, returns the
`stripe_customer_id` or `null`. All three fns use it. The existing
`createPortalSessionFn` / `cancelSubscriptionFn` ownership checks are unchanged.

> Verify exact Stripe SDK method names / expand paths against the pinned API
> version (`2026-04-22.dahlia`) via **context7** before writing — per the
> mandatory-context7 rule in CLAUDE.md.

## Client layer — hooks

New hooks in `src/features/account/hooks/`:

- `usePaymentMethod()` → `{ paymentMethod, isLoading }`
- `useInvoices()` → `{ invoices, isLoading }`
- `useBillingDetails()` → `{ details, isLoading }`

Each wraps `useQuery` over the matching `queryOptions`. Query keys live under
the existing `adminKeys` namespace (e.g. `adminKeys.billing.paymentMethod()`).

## UI changes

### PaymentSection
- **Delete the inline card/CVC edit form entirely** (the `editing` state,
  `draft`, all `<input>`s for number/month/year/CVC).
- Render brand / last4 / expiry **read-only** from `usePaymentMethod()`.
- Keep the "expiring soon" chip (computed from live `expMonth`/`expYear`).
- "Update card" → `PortalButton`.
- States: loading skeleton; no payment method → "No card on file — subscribe to
  a paid plan to add one"; no customer → same.

### DetailsSection
- **Delete the edit form** (`editing`, `draft`, `save`, all inputs).
- Render live `email` / `taxIds` / `address` from `useBillingDetails()`
  read-only.
- "Edit details" → `PortalButton` (Stripe Portal owns these edits).
- Empty fields show "Not set".

### InvoicesSection
- Render live invoices from `useInvoices()`.
- PDF button links to the real `invoicePdf` URL (opens in new tab); disabled if
  null.
- Status chip colour keyed off live status (paid=emerald, open=amber,
  void/uncollectible=zinc/red).
- Empty state: "No invoices yet."

### BillingPage
- Drop the `onUpdateBilling` prop threading into Payment / Details / Invoices
  (those sections no longer mutate). `PlanSection` / `CancelSection` keep their
  existing behaviour (they call real subscription server fns).

## Model cleanup

`src/features/account/types.ts`:
- Remove from `Billing`: `paymentMethod`, `invoices`, `taxId`, `address`, and
  the editable treatment of `billingEmail`. `Billing` retains DB-sourced fields:
  `plan`, `status`, `interval`, `seats`, `pricePerMonth`, `pricePerYear`,
  `renewsAt`, `trialEndsAt`, `cancelAtPeriodEnd`, `usage`, `stripeCustomerId`,
  `stripeSubscriptionId`.
- `PaymentMethod` / `Invoice` types are replaced by the `*View` shapes above
  (live-query results), exported for the hooks/sections.
- `BillingPageProps.onUpdateBilling` is removed if no remaining consumer needs
  it; otherwise narrowed to the sections that still write.

`src/features/account/defaults.ts`:
- Remove `paymentMethod`, `invoices`, `taxId`, `address` from `DEFAULT_BILLING`.
- `useBilling()`: drop the now-unused `billingEmail` overlay where it duplicated
  Stripe data; drop the no-op `update` if no consumer remains.

## Out of scope (explicitly)

- **Usage meters** (`UsageSection`) — product metering from our own DB, not a
  Stripe concept. Remains a stub; tracked as a separate task.
- **Stripe Customer Portal feature configuration** — set in Stripe Dashboard
  (Settings → Billing → Customer portal): enable payment-method update, invoice
  history, customer detail editing, and cancellation. Documented, not code.
- **Stripe MCP** — not connected to the session and not required; runtime uses
  the server-side Stripe SDK already wired in `src/server/stripe.ts`.

## Testing

- Unit-test the three server fns with a mocked Stripe client + mocked `/me`:
  - customer present → maps Stripe shape → View shape correctly.
  - no customer → returns `null` / `[]` without calling Stripe.
  - default-PM fallback chain (invoice_settings → subscription → first card).
- Component tests: each section renders loading / populated / empty states.
- `yarn typecheck && yarn lint && yarn test` green before done.
- Manual: `yarn dev`, open `/billing` as a paid test user (real card shows
  read-only, Portal opens) and as a free user (empty states, no errors).

## Security notes

- Customer ID resolved server-side from auth — never from client input.
- No raw PAN/CVC anywhere in the client bundle after the form is deleted.
- Server fns return narrow Views; no raw Stripe objects (which carry internal
  IDs / secrets) reach the client.
- Read-only fns are rate-limited consistently with existing billing fns if the
  `_rate-limit` helper is appropriate for GETs (evaluate during implementation).
