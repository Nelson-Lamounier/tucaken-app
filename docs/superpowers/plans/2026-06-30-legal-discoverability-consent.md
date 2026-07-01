# Legal Discoverability + Checkout Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the legal pages publicly (landing footer, signup) and capture affirmative, non-refundable immediate-performance consent at checkout, recorded in Stripe.

**Architecture:** Connect existing scaffolding — add a Legal column to the existing landing footer, give the signup form's dead acceptance anchors real targets, and gate the Stripe checkout behind a required consent checkbox whose acknowledgement is stamped into the Stripe session metadata (consent schema + metadata builder live in a Stripe-free `features/billing/consent.ts` for testability). Terms billing copy is updated to state the service is non-refundable.

**Tech Stack:** TanStack Start/Router/Query, React 19, @tanstack/react-form, Zod, Stripe embedded checkout, Tailwind v4, Vitest + @testing-library/react (happy-dom).

## Global Constraints

- Copy minimal, honest, UK English; no non-ASCII characters; product is "Tucaken".
- Consent version is **server-authoritative**: server stamps `LEGAL.lastUpdated` (from `src/features/legal/config.ts`) and a server-clock ISO timestamp. The client only asserts `termsAccepted: true`.
- Service is **non-refundable** for change of mind via the immediate-performance waiver; the non-excludable statutory carve-out ("faulty or not as described") stays.
- Payment must be impossible without the affirmative consent tick (client gate) AND `termsAccepted: z.literal(true)` on the server (defence in depth).
- Tailwind v4 tokens only (reuse existing teal link classes); light + dark correct; `rounded-md`.
- Tests live under `src/__tests__/**`; React component tests need `/** @vitest-environment happy-dom */` (default env is node). Run with `yarn` (under nvm — prefix `export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"` if yarn is not found).
- No `console.*`; no `as any`/non-null assertions; stable React keys; `Number.*` over globals; `Set.has` for membership.
- Stripe metadata values must be strings.
- Before "done": `yarn typecheck && yarn lint && yarn test`.

## File Structure

- `src/features/home/sections/Sections.tsx` — modify: export `FOOTER_COLUMNS`, add the Legal column.
- `src/features/auth/components/SignUpForm.tsx` — modify: add `href`/`target` to the two acceptance anchors.
- `src/features/legal/content/terms.tsx` — modify: non-refundable billing copy.
- `src/features/billing/consent.ts` — create: `checkoutConsentSchema`, `ConsentMetadata`, `buildConsentMetadata`.
- `src/features/billing/components/CheckoutConsent.tsx` — create: presentational required-consent checkbox with linked Terms.
- `src/server/billing.ts` — modify: extend `CreateCheckoutInput`, stamp consent metadata.
- `src/app/checkout.$tier.tsx` — modify: `accepted` state, gate query + embedded checkout, pass `termsAccepted`.
- Tests under `src/__tests__/features/{home,auth,legal,billing}/` and `src/__tests__/server/`.

---

### Task 1: Legal column in the landing footer

**Files:**
- Modify: `src/features/home/sections/Sections.tsx` (the `FOOTER_COLUMNS` const, ~line 392)
- Test: `src/__tests__/features/home/footer-legal.test.ts`

**Interfaces:**
- Produces: `export const FOOTER_COLUMNS` (array of `{ heading: string; links: { label: string; to?: string; href?: string }[] }`).

- [ ] **Step 1: Write the failing test**

`src/__tests__/features/home/footer-legal.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { FOOTER_COLUMNS } from '@/features/home/sections/Sections'

describe('footer legal links', () => {
  it('has a Legal column linking to the three legal pages', () => {
    const legal = FOOTER_COLUMNS.find((c) => c.heading === 'Legal')
    expect(legal).toBeDefined()
    const targets = new Set(legal?.links.map((l) => l.to))
    expect(targets.has('/terms')).toBe(true)
    expect(targets.has('/privacy')).toBe(true)
    expect(targets.has('/cookies')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/footer-legal.test.ts`
Expected: FAIL — `FOOTER_COLUMNS` is not exported (import is `undefined`).

- [ ] **Step 3: Export the const and add the Legal column**

In `src/features/home/sections/Sections.tsx`, change `const FOOTER_COLUMNS:` to `export const FOOTER_COLUMNS:` and add the Legal column as a third entry in the array:
```ts
  {
    heading: 'Legal',
    links: [
      { label: 'Terms & Conditions', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Cookie Policy', to: '/cookies' },
    ],
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/footer-legal.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + typecheck**

Run: `yarn lint && yarn typecheck`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/home/sections/Sections.tsx src/__tests__/features/home/footer-legal.test.ts
git commit -m "feat(home): add legal links column to landing footer"
```

---

### Task 2: Link the signup acceptance anchors

**Files:**
- Modify: `src/features/auth/components/SignUpForm.tsx` (the `accept` field label, ~lines 146-149)
- Test: `src/__tests__/features/auth/signup-legal-links.test.tsx`

**Interfaces:**
- Consumes: existing `SignUpForm` (props `onSwitchToSignIn`, `onSubmit?`, `onGoogle`, `onGithub`, `error?`, `accountExists?`).

- [ ] **Step 1: Write the failing test**

`src/__tests__/features/auth/signup-legal-links.test.tsx`:
```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SignUpForm } from '@/features/auth/components/SignUpForm'

describe('SignUpForm legal links', () => {
  it('links acceptance copy to the terms and privacy pages', () => {
    render(
      <SignUpForm
        onSwitchToSignIn={() => {}}
        onGoogle={() => {}}
        onGithub={() => {}}
      />,
    )
    const terms = screen.getByRole('link', { name: 'Terms & Conditions' })
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' })
    expect(terms.getAttribute('href')).toBe('/terms')
    expect(privacy.getAttribute('href')).toBe('/privacy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/auth/signup-legal-links.test.tsx`
Expected: FAIL — the anchors have no `href` (and the Terms anchor text is currently "Terms of Service").

- [ ] **Step 3: Update the acceptance label anchors**

In `src/features/auth/components/SignUpForm.tsx`, replace the two anchors inside the `accept` field label:
```tsx
                I agree to the{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                >
                  Terms &amp; Conditions
                </a>{' '}
                and{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                >
                  Privacy Policy
                </a>
                .
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/auth/signup-legal-links.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + typecheck**

Run: `yarn lint && yarn typecheck`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/auth/components/SignUpForm.tsx src/__tests__/features/auth/signup-legal-links.test.tsx
git commit -m "feat(auth): link signup acceptance to terms and privacy pages"
```

---

### Task 3: Non-refundable billing copy in Terms

**Files:**
- Modify: `src/features/legal/content/terms.tsx` (the `billing` section body)
- Test: `src/__tests__/features/legal/terms-billing.test.tsx`

**Interfaces:**
- Consumes: `termsDoc` (`LegalDoc`), `LegalPage`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/features/legal/terms-billing.test.tsx`:
```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LegalPage } from '@/features/legal/components/LegalPage'
import { termsDoc } from '@/features/legal/content/terms'

describe('terms billing copy', () => {
  it('states the service is non-refundable and preserves statutory rights', () => {
    const { container } = render(<LegalPage doc={termsDoc} />)
    const text = container.textContent ?? ''
    expect(text).toContain('non-refundable')
    expect(text).toContain('faulty or not as described')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/legal/terms-billing.test.tsx`
Expected: FAIL — current billing copy contains neither phrase.

- [ ] **Step 3: Update the billing section body**

In `src/features/legal/content/terms.tsx`, replace the `body` of the `billing` section with:
```tsx
      body: (
        <>
          <p>
            Paid plans are billed through Stripe. Subscriptions are non-refundable.
            You can cancel at any time to stop future billing; cancellation takes
            effect at the end of the current billing period.
          </p>
          <p>
            Because Tucaken is a digital service that begins immediately, when you
            subscribe you ask us to start straight away and acknowledge that your
            statutory 14-day right of withdrawal ends once the service has begun.
            This does not affect your other statutory consumer rights, for example
            where a service is faulty or not as described.
          </p>
        </>
      ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/legal/terms-billing.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify no non-ASCII was introduced**

Run: `python3 -c "import sys; [print(f) for f in ['src/features/legal/content/terms.tsx'] for i,l in enumerate(open(f,encoding='utf-8'),1) if any(ord(c)>127 for c in l)]"`
Expected: no output (no non-ASCII lines).

- [ ] **Step 6: Lint + typecheck**

Run: `yarn lint && yarn typecheck`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/legal/content/terms.tsx src/__tests__/features/legal/terms-billing.test.tsx
git commit -m "feat(legal): state subscriptions are non-refundable in terms"
```

---

### Task 4: Consent schema + metadata builder (server-side record)

**Files:**
- Create: `src/features/billing/consent.ts`
- Modify: `src/server/billing.ts` (`CreateCheckoutInput` ~line 231; session `metadata` ~line 282)
- Test: `src/__tests__/features/billing/consent.test.ts`

**Interfaces:**
- Produces: `checkoutConsentSchema` (Zod `{ termsAccepted: true }`); `interface ConsentMetadata { terms_accepted: 'true'; terms_version: string; terms_accepted_at: string }`; `buildConsentMetadata(now: Date): ConsentMetadata`.
- Consumes: `LEGAL` from `@/features/legal/config`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/features/billing/consent.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  checkoutConsentSchema,
  buildConsentMetadata,
} from '@/features/billing/consent'
import { LEGAL } from '@/features/legal/config'

describe('checkout consent', () => {
  it('accepts only an affirmative true', () => {
    expect(checkoutConsentSchema.safeParse({ termsAccepted: true }).success).toBe(true)
    expect(checkoutConsentSchema.safeParse({ termsAccepted: false }).success).toBe(false)
    expect(checkoutConsentSchema.safeParse({}).success).toBe(false)
  })

  it('builds server-authoritative consent metadata', () => {
    const md = buildConsentMetadata(new Date('2020-01-02T03:04:05.000Z'))
    expect(md).toEqual({
      terms_accepted: 'true',
      terms_version: LEGAL.lastUpdated,
      terms_accepted_at: '2020-01-02T03:04:05.000Z',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/billing/consent.test.ts`
Expected: FAIL — cannot resolve `@/features/billing/consent`.

- [ ] **Step 3: Create the consent module**

`src/features/billing/consent.ts`:
```ts
import { z } from 'zod'
import { LEGAL } from '@/features/legal/config'

/** Affirmative consent to immediate performance, asserted by the client. */
export const checkoutConsentSchema = z.object({
  termsAccepted: z.literal(true),
})

/** Stripe metadata values must be strings. */
export interface ConsentMetadata {
  terms_accepted: 'true'
  terms_version: string
  terms_accepted_at: string
}

/**
 * Server-authoritative consent record. The version is the canonical
 * `LEGAL.lastUpdated`; the timestamp is the server clock. Never trust the
 * client for either.
 */
export function buildConsentMetadata(now: Date): ConsentMetadata {
  return {
    terms_accepted: 'true',
    terms_version: LEGAL.lastUpdated,
    terms_accepted_at: now.toISOString(),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/billing/consent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the consent into `createCheckoutSessionFn`**

In `src/server/billing.ts`:

(a) Add the import near the other feature imports (e.g. beside the `TierConfig` import):
```ts
import { checkoutConsentSchema, buildConsentMetadata } from '@/features/billing/consent'
```

(b) Extend the input schema:
```ts
const CreateCheckoutInput = z
  .object({ tier: z.enum(['pro', 'premium']) })
  .merge(checkoutConsentSchema)
```

(c) In the `stripe().checkout.sessions.create({...})` call, extend the session-level `metadata` (leave `subscription_data.metadata` unchanged):
```ts
      metadata: {
        tier: data.tier,
        ...(user ? { userId: user.id } : { source: 'guest' }),
        ...buildConsentMetadata(new Date()),
      },
```

- [ ] **Step 6: Run the billing test suite + gates**

Run: `yarn test src/__tests__/features/billing/consent.test.ts src/__tests__/server/billing.test.ts && yarn lint && yarn typecheck`
Expected: PASS, zero errors. (The existing `billing.test.ts` mocks `inputValidator` as a passthrough, so adding the schema field does not break it.)

- [ ] **Step 7: Commit**

```bash
git add src/features/billing/consent.ts src/server/billing.ts src/__tests__/features/billing/consent.test.ts
git commit -m "feat(billing): record checkout consent in stripe session metadata"
```

---

### Task 5: Checkout consent checkbox + payment gate

**Files:**
- Create: `src/features/billing/components/CheckoutConsent.tsx`
- Modify: `src/app/checkout.$tier.tsx`
- Test: `src/__tests__/features/billing/CheckoutConsent.test.tsx`

**Interfaces:**
- Produces: `CheckoutConsent({ accepted, onChange }: { accepted: boolean; onChange: (v: boolean) => void })`.
- Consumes: `createCheckoutSessionFn({ data: { tier, termsAccepted: true } })`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/features/billing/CheckoutConsent.test.tsx`:
```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CheckoutConsent } from '@/features/billing/components/CheckoutConsent'

describe('CheckoutConsent', () => {
  it('links to the terms page and reports ticking', () => {
    const onChange = vi.fn()
    render(<CheckoutConsent accepted={false} onChange={onChange} />)
    const terms = screen.getByRole('link', { name: 'Terms & Conditions' })
    expect(terms.getAttribute('href')).toBe('/terms')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('mentions non-refundable and the immediate-performance waiver', () => {
    render(<CheckoutConsent accepted={false} onChange={() => {}} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('non-refundable')
    expect(text).toContain('begin immediately')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/billing/CheckoutConsent.test.tsx`
Expected: FAIL — cannot resolve the component module.

- [ ] **Step 3: Create the consent checkbox component**

`src/features/billing/components/CheckoutConsent.tsx`:
```tsx
interface CheckoutConsentProps {
  accepted: boolean
  onChange: (value: boolean) => void
}

/**
 * Required affirmative consent at checkout. Ticking it expresses consent to
 * immediate performance (which ends the statutory withdrawal right) and to the
 * subscription being non-refundable.
 */
export function CheckoutConsent({ accepted, onChange }: CheckoutConsentProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-600">
      <input
        type="checkbox"
        checked={accepted}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
      />
      <span>
        I agree to the{' '}
        <a
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-teal-600 underline hover:text-teal-500"
        >
          Terms &amp; Conditions
        </a>{' '}
        and ask Tucaken to begin immediately. I understand the service starts at
        once, that this ends my 14-day right to withdraw, and that my payment is
        non-refundable.
      </span>
    </label>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/billing/CheckoutConsent.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the gate into the checkout route**

In `src/app/checkout.$tier.tsx`:

(a) Add imports:
```tsx
import { useMemo, useState } from 'react'
import { CheckoutConsent } from '@/features/billing/components/CheckoutConsent'
```
(Replace the existing `import { useMemo } from 'react'` line.)

(b) Inside `CheckoutRoute`, add state above the `useQuery`:
```tsx
  const [accepted, setAccepted] = useState(false)
```

(c) Gate the session query so it only fires after consent, and pass `termsAccepted`:
```tsx
  const { data, isLoading, error } = useQuery({
    queryKey: ['checkout-session', tier],
    queryFn: () => createCheckoutSessionFn({ data: { tier, termsAccepted: true } }),
    enabled: accepted,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  })
```

(d) Replace the white-surface block that renders the embedded checkout and the passive paragraph below it:
```tsx
          <div className="mt-5 space-y-4">
            <CheckoutConsent accepted={accepted} onChange={setAccepted} />
            <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
              {!accepted && (
                <p className="px-3 py-6 text-center text-sm text-zinc-500">
                  Agree to the terms above to continue to payment.
                </p>
              )}
              {accepted && isLoading && <Skeleton />}
              {accepted && error && <ErrorBox message={(error as Error).message} />}
              {accepted && options && (
                <EmbeddedCheckoutProvider stripe={getStripe()} options={options}>
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              )}
            </div>
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            Your card will be charged EUR{monthlyTotal} today and on the same date
            each month until you cancel.
          </p>
```
(This removes the old `<p>By subscribing you agree to our terms…</p>`. Keep the surrounding `<div className="mx-auto w-full max-w-lg">` and the "Back to pricing" link unchanged. Confirm `Skeleton` and `ErrorBox` are the same helpers already used in this file.)

- [ ] **Step 6: Run gates**

Run: `yarn test src/__tests__/features/billing/CheckoutConsent.test.tsx && yarn lint && yarn typecheck`
Expected: PASS, zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/billing/components/CheckoutConsent.tsx src/app/checkout.$tier.tsx src/__tests__/features/billing/CheckoutConsent.test.tsx
git commit -m "feat(billing): gate checkout behind affirmative non-refundable consent"
```

---

### Task 6: Full verification

- [ ] **Step 1: Whole-repo gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all pass, zero errors.

- [ ] **Step 2: Manual browser check**

Run: `yarn dev`, then:
- Landing page footer shows a **Legal** column linking to `/terms`, `/privacy`, `/cookies`; all resolve.
- `/sign-in` -> Create account: the "Terms & Conditions" and "Privacy Policy" links open the right pages in a new tab; form state survives.
- `/checkout/pro`: the Stripe form is **hidden** until the consent checkbox is ticked; the checkbox text states non-refundable + immediate start; ticking reveals the embedded checkout. Check light + dark.

- [ ] **Step 3: Final commit (only if manual fixes were needed)**

```bash
git add -A
git commit -m "fix(billing): polish checkout consent after manual review"
```

---

## Self-Review

- **Spec coverage:** §1 footer -> Task 1; §2 signup -> Task 2; §3 checkout client -> Task 5; §4 checkout server -> Task 4; §5 non-refundable Terms copy -> Task 3; testing -> each task + Task 6. All spec sections covered.
- **Placeholder scan:** none — all code/copy literal.
- **Type consistency:** `checkoutConsentSchema`, `ConsentMetadata`, `buildConsentMetadata(now: Date)` defined in Task 4 and used unchanged in `billing.ts`; `CheckoutConsent({ accepted, onChange })` signature consistent between Task 5 component, test, and route wiring; `createCheckoutSessionFn` call sends `{ tier, termsAccepted: true }` matching the extended `CreateCheckoutInput`.
- **Deferred (noted in spec):** legal links in the authenticated dashboard sidebar — not in this plan.
