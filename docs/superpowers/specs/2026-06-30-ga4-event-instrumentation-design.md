# GA4 public-funnel event instrumentation — design

- **Date:** 2026-06-30
- **Status:** Approved (pending spec review)
- **Worktree/branch:** `feat/ga4-event-instrumentation`
- **Author:** Nelson Lamounier (with Claude)

## Summary

Wire the dormant GA4 event helpers in `src/lib/observability/analytics.ts` to
their real call sites on the **public marketing surface**, so the acquisition
funnel is captured once GA4 is live. Builds on the merged consent feature
(PR #207): every helper already guards on `window.gtag`, which only exists after
Analytics consent loads GA4 — so these events are consent-safe by construction
and need no extra gating.

## Scope (confirmed)

- **In scope:** CTA clicks (hero, header, pricing tiers), footer social/contact
  clicks, and sign-in / sign-up form submissions (success + error).
- **Out of scope / left dormant:**
  - `trackArticleView` — no public article/blog page exists (only an auth-gated
    admin preview). Leave dormant; wire when a public blog ships.
  - `trackEvent` — generic fallback; keep unused (YAGNI).
  - Dashboard/product analytics: project detail views, comment submissions,
    outbound dev-resource links (LeetCode/GitHub), Stripe checkout completion.
  - No contact form is built (none exists today).
- `trackResumeDownload` is already wired (resume components) — untouched.

## Event map

| Helper | Call site | Args |
|---|---|---|
| `trackCtaClick` | Hero primary CTA — `src/features/home/sections/HeroSection.tsx` | `('Connect GitHub', 'hero')` (use `hero.primaryCta` value) |
| `trackCtaClick` | Header "Sign in" + "Try free" — `src/features/home/HomePage.tsx` | `('Sign in', 'header')` / `('Try free', 'header')` |
| `trackCtaClick` | Pricing tier CTAs — `src/features/home/sections/Sections.tsx` (`PricingSection`, also serves `/pricing`) | `(tier.cta, ` + "`pricing_${tier.id}`" + `)` |
| `trackSocialClick` | Footer social icons + contact email — `src/features/home/sections/Sections.tsx` (`FooterSection`) | `(label, href)` |
| `trackFormSubmission` | Sign-in success/error | `('sign_in', 'success' \| 'error')` |
| `trackFormSubmission` | Sign-up success/error | `('sign_up', 'success' \| 'error')` |

## Approach

- **Consent safety:** no new gating. `sendEvent` in `analytics.ts` returns early
  when `window.gtag` is absent (SSR or pre-consent), so every added call is a
  silent no-op until the user opts in and GA4 loads.
- **CTAs:** invoke `trackCtaClick(...)` at the start of each existing `onClick`,
  before `transitionTo(...)`. GA beacons are async, so firing before client
  navigation is safe. Pricing CTAs are wired once in `PricingSection`; the
  standalone `/pricing` route reuses that component, so both are covered.
- **Social:** add an `onClick` to the footer anchor elements (the
  `FOOTER_SOCIALS.map` icons and the standalone contact-email link), passing the
  `label`/`href` already in scope. Tracking does not change navigation.
- **Forms:** fire on the real outcome, not the raw DOM submit. Hook the
  sign-in/sign-up submit mutation's success and error paths so `'success'` vs
  `'error'` reflects the actual auth result. The implementation will trace where
  each form resolves (mutation `onSuccess`/`onError` or the page-level submit
  callback) and fire there.
- **Identifiers:** all required values (`hero.primaryCta`, static CTA labels,
  `tier.cta`/`tier.id`, social `label`/`href`, form names) are already in scope
  at each site — no fetching or transformation.

## Error handling

Tracking calls are fire-and-forget and already internally guarded; they must
never throw into a click/submit handler or block navigation/auth. No try/catch
needed around `track*` calls (the helpers do not throw), but tracking must not
be placed where an exception would interrupt the user action.

## Testing

Each call site gets a focused Vitest test that mocks
`src/lib/observability/analytics.ts`, renders the component (jsdom), simulates
the interaction, and asserts the helper was called with the exact arguments:

- CTAs: click → assert `trackCtaClick` called with `(name, location)`.
- Pricing: render tiers → click a tier CTA → assert `(tier.cta, ` + "`pricing_${id}`" + `)`.
- Social: click a footer link → assert `trackSocialClick(label, href)`; assert
  navigation/`href` still intact.
- Forms: mock the auth mutation → success path asserts
  `trackFormSubmission('sign_in'|'sign_up', 'success')`; error path asserts
  `'error'`.

No GA/network involved. Quality gates: `yarn typecheck && yarn lint && yarn test`
clean; SonarCloud rules respected (no nested ternaries, guard clauses, no
redundant casts, stable keys, no `console.*`).

## Out of scope

Building a blog/article page or contact form, dashboard product analytics,
Stripe checkout completion tracking, and any change to the consent system or GA4
loader (already shipped in PR #207).
