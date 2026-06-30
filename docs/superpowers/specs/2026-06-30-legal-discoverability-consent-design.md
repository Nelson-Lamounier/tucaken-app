# Design: Public legal discoverability + checkout consent capture

**Date:** 2026-06-30
**Status:** Approved (design); pending implementation plan
**Branch:** `worktree-feat+terms-and-conditions` (builds on the legal-pages work, PR #211)

## Context

The legal pages (`/terms`, `/privacy`, `/cookies`) exist and are cross-linked,
and the cookie-consent banner links to `/privacy` and `/cookies`. But the pages
are not surfaced where users actually need them: the public landing footer has no
legal links, the signup form's acceptance anchors are dead placeholders, and the
checkout flow only shows a passive, unlinked "By subscribing you agree to our
terms" line — which does not capture the express consent to immediate performance
that the Terms rely on to end the statutory 14-day cooling-off right.

### Discovered existing scaffolding (connect, don't rebuild)

- **Landing footer already exists:** `FooterSection` with a `FOOTER_COLUMNS`
  array (`Product`, `Company`) rendered via `FooterNavLink`, plus a bottom bar
  that already wires `CookiePreferencesLink`
  (`src/features/home/sections/Sections.tsx`).
- **Signup acceptance already enforced:** `SignUpForm` has an `accept` checkbox
  with "I agree to the Terms of Service and Privacy Policy" anchors that have
  **no href**, and `signUpSchema` already enforces `accept: z.literal(true)`
  (`src/features/auth/components/SignUpForm.tsx`, `src/features/auth/validation.ts`).
- **Checkout session metadata pattern exists:** `createCheckoutSessionFn` stamps
  `{ tier, userId | source }` into both session and subscription metadata
  (`src/server/billing.ts:282`). Consent fields slot into the same block.

### Constraints (carried from the legal-pages work)

- Copy minimal, honest, UK English; no non-ASCII; product is "Tucaken".
- The consent **version is server-authoritative** — the server reads
  `LEGAL.lastUpdated` from `src/features/legal/config.ts`; the client only asserts
  `termsAccepted: true`. The timestamp is the server clock, never the client's.
- Tailwind v4 tokens only; light + dark correct; `rounded-md`.
- Payment must be impossible without an affirmative consent tick.

### Non-goals

- No new database schema for consent (recorded in Stripe session metadata).
- No legal links in the authenticated dashboard sidebar (deferred follow-up).
- No change to the signup acceptance *logic* (already gated) beyond linking.

## Architecture / changes

### 1. Landing footer — `src/features/home/sections/Sections.tsx`

Add one entry to `FOOTER_COLUMNS`:

```ts
{
  heading: 'Legal',
  links: [
    { label: 'Terms & Conditions', to: '/terms' },
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Cookie Policy', to: '/cookies' },
  ],
}
```

`FooterNavLink` already renders `to:` links via TanStack `Link`. No other change;
the cookie *preferences* control remains in the bottom bar.

### 2. Signup — `src/features/auth/components/SignUpForm.tsx`

Give the two dead acceptance anchors real targets and align the label to the
page title:

- "Terms & Conditions" anchor -> `href="/terms"`, `target="_blank"`,
  `rel="noreferrer"`.
- "Privacy Policy" anchor -> `href="/privacy"`, `target="_blank"`,
  `rel="noreferrer"`.

`target="_blank"` so opening a policy does not discard the partly-filled form.
Acceptance remains enforced by the existing `accept: z.literal(true)` schema — no
logic change.

### 3. Checkout client — `src/app/checkout.$tier.tsx`

- Add `const [accepted, setAccepted] = useState(false)`.
- Render a **required consent checkbox** in the payment column, above the Stripe
  form, with the Terms linked (`/terms`, new tab):
  > "I agree to the Terms & Conditions and ask Tucaken to begin immediately. I
  > understand the service starts at once, that this ends my 14-day right to
  > withdraw, and that my payment is non-refundable."
- Gate the Stripe session query: `useQuery({ …, enabled: accepted })`, and pass
  `termsAccepted: true` in the request body.
- Mount `EmbeddedCheckoutProvider`/`EmbeddedCheckout` only when
  `accepted && options` (clientSecret present). Before the tick, show the
  checkbox and a short prompt instead of the form.
- Remove the old passive "By subscribing you agree to our terms" sentence; keep
  the billing-amount line ("EUR X today and on the same date each month until you
  cancel").

### 4. Checkout server — `src/server/billing.ts`

- Extend the input schema:
  ```ts
  const CreateCheckoutInput = z.object({
    tier: z.enum(['pro', 'premium']),
    termsAccepted: z.literal(true),
  })
  ```
  A session cannot be created without asserting consent (defence in depth beyond
  the client gate).
- Import `LEGAL` from `@/features/legal/config` and stamp the session metadata:
  ```ts
  metadata: {
    tier: data.tier,
    ...(user ? { userId: user.id } : { source: 'guest' }),
    terms_accepted: 'true',
    terms_version: LEGAL.lastUpdated,
    terms_accepted_at: new Date().toISOString(),
  }
  ```
  (Subscription-level metadata stays as-is — the consent record lives on the
  session.) This yields a durable, queryable consent record in Stripe with no new
  storage.

### 5. Terms billing copy — `src/features/legal/content/terms.tsx`

The product is a **non-refundable** service. Update the `billing` section so it
states this explicitly, achieved through the immediate-performance waiver, while
keeping the non-excludable statutory carve-out (you cannot contract out of
remedies for a faulty / not-as-described service). Target wording:

> Paid plans are billed through Stripe. Subscriptions are non-refundable. Because
> Tucaken is a digital service that begins immediately, when you subscribe you ask
> us to start straight away and acknowledge that your statutory 14-day right of
> withdrawal ends once the service has begun. You can cancel at any time to stop
> future billing; cancellation takes effect at the end of the current billing
> period. This does not affect your other statutory consumer rights, for example
> where a service is faulty or not as described.

This keeps Terms, checkout consent copy, and the Stripe consent record mutually
consistent: non-refundable for change of mind, statutory remedies preserved.

## Testing

- **Footer** (`src/__tests__/features/home/...` or `legal/...`): render
  `FooterSection`; assert anchors/links to `/terms`, `/privacy`, `/cookies`
  exist.
- **Signup**: render `SignUpForm`; assert the accept-label anchors have
  `href="/terms"` and `href="/privacy"`.
- **Checkout client**: render the checkout component with the session query
  mocked; assert `EmbeddedCheckout` is absent before the checkbox is ticked and
  the query is disabled (`enabled: accepted` false initially).
- **Checkout server**: unit-test `CreateCheckoutInput` rejects
  `termsAccepted: false`/absent; assert the metadata object includes
  `terms_accepted`, `terms_version` (= `LEGAL.lastUpdated`), and a
  `terms_accepted_at` ISO string.
- Gate: `yarn typecheck && yarn lint && yarn test`; manual `yarn dev` walk of
  footer -> signup -> checkout in light and dark.

## Open items for review

- Checkout consent wording (section 3) and non-refundable Terms copy (section 5):
  decided — service is non-refundable for change of mind via the
  immediate-performance waiver, with statutory faulty/not-as-described rights
  preserved.
- Whether to also surface legal links in the authenticated dashboard (currently
  out of scope).
