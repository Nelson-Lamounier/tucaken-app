# Design: Legal pages (Terms, Privacy, Cookies)

**Date:** 2026-06-30
**Status:** Approved (design); pending implementation plan
**Branch:** `worktree-feat+terms-and-conditions`

## Context

Tucaken is a candidate-facing AI product that generates a user's resume from
their own supplied evidence (GitHub repos, professional history). It processes a
large amount of personal data, charges via Stripe, and serves EU and UK users.

The app already ships a mature cookie-consent system (`src/features/consent/`,
Consent Mode v2, `analytics`/`marketing` categories, banner + preferences), but
the banner links to `/privacy` — a route that does not yet exist (a dead link at
[ConsentBanner.tsx:38](../../../src/features/consent/components/ConsentBanner.tsx#L38)).
No `/terms`, `/privacy`, or `/cookies` page exists today.

### Constraints (from the user)

- **No solicitor review.** Copy must be minimal, honest, and conservative —
  include only clauses that genuinely protect the operator or are legally
  required. Avoid over-promising (uptime, outcomes) and unenforceable
  disclaimers (US-style "as is, zero liability"), which add risk rather than
  remove it.
- **Operator:** Tucaken Resumes (sole trader; no registered company yet).
- **Contact:** support@tucaken.com.
- **Governing law:** Ireland (DPC lead supervisory authority; Irish courts).
- **No free trial.** The 14-day item is the statutory cooling-off / right of
  withdrawal, not a trial; handled via immediate-performance consent.
- **All three documents** in scope: Terms, Privacy Policy, Cookie Policy.

### Non-goals

- This is not legal advice and not a substitute for professional review.
- No MDX/markdown pipeline (over-engineered for three pages).
- No new design-system work; reuse existing tokens and layout patterns.

## Architecture

A new feature slice `src/features/legal/` owns all shared rendering and content.
Routes stay thin (directory-based, per the repo's routing-migration rule). Each
document is **data** (a typed `LegalDoc`), rendered by one shared `LegalPage`
shell, so the three pages cannot visually drift.

```
src/features/legal/
  config.ts                 # single source of operator facts
  types.ts                  # LegalDoc / LegalSection shapes
  components/
    LegalPage.tsx           # shared shell: title, "Last updated", TOC anchors, prose styling, cross-links
    LegalSection.tsx        # one anchored <section> with heading + body
  content/
    terms.tsx               # Terms & Conditions sections
    privacy.tsx             # Privacy Policy sections
    cookies.tsx             # Cookie Policy sections

src/app/
  terms/route.tsx           # /terms   -> <LegalPage doc={termsDoc} />
  privacy/route.tsx         # /privacy -> <LegalPage doc={privacyDoc} />
  cookies/route.tsx         # /cookies -> <LegalPage doc={cookiesDoc} />
```

### `types.ts`

```ts
export interface LegalSection {
  /** Stable anchor id, e.g. "ai-output". Used for the TOC and deep links. */
  id: string
  heading: string
  body: ReactNode
}

export interface LegalDoc {
  title: string
  /** ISO date string; rendered as "Last updated". */
  lastUpdated: string
  intro?: ReactNode
  sections: LegalSection[]
}
```

### `config.ts` — single source of truth

All operator-specific facts live in one module so a future company registration
is a one-line change. Content modules read from `LEGAL`; they never hard-code the
name/email in prose.

```ts
export const LEGAL = {
  operator: 'Tucaken Resumes',
  contactEmail: 'support@tucaken.com',
  jurisdiction: 'Ireland',
  euAuthority: 'Data Protection Commission (Ireland)',
  ukAuthority: "Information Commissioner's Office (UK)",
  lastUpdated: '2026-06-30',
} as const
```

## Content outline (minimal, honest, UK English)

### `/terms` — Terms & Conditions

1. **Who we are** — Tucaken Resumes; contact email.
2. **Eligibility** — 16+; user warrants they have the right to submit/connect the
   data they provide (including GitHub).
3. **Acceptable use** — no scraping/reverse-engineering; no submission of third
   parties' personal data without rights; no unlawful content.
4. **AI output disclaimer (load-bearing)** — resumes are AI-generated from the
   user's own supplied evidence; output may contain inaccuracies or omissions;
   the user is responsible for reviewing and verifying all generated content
   before use; no guarantee of employment, interviews, or accuracy/completeness.
5. **Intellectual property** — operator owns the platform/software; the user owns
   their input data and the generated resume; operator takes a limited licence
   only to process it to deliver the service.
6. **Third-party services** — GitHub connection/authorisation; AI processing via
   AWS / Amazon Bedrock; payments via Stripe.
7. **Billing & cancellation** — paid subscriptions; cancel anytime to stop future
   billing; cooling-off handled via express consent to immediate performance of a
   digital service (no free trial); statutory consumer rights unaffected.
8. **Liability** — limited to the extent permitted by law; explicitly does **not**
   exclude liability for death/personal injury from negligence or for
   non-excludable statutory consumer rights. No US-style blanket exclusion.
9. **Changes, suspension/termination, governing law** — Ireland; EU consumers
   retain the mandatory protections of their home country where applicable.

### `/privacy` — Privacy Policy (GDPR + UK GDPR, one policy naming both)

1. **Controller identity & contact** — Tucaken Resumes, support@tucaken.com.
2. **Data we process** — account/auth (Cognito); data connected from GitHub;
   profile/professional information; billing metadata via Stripe (Stripe holds
   card data, the operator does not). Note that special-category data can creep
   into free-text fields.
3. **Lawful basis per purpose** — contract for core resume generation; consent
   for analytics/marketing (matching the existing consent categories).
4. **Sub-processors & international transfers** — AWS/Bedrock, GitHub, Stripe,
   Cognito; SCCs / UK addendum where data leaves the EU/UK.
5. **Automated processing** — skill extraction/enrichment described plainly; not a
   solely-automated decision with legal/significant effect (the user decides how
   to use their resume); transparency about the logic offered.
6. **Retention & rights** — access, rectification, erasure, portability,
   objection; how to exercise; right to complain to the DPC (EU) / ICO (UK).

### `/cookies` — Cookie Policy (wired to the existing consent system)

1. **What cookies we use** — necessary (always on); analytics & marketing only
   with consent — mirrors `ConsentCategory` (`analytics` | `marketing`).
2. **Managing preferences** — links to the existing cookie-preferences control
   (`CookiePreferencesLink`) to re-open the banner and change choices.

## Wiring & integration

- Fix the dead `/privacy` link in `ConsentBanner.tsx` (now resolves) and point
  the banner's cookie reference at `/cookies`.
- Cross-link the three documents in each `LegalPage` footer
  (Terms <-> Privacy <-> Cookies).
- Add a small "Legal" cluster of links reachable from existing layout patterns
  (no new design-system work).
- One honest line per page: "This document was last updated on {date}.
  Questions: support@tucaken.com." No "pending solicitor review" banner.

## Styling

- Tailwind v4 tokens only (no arbitrary hex). `font-heading` (Geist) for the doc
  title and section headings; Inter body. `rounded-md` surfaces. Correct in light
  **and** dark mode.
- Public-page shell follows the `/pricing` route pattern (`min-h-dvh`, themed
  background) rather than the dashboard layout.

## Testing

Vitest unit tests per route asserting:

- the route renders its document title;
- every section `id` anchor is present in the DOM;
- config-driven facts (operator name, contact email) render in the output.

A cheap regression guard that the pages stay wired and the operator facts render.

Final gate: `yarn typecheck && yarn lint && yarn test`, plus manual `yarn dev`
check of all three routes in light and dark mode.

## Open items for user review

- The cooling-off / immediate-performance wording (section 7 of Terms) — confirm
  acceptable, or adjust the billing stance.
- Whether to keep the Cookie Policy as a separate page or fold it into Privacy
  (current design: separate, so the consent banner links to it directly).
