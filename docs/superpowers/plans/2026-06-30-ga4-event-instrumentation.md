# GA4 Public-Funnel Event Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dormant GA4 event helpers to the public marketing funnel — CTA clicks (hero, header, pricing), footer social/contact clicks, and sign-in/sign-up submissions — so GA4 captures the acquisition funnel once it is live.

**Architecture:** Each helper in `src/lib/observability/analytics.ts` already guards on `window.gtag` and is a no-op pre-consent, so wiring is consent-safe with no extra gating. Form outcomes go through a small tested `withFormTracking` wrapper; CTA/social wiring adds one-line calls in existing `onClick` handlers. Each call site gets a focused jsdom test that mocks the analytics module and asserts the helper was called with exact arguments.

**Tech Stack:** React 19, TanStack Router/Query, Vitest + @testing-library/react, motion/react, Tailwind v4.

## Global Constraints

- **Package manager:** Yarn 4 only (`yarn typecheck`, `yarn lint`, `yarn test <path>`). Never npm/npx.
- **Consent safety:** add no new gating around `track*` calls — they are silent no-ops until consent loads GA4. Never place a tracking call where a throw would interrupt navigation/auth (the helpers do not throw).
- **Copy:** English (UK). Product name "Tucaken".
- **SonarCloud/ESLint:** complexity ≤ 10; no nested ternaries (guard clauses/early returns); no redundant casts / non-null assertions; `catch (e: unknown)`; stable React keys; no `console.*` in app code; `Number.*` over globals.
- **Animation:** import from `motion/react` only (never framer-motion).
- **Tests:** Vitest. DOM/component tests start with `// @vitest-environment jsdom`. Place tests under `src/__tests__/` mirroring the source path (e.g. `src/__tests__/lib/observability/...`, `src/__tests__/features/home/...`). Import test fns from `vitest`.
- **Analytics import path:** components import helpers from `@/lib/observability/analytics` (the `@` alias = `src/`).
- **Definition of done per task:** `yarn typecheck && yarn lint` and the task's tests pass.
- **Never edit** `routeTree.gen.ts` or `yarn.lock` by hand.

## Existing helper signatures (from `src/lib/observability/analytics.ts`, do not change)

- `trackCtaClick(ctaName: string, location: string): void`
- `trackSocialClick(platform: string, url: string): void`
- `trackFormSubmission(formName: string, status: 'success' | 'error'): void`

---

### Task 1: `withFormTracking` wrapper + sign-in/sign-up funnel

**Files:**
- Modify: `src/lib/observability/analytics.ts` (append `withFormTracking`)
- Modify: `src/app/sign-in.tsx` (wrap `onSignIn` and `onSignUp` handler bodies)
- Test: `src/__tests__/lib/observability/with-form-tracking.test.ts`

**Interfaces:**
- Consumes: `trackFormSubmission` (already in `analytics.ts`).
- Produces: `withFormTracking<T>(formName: string, run: () => Promise<T>): Promise<T>` — runs `run`, fires `trackFormSubmission(formName,'success')` on resolve and `(formName,'error')` on throw, then returns/rethrows.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/observability/with-form-tracking.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ trackFormSubmission: vi.fn() }))
vi.mock('../../../lib/observability/analytics', async (orig) => {
  const actual = await orig<typeof import('../../../lib/observability/analytics')>()
  return { ...actual, trackFormSubmission: mocks.trackFormSubmission }
})

import { withFormTracking } from '../../../lib/observability/analytics'

beforeEach(() => vi.clearAllMocks())

describe('withFormTracking', () => {
  it('fires success and returns the resolved value', async () => {
    const result = await withFormTracking('sign_in', async () => 'ok')
    expect(result).toBe('ok')
    expect(mocks.trackFormSubmission).toHaveBeenCalledWith('sign_in', 'success')
  })

  it('fires error and rethrows when run throws', async () => {
    const boom = new Error('bad creds')
    await expect(
      withFormTracking('sign_up', async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
    expect(mocks.trackFormSubmission).toHaveBeenCalledWith('sign_up', 'error')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/lib/observability/with-form-tracking.test.ts`
Expected: FAIL — `withFormTracking` is not exported.

- [ ] **Step 3: Implement `withFormTracking`**

Append to `src/lib/observability/analytics.ts` (after `trackFormSubmission`):

```ts
/**
 * Run an async form action and report its outcome to GA4.
 * Fires `trackFormSubmission(formName, 'success')` when `run` resolves and
 * `(formName, 'error')` when it throws, then returns/rethrows unchanged so the
 * caller's existing success/error handling is untouched.
 */
export async function withFormTracking<T>(
  formName: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    const result = await run()
    trackFormSubmission(formName, 'success')
    return result
  } catch (error) {
    trackFormSubmission(formName, 'error')
    throw error
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/lib/observability/with-form-tracking.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Apply to the auth funnel in `src/app/sign-in.tsx`**

Add the import near the top (after the existing imports):

```ts
import { withFormTracking } from '@/lib/observability/analytics'
```

Replace the `onSignIn` handler with:

```tsx
      onSignIn={async (v) => {
        const result = await withFormTracking('sign_in', () =>
          signInWithPasswordFn({ data: v }),
        )
        if (!result.success) return 'otp'
        navigateAfterAuth(result.isNewUser)
      }}
```

Replace the `onSignUp` handler with:

```tsx
      onSignUp={async (v) => {
        await withFormTracking('sign_up', () =>
          signUpFn({ data: { email: v.email, password: v.password, name: v.name } }),
        )
        // Dev mock: no real email is sent, so skip the verify-code screen.
        if (import.meta.env.VITE_MOCK_AUTH === 'true') navigateAfterAuth(true)
      }}
```

(The wrapper rethrows on error, so the auth shell's existing error display is unchanged.)

- [ ] **Step 6: Typecheck, lint, commit**

```bash
yarn typecheck && yarn lint && yarn test src/__tests__/lib/observability/with-form-tracking.test.ts
git add src/lib/observability/analytics.ts src/app/sign-in.tsx src/__tests__/lib/observability/with-form-tracking.test.ts
git commit -m "feat(analytics): track sign-in/sign-up submissions via withFormTracking"
```

---

### Task 2: Footer social + contact-email click tracking

**Files:**
- Modify: `src/features/home/sections/Sections.tsx` (`FooterSection` — the `FOOTER_SOCIALS.map` anchors and the contact-email anchor)
- Test: `src/__tests__/features/home/footer-social-tracking.test.tsx`

**Interfaces:**
- Consumes: `trackSocialClick(platform, url)` from `@/lib/observability/analytics`.
- Produces: footer social/contact anchors call `trackSocialClick(label, href)` on click without changing navigation.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/home/footer-social-tracking.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ trackSocialClick: vi.fn() }))
vi.mock('@/lib/observability/analytics', () => ({
  trackSocialClick: mocks.trackSocialClick,
}))
// Footer link columns use the router Link; stub it as a plain anchor.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to?: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}))

import { FooterSection } from '@/features/home/sections/Sections'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FooterSection social tracking', () => {
  it('tracks the GitHub social click with label + href', () => {
    render(<FooterSection />)
    fireEvent.click(screen.getByLabelText('GitHub'))
    expect(mocks.trackSocialClick).toHaveBeenCalledWith(
      'GitHub',
      'https://github.com/Nelson-Lamounier',
    )
  })

  it('tracks the contact email link', () => {
    render(<FooterSection />)
    fireEvent.click(screen.getByText('support@tucaken.com'))
    expect(mocks.trackSocialClick).toHaveBeenCalledWith(
      'Email',
      'mailto:support@tucaken.com',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/footer-social-tracking.test.tsx`
Expected: FAIL — no `onClick`/tracking on the anchors yet.

- [ ] **Step 3: Add the import**

At the top of `src/features/home/sections/Sections.tsx`, add (next to the other imports):

```ts
import { trackSocialClick } from '@/lib/observability/analytics'
```

- [ ] **Step 4: Wire the social icons**

In `FooterSection`, update the `FOOTER_SOCIALS.map` anchor to add an `onClick` (keep all existing attributes):

```tsx
              {FOOTER_SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  onClick={() => trackSocialClick(label, href)}
                  target={href.startsWith('mailto:') ? undefined : '_blank'}
                  rel="noreferrer"
                  aria-label={label}
                  className="flex size-9 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition-colors hover:border-teal-500/40 hover:text-white"
                >
                  <Icon className="size-4" />
                </a>
              ))}
```

- [ ] **Step 5: Wire the contact-email link**

Update the contact-email anchor in `FooterSection`:

```tsx
              <a
                href="mailto:support@tucaken.com"
                onClick={() => trackSocialClick('Email', 'mailto:support@tucaken.com')}
                className="mt-2 inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-white"
              >
                support@tucaken.com
                <ArrowUpRight className="size-3" />
              </a>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/footer-social-tracking.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Typecheck, lint, commit**

```bash
yarn typecheck && yarn lint && yarn test src/__tests__/features/home/footer-social-tracking.test.tsx
git add src/features/home/sections/Sections.tsx src/__tests__/features/home/footer-social-tracking.test.tsx
git commit -m "feat(analytics): track footer social and contact-email clicks"
```

---

### Task 3: Hero + Header CTA tracking

**Files:**
- Modify: `src/features/home/sections/HeroSection.tsx` (hero primary CTA `onClick`)
- Modify: `src/features/home/HomePage.tsx` (export `Header`; add tracking to "Sign in" and "Try free")
- Test: `src/__tests__/features/home/cta-tracking.test.tsx`

**Interfaces:**
- Consumes: `trackCtaClick(ctaName, location)`; `usePageTransition()` returning `{ transitionTo, isPending }`; `hero.primaryCta` (string) from the home content module.
- Produces: `export function Header()` from `HomePage.tsx`; hero + header CTAs call `trackCtaClick` before `transitionTo`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/home/cta-tracking.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ trackCtaClick: vi.fn(), transitionTo: vi.fn() }))
vi.mock('@/lib/observability/analytics', () => ({ trackCtaClick: mocks.trackCtaClick }))
vi.mock('@/contexts/PageTransition', () => ({
  usePageTransition: () => ({ transitionTo: mocks.transitionTo, isPending: false }),
}))

import { HeroSection } from '@/features/home/sections/HeroSection'
import { Header } from '@/features/home/HomePage'
import { hero } from '@/features/home/content'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CTA tracking', () => {
  it('hero primary CTA tracks (primaryCta label, hero) and still navigates', () => {
    render(<HeroSection />)
    fireEvent.click(screen.getByText(new RegExp(hero.primaryCta, 'i')))
    expect(mocks.trackCtaClick).toHaveBeenCalledWith(hero.primaryCta, 'hero')
    expect(mocks.transitionTo).toHaveBeenCalled()
  })

  it('header "Try free" tracks (Try free, header)', () => {
    render(<Header />)
    fireEvent.click(screen.getByText('Try free'))
    expect(mocks.trackCtaClick).toHaveBeenCalledWith('Try free', 'header')
  })

  it('header "Sign in" tracks (Sign in, header)', () => {
    render(<Header />)
    fireEvent.click(screen.getByText('Sign in'))
    expect(mocks.trackCtaClick).toHaveBeenCalledWith('Sign in', 'header')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/cta-tracking.test.tsx`
Expected: FAIL — `Header` is not exported / tracking not called.

- [ ] **Step 3: Wire the hero CTA**

In `src/features/home/sections/HeroSection.tsx`, add the import:

```ts
import { trackCtaClick } from '@/lib/observability/analytics'
```

Update the hero `RippleButton`:

```tsx
            <RippleButton
              onClick={() => {
                trackCtaClick(hero.primaryCta, 'hero')
                transitionTo({ to: '/sign-in' })
              }}
            >
              {hero.primaryCta} <ArrowRight className="h-4 w-4" />
            </RippleButton>
```

(`hero` is already imported in this file for `hero.primaryCta`; if not, import it from the same content module already used for `hero.eyebrow`/`hero.headlineLead`.)

- [ ] **Step 4: Export `Header` and wire its CTAs**

In `src/features/home/HomePage.tsx`, add the import:

```ts
import { trackCtaClick } from '@/lib/observability/analytics'
```

Change `function Header()` to `export function Header()`, and update the two buttons:

```tsx
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              trackCtaClick('Sign in', 'header')
              transitionTo({ to: '/sign-in' })
            }}
            className="hidden text-base font-normal uppercase tracking-wide text-zinc-300 transition-colors hover:text-white disabled:opacity-60 md:block"
          >
            Sign in
          </button>
          <RippleButton
            onClick={() => {
              trackCtaClick('Try free', 'header')
              transitionTo({ to: '/sign-in' })
            }}
          >
            Try free
          </RippleButton>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/cta-tracking.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
yarn typecheck && yarn lint && yarn test src/__tests__/features/home/cta-tracking.test.tsx
git add src/features/home/sections/HeroSection.tsx src/features/home/HomePage.tsx src/__tests__/features/home/cta-tracking.test.tsx
git commit -m "feat(analytics): track hero and header CTA clicks"
```

---

### Task 4: Pricing tier CTA tracking

**Files:**
- Modify: `src/features/home/sections/Sections.tsx` (`PricingSection` tier CTA `onClick`)
- Test: `src/__tests__/features/home/pricing-cta-tracking.test.tsx`

**Interfaces:**
- Consumes: `trackCtaClick(ctaName, location)`; `usePageTransition()`; `tiersFromPublic(undefined)` returns the static default `TIERS` (first tier `{ id: 'free', cta: 'Start free' }`); `tierCtaTarget(tier)`.
- Produces: each pricing tier CTA calls `trackCtaClick(tier.cta, \`pricing_${tier.id}\`)` before `transitionTo(tierCtaTarget(tier))`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/home/pricing-cta-tracking.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ trackCtaClick: vi.fn(), transitionTo: vi.fn() }))
vi.mock('@/lib/observability/analytics', () => ({ trackCtaClick: mocks.trackCtaClick }))
vi.mock('@/contexts/PageTransition', () => ({
  usePageTransition: () => ({ transitionTo: mocks.transitionTo, isPending: false }),
}))
// No real network: return undefined so tiersFromPublic falls back to default TIERS.
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }))

import { PricingSection } from '@/features/home/sections/Sections'
import { tiersFromPublic } from '@/features/billing/catalog'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PricingSection CTA tracking', () => {
  it('tracks a tier CTA with (tier.cta, pricing_<id>) and navigates', () => {
    const tiers = tiersFromPublic(undefined)
    const first = tiers[0]
    render(<PricingSection />)
    fireEvent.click(screen.getByText(first.cta))
    expect(mocks.trackCtaClick).toHaveBeenCalledWith(first.cta, `pricing_${first.id}`)
    expect(mocks.transitionTo).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/pricing-cta-tracking.test.tsx`
Expected: FAIL — tracking not called on the tier CTA.

- [ ] **Step 3: Add the `trackCtaClick` import and wire the pricing CTA**

`Sections.tsx` already imports `trackSocialClick` (Task 2). Update that import to also bring in `trackCtaClick`:

```ts
import { trackCtaClick, trackSocialClick } from '@/lib/observability/analytics'
```

Then in `PricingSection`, update the tier `MagneticButton`:

```tsx
              <MagneticButton
                primary={t.highlighted}
                className="mt-7 w-full"
                onClick={() => {
                  trackCtaClick(t.cta, `pricing_${t.id}`)
                  transitionTo(tierCtaTarget(t))
                }}
              >
                {t.cta}
              </MagneticButton>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/pricing-cta-tracking.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck, lint, full suite, commit**

```bash
yarn typecheck && yarn lint && yarn test
git add src/features/home/sections/Sections.tsx src/__tests__/features/home/pricing-cta-tracking.test.tsx
git commit -m "feat(analytics): track pricing tier CTA clicks"
```

(Run the full suite here since this is the last task — confirm nothing regressed.)

---

## Notes / out of scope

- `trackArticleView` and `trackEvent` stay dormant by decision (no public blog; generic helper unused).
- Dashboard/product analytics (project views, comments, outbound dev links), Stripe checkout completion, and any blog/contact-form build are out of scope.
- Manual check (optional, after merge + a real measurement ID locally): with `yarn dev`, accept the cookie banner, then watch GA Realtime / the `dataLayer` while clicking a CTA, a footer social link, and submitting sign-in — events `cta_click`, `social_click`, `form_submission` should fire; with consent rejected, none should.

## Self-review

- **Spec coverage:** CTA hero (Task 3), CTA header (Task 3), CTA pricing (Task 4), footer social + contact (Task 2), sign-in/sign-up submission (Task 1). Dormant helpers explicitly excluded — matches spec scope.
- **Type consistency:** `withFormTracking<T>(formName, run)` defined in Task 1 and used identically in `sign-in.tsx`. `trackCtaClick(name, location)` / `trackSocialClick(platform, url)` used with the existing signatures throughout. `trackCtaClick` import added once (Task 2) and reused in Task 4 (same file) — Task 3 adds it to the other two files.
- **Placeholder scan:** every code/test step has complete code and an exact command with expected result; no TBD/TODO.
