# GA4 + Faro RUM with EU/UK cookie consent — design

- **Date:** 2026-06-27
- **Status:** Approved (pending spec review)
- **Worktree/branch:** `feat/analytics-consent`
- **Author:** Nelson Lamounier (with Claude)

## Summary

Add Google Analytics 4 to tucaken-app behind a GDPR/PECR-compliant cookie
consent system, using Google Consent Mode v2. The same consent gate also
governs Grafana Faro RUM (enabled as part of this work). A granular preferences
panel exposes three categories — Necessary (locked on), Analytics, and a
Marketing placeholder — so the system is future-proof for advertising without a
rebuild.

## Compliance stance (hard requirements)

The product serves users in **Ireland (EU GDPR + ePrivacy Directive)** and the
**UK (UK GDPR + PECR)**. These are non-negotiable:

- **Default denied.** Every non-essential signal defaults to `denied`. No GA
  cookies, no Faro identifiers, and **no `gtag.js` network request** before the
  user opts in.
- **Prior consent.** Analytics/marketing storage only after an explicit,
  affirmative action. Pre-checked boxes are not consent.
- **Equal prominence.** "Reject all" carries the same visual weight as
  "Accept all" in the banner.
- **Granular + withdrawable.** Per-category toggles; the user can reopen
  preferences and withdraw consent at any time, with withdrawal honoured
  immediately.
- **Consent Mode v2.** Consent defaults are set *before* `gtag.js` loads;
  opt-in/withdrawal issue `gtag('consent', 'update', …)`.
- **Re-consent.** A `version` field in the persisted store lets us re-prompt if
  the policy/categories change.

## Consent category model

| Category  | Default            | Consent Mode v2 signals                              | Gates today              |
|-----------|--------------------|------------------------------------------------------|--------------------------|
| Necessary | always on (locked) | `security_storage`, `functionality_storage`          | session, theme, consent  |
| Analytics | denied             | `analytics_storage`                                  | GA4 + Faro RUM           |
| Marketing | denied (placeholder)| `ad_storage`, `ad_user_data`, `ad_personalization`  | nothing yet (future ads) |

Marketing is wired through the store, the Consent Mode mapping, and the
preferences panel, but gates no scripts today. When advertising is added later,
it reads the existing `marketing` signal — no schema change.

## Architecture & components

```
src/features/consent/
  types.ts                   # ConsentCategory, ConsentSignals, ConsentState
  store.ts                   # Zustand + persist — single source of truth
  consent-mode.ts            # gtag stub + Consent Mode v2 default/update mapping
  use-consent.ts             # hook: read state, accept/reject all, set category, reopen
  components/
    ConsentBanner.tsx        # Accept all / Reject all / Manage preferences
    ConsentPreferences.tsx   # per-category toggles (Necessary locked, Analytics, Marketing)
    CookiePreferencesLink.tsx# footer entry point to reopen preferences
  __tests__/

src/lib/observability/
  ga4.ts                     # NEW — loads gtag.js, runs config, SPA page_view; consent-aware
  analytics.ts               # EXISTING — typed event helpers (unchanged; now actually fed)
  faro-admin.ts              # EDIT — init only when Analytics consent === 'granted'
```

### Single source of truth

`src/features/consent/store.ts` — Zustand with `persist` middleware,
localStorage key `tucaken-consent`. Shape (conceptual):

```ts
type ConsentValue = 'granted' | 'denied'
interface ConsentState {
  analytics?: ConsentValue   // undefined = undecided -> banner shows
  marketing?: ConsentValue   // undefined = undecided
  version: number            // bump to force re-consent
  decided: boolean           // true once user has actioned the banner
}
```

`partialize` persists only `analytics`, `marketing`, `version`, `decided`.
Necessary is implicit (always granted) and never stored as toggleable.

### Effect chain

store change → `consent-mode.ts` emits `gtag('consent', 'update', …)` →
`ga4.ts` lazy-loads `gtag.js` on first Analytics grant → `analytics.ts` helpers
work → `faro-admin.ts` init guarded by the same signal.

### CSP-friendly loading (no inline `<head>` script)

The repo applies a strict, per-request **nonce** CSP in production
(`src/server/patches.ts`). Rather than inject an inline Consent Mode bootstrap
into `src/app/__root.tsx` (which would need the nonce threaded through and fights
the existing `ANTI_FLASH_SCRIPT` pattern), a single **client module**:

1. Sets `consent: 'default'` = all denied into the `dataLayer` stub, then
2. Lazy-injects `gtag.js` only after the first Analytics grant.

Ordering is guaranteed because it is one sequential module — defaults are always
set before GA initialises. This keeps CSP untouched beyond the allow-list
additions below.

## Data flow

1. App hydrates → `consent-mode.ts` pushes `consent: 'default'` (all denied).
2. `ConsentBanner` renders only when `decided === false`.
3. **Accept all** → store sets `analytics` and `marketing` = `granted` →
   `consent: 'update'` granted → `ga4.ts` injects `gtag.js?id=G-XXX` (async) →
   `analytics.ts` helpers active → Faro inits.
4. **Reject all** → store sets both `denied`, `decided = true`, banner closes,
   nothing loads.
5. **Manage preferences** → `ConsentPreferences` panel with per-category
   toggles; Save persists the chosen mix.
6. **SPA page views** → subscribe to TanStack Router
   (`router.subscribe('onResolved', …)`) to send a `page_view` per navigation
   (GA4 does not auto-track client-side route changes). Only active when
   Analytics is granted.
7. **Withdrawal** → "Cookie preferences" footer link reopens the panel;
   flipping Analytics off issues `consent: 'update'` denied immediately and
   stops further events. (Already-loaded `gtag.js` stays in memory but sends
   nothing once denied — standard Consent Mode behaviour.)

## CSP & environment changes

### CSP (`src/server/security-header-values.ts`)

- `script-src`: add `https://www.googletagmanager.com`
- `connect-src`: add `https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com`
- `img-src`: already permits `https:` (GA collect beacons OK)

### Environment

- New `VITE_` vars (matching existing `VITE_FARO_*` / `VITE_STRIPE_*` pattern,
  sourced from SSM `/tucaken-app/<env>/vite/` at build):
  - `VITE_GA4_MEASUREMENT_ID=G-XXXXXXX`
  - `VITE_GA4_ENABLED=true`
- Add the same keys to the committed env example/template.
- **No-op when unset:** if `VITE_GA4_MEASUREMENT_ID` is empty or
  `VITE_GA4_ENABLED !== 'true'`, GA never loads (consent banner still works so
  the consent record exists). Keeps dev/preview clean.

### Faro

- Flip `VITE_FARO_ENABLED=true`; keep `faro-admin.ts` init behind Analytics
  consent.
- **Runtime dependency (flagged):** Faro will only transmit once
  `VITE_FARO_URL` / the `/faro/collect` collector and SSM params are in place.
  Enabling the flag wires the consent-gated code path; it does not by itself
  guarantee data arrives. Track separately.

## Error handling & resilience

- `gtag.js` load failure is caught and logged via the Pino logger
  (`src/lib/observability`); it never throws into render.
- All telemetry calls guard on `window.gtag` and SSR (`typeof window`), which
  `analytics.ts` already does.
- Script injection is **idempotent** — repeated grants never add a second tag.
- No `console.*` in app code; no `Math.random()` for any id.

## Theming & UX

- Banner and panel built from the existing `Button` primitive +
  `motion/react`; no new UI dependency.
- Tokens: `bg-zinc-50 dark:bg-zinc-900`, `text-zinc-900 dark:text-zinc-100`,
  `border-zinc-300 dark:border-zinc-700`, accent `teal-600` / `teal-400`,
  `rounded-md`, `font-sans`. Correct in light and dark mode (existing `.dark`
  class on `<html>`).
- Entrance: slide-up via `AnimatePresence`; respects `prefers-reduced-motion`.
- Copy in English (UK), product referred to as "Tucaken".

## Testing (Vitest, colocated)

- **store:** default undecided; accept-all grants both; reject-all denies both;
  per-category set; withdrawal; persistence round-trip; version bump forces
  re-consent.
- **consent-mode:** emits `consent default` (denied) before any update; emits
  correct `update` payload per category; signal mapping correct.
- **ga4:** injects script only after Analytics grant; idempotent; no-op when ID
  unset; `page_view` sent on router resolve only when granted.
- **faro-admin:** does not init when Analytics denied; inits when granted.
- **ConsentBanner:** renders only when `decided === false`; Reject equals Accept
  in prominence (both rendered, both enabled).

Quality gates: `yarn typecheck && yarn lint && yarn test` clean; SonarCloud
rules respected (no nested ternaries, guard clauses, `Set` for category lists,
no redundant casts).

## Out of scope

- A standalone privacy/cookie policy page (content task; the banner links to
  wherever that page lives).
- Server-side GA Measurement Protocol / sGTM.
- Actually shipping advertising scripts (Marketing category is a placeholder).
- Provisioning the GA4 property and the Faro collector/SSM params (ops tasks);
  the code is a no-op until those exist.

## Build sequence (high level)

1. Consent feature slice: `types`, `store`, `consent-mode`, `use-consent` (+ tests).
2. Consent UI: `ConsentBanner`, `ConsentPreferences`, `CookiePreferencesLink`.
3. GA4 loader `ga4.ts` + SPA `page_view` wiring (+ tests).
4. Faro gating + enable flag.
5. CSP allow-list + env vars/example.
6. Mount banner in `__root.tsx`; footer link.
7. Full verification + manual golden-path check in `yarn dev`.
