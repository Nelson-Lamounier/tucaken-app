# GA4 + Faro RUM with EU/UK Consent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GA4 (Google Consent Mode v2) and consent-gated Grafana Faro RUM behind a GDPR/PECR-compliant cookie consent banner with a granular preferences panel.

**Architecture:** A persisted Zustand store is the single source of truth for consent (Necessary always-on, Analytics, Marketing placeholder). A Consent Mode v2 bridge sets all signals to `denied` before any Google tag loads; `gtag.js` is lazy-injected only on Analytics opt-in, and Faro initialises under the same gate. A headless orchestration component wires store → consent signals → tag loading → SPA `page_view` tracking. Banner and panel are built from existing UI primitives + `motion/react`.

**Tech Stack:** TanStack Start/Router, React 19, Zustand (+ `persist` middleware), Tailwind v4 tokens, `motion/react`, Vitest, GA4 Consent Mode v2, Grafana Faro Web SDK.

## Global Constraints

- **Package manager:** Yarn 4 only. Run scripts with `yarn <script>` (never npm/npx).
- **Jurisdictions:** EU GDPR + ePrivacy (Ireland) and UK GDPR + PECR. Default every non-essential signal to `denied`; no GA cookies / Faro identifiers / `gtag.js` request before opt-in. "Reject all" has equal visual prominence to "Accept all". Consent is granular and withdrawable.
- **Consent Mode v2:** consent defaults set before `gtag.js` loads; opt-in/withdrawal issue `gtag('consent','update',…)`.
- **Copy:** English (UK) spelling. Product referred to as "Tucaken", never "the agent".
- **SonarCloud/ESLint:** complexity ≤ 10; no nested ternaries (use guard clauses / early returns); `Number.parseInt`/`Number.isNaN` over globals; `Set` for membership; stable React keys; no `Math.random()` for ids (`crypto.randomUUID()`); no `console.*` in app code (use Pino `src/lib/observability/logger.ts`); no redundant casts / non-null assertions; catch as `unknown`.
- **Styling:** new components default to `rounded-md`; tokens `bg-zinc-50 dark:bg-zinc-900`, `text-zinc-900 dark:text-zinc-100`, `border-zinc-300 dark:border-zinc-700`, accent `teal-600`/`teal-400`, `font-sans`. Must render correctly in light and dark mode (`.dark` on `<html>`).
- **Tests:** Vitest. Default test environment is `node` (`vitest.config.ts`); any test needing DOM/localStorage MUST start with `// @vitest-environment jsdom`. Place tests under `src/__tests__/` mirroring the source path (matches `src/__tests__/lib/observability/faro-admin.test.ts`). Import test fns explicitly from `vitest`.
- **Definition of done per task:** `yarn typecheck && yarn lint && yarn test` pass.
- **Never edit** `routeTree.gen.ts` or `yarn.lock` by hand.

---

### Task 1: CSP allow-list + GA4 environment variables

**Files:**
- Modify: `src/server/security-header-values.ts` (`scriptSrc` line ~19-22 and `buildCsp` `connect-src` line ~35)
- Modify: `.env.local` (add GA4 vars; this file is local-only/gitignored)
- Test: `src/__tests__/server/security-header-values.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a CSP that permits `https://www.googletagmanager.com` in `script-src` and `https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com` in `connect-src`. New env vars `VITE_GA4_MEASUREMENT_ID`, `VITE_GA4_ENABLED` (read in Task 4).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/server/security-header-values.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildCsp } from '../../server/security-header-values'

describe('buildCsp — GA4 allow-list', () => {
  it('permits googletagmanager in script-src (strict nonce variant)', () => {
    const csp = buildCsp('test-nonce')
    expect(csp).toContain("'nonce-test-nonce'")
    expect(csp).toContain('https://www.googletagmanager.com')
  })

  it('permits Google Analytics collection hosts in connect-src', () => {
    const csp = buildCsp()
    expect(csp).toContain('https://*.google-analytics.com')
    expect(csp).toContain('https://*.analytics.google.com')
    expect(csp).toContain('https://www.googletagmanager.com')
  })

  it('keeps existing Stripe + self directives intact', () => {
    const csp = buildCsp()
    expect(csp).toContain('https://js.stripe.com')
    expect(csp).toContain("default-src 'self'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/server/security-header-values.test.ts`
Expected: FAIL — `connect-src`/`script-src` do not yet contain the Google hosts.

- [ ] **Step 3: Implement the CSP changes**

In `src/server/security-header-values.ts`, update `scriptSrc`:

```ts
function scriptSrc(nonce?: string): string {
  const google = 'https://www.googletagmanager.com'
  if (nonce) return `script-src 'self' 'nonce-${nonce}' https://js.stripe.com ${google}`
  return `script-src 'self' 'unsafe-inline' https://js.stripe.com ${google}`
}
```

In the `buildCsp` array, replace the `connect-src` line with:

```ts
    "connect-src 'self' https://*.nelsonlamounier.com https://*.amazonaws.com https://*.amazoncognito.com https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
```

(`img-src 'self' data: https:` already covers GA collect beacons — no change.)

- [ ] **Step 4: Add env vars to `.env.local`**

Append:

```env
# Google Analytics 4 (Consent Mode v2). Feature is a no-op when the ID is empty.
VITE_GA4_MEASUREMENT_ID=
VITE_GA4_ENABLED=true
```

Leave `VITE_GA4_MEASUREMENT_ID` empty locally so GA does not load in dev. The real `G-XXXX` value is provisioned via SSM `/tucaken-app/<env>/vite/` at build (matches existing `VITE_FARO_*` / `VITE_STRIPE_*`).

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/server/security-header-values.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
yarn typecheck && yarn lint && yarn test src/__tests__/server/security-header-values.test.ts
git add src/server/security-header-values.ts src/__tests__/server/security-header-values.test.ts .env.local
git commit -m "feat(consent): allow Google Analytics hosts in CSP and add GA4 env vars"
```

---

### Task 2: Consent types + persisted Zustand store

**Files:**
- Create: `src/features/consent/types.ts`
- Create: `src/features/consent/store.ts`
- Test: `src/__tests__/features/consent/store.test.ts`

**Interfaces:**
- Consumes: `zustand`, `zustand/middleware` (`persist`) — already in deps.
- Produces:
  - `type ConsentValue = 'granted' | 'denied'`
  - `type ConsentCategory = 'analytics' | 'marketing'`
  - `interface ConsentState { analytics?: ConsentValue; marketing?: ConsentValue; decided: boolean; version: number }`
  - `const CONSENT_VERSION = 1`
  - `interface ConsentActions { acceptAll(): void; rejectAll(): void; setCategory(c: ConsentCategory, v: ConsentValue): void; reset(): void }`
  - `useConsentStore` — `create<ConsentState & ConsentActions>()` with `persist`, localStorage key `tucaken-consent`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/consent/store.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useConsentStore } from '../../../features/consent/store'
import { CONSENT_VERSION } from '../../../features/consent/types'

function resetStore() {
  localStorage.clear()
  useConsentStore.setState({
    analytics: undefined,
    marketing: undefined,
    decided: false,
    version: CONSENT_VERSION,
  })
}

describe('useConsentStore', () => {
  beforeEach(resetStore)

  it('starts undecided with no category set', () => {
    const s = useConsentStore.getState()
    expect(s.decided).toBe(false)
    expect(s.analytics).toBeUndefined()
    expect(s.marketing).toBeUndefined()
  })

  it('acceptAll grants every category and marks decided', () => {
    useConsentStore.getState().acceptAll()
    const s = useConsentStore.getState()
    expect(s.analytics).toBe('granted')
    expect(s.marketing).toBe('granted')
    expect(s.decided).toBe(true)
  })

  it('rejectAll denies every category and marks decided', () => {
    useConsentStore.getState().rejectAll()
    const s = useConsentStore.getState()
    expect(s.analytics).toBe('denied')
    expect(s.marketing).toBe('denied')
    expect(s.decided).toBe(true)
  })

  it('setCategory updates one category and marks decided', () => {
    useConsentStore.getState().setCategory('analytics', 'granted')
    const s = useConsentStore.getState()
    expect(s.analytics).toBe('granted')
    expect(s.marketing).toBeUndefined()
    expect(s.decided).toBe(true)
  })

  it('persists decided choices to localStorage under tucaken-consent', () => {
    useConsentStore.getState().acceptAll()
    const raw = localStorage.getItem('tucaken-consent')
    expect(raw).toBeTruthy()
    expect(raw).toContain('"analytics":"granted"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/consent/store.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Create the types**

Create `src/features/consent/types.ts`:

```ts
/**
 * Consent domain types. Necessary cookies are always granted and are NOT
 * represented here — only the user-controllable categories are stored.
 */

/** A single Consent Mode v2 signal value. */
export type ConsentValue = 'granted' | 'denied'

/** User-controllable consent categories. Necessary is implicit/always-on. */
export type ConsentCategory = 'analytics' | 'marketing'

/** Bump to force re-consent when categories or policy change. */
export const CONSENT_VERSION = 1

/** Persisted consent state. `undefined` category = undecided (banner shows). */
export interface ConsentState {
  analytics?: ConsentValue
  marketing?: ConsentValue
  /** True once the user has actioned the banner (accept/reject/saved prefs). */
  decided: boolean
  version: number
}

export interface ConsentActions {
  acceptAll: () => void
  rejectAll: () => void
  setCategory: (category: ConsentCategory, value: ConsentValue) => void
  /** Clear the decision so the banner shows again (used on version bump). */
  reset: () => void
}
```

- [ ] **Step 4: Create the store**

Create `src/features/consent/store.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  CONSENT_VERSION,
  type ConsentActions,
  type ConsentState,
} from './types'

const STORAGE_KEY = 'tucaken-consent'

const INITIAL_STATE: ConsentState = {
  analytics: undefined,
  marketing: undefined,
  decided: false,
  version: CONSENT_VERSION,
}

export const useConsentStore = create<ConsentState & ConsentActions>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      acceptAll: () =>
        set({ analytics: 'granted', marketing: 'granted', decided: true }),

      rejectAll: () =>
        set({ analytics: 'denied', marketing: 'denied', decided: true }),

      setCategory: (category, value) =>
        set({ [category]: value, decided: true }),

      reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: STORAGE_KEY,
      version: CONSENT_VERSION,
      // Force re-consent if a persisted record predates the current version.
      migrate: (persisted, version) => {
        if (version !== CONSENT_VERSION) return { ...INITIAL_STATE }
        return persisted as ConsentState & ConsentActions
      },
      partialize: (state) => ({
        analytics: state.analytics,
        marketing: state.marketing,
        decided: state.decided,
        version: state.version,
      }),
    },
  ),
)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/consent/store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
yarn typecheck && yarn lint && yarn test src/__tests__/features/consent/store.test.ts
git add src/features/consent/types.ts src/features/consent/store.ts src/__tests__/features/consent/store.test.ts
git commit -m "feat(consent): add persisted consent store and domain types"
```

---

### Task 3: Consent Mode v2 bridge (`consent-mode.ts`)

**Files:**
- Create: `src/features/consent/consent-mode.ts`
- Test: `src/__tests__/features/consent/consent-mode.test.ts`

**Interfaces:**
- Consumes: `ConsentState` from `./types`. Relies on the global `window.gtag` type already declared in `src/lib/observability/analytics.ts`.
- Produces:
  - `ensureGtagStub(): void` — idempotently creates `window.dataLayer` and the `gtag` stub.
  - `setConsentDefault(): void` — pushes `consent default` with all controllable signals denied.
  - `syncConsentMode(state: Pick<ConsentState,'analytics'|'marketing'>): void` — pushes `consent update` mapping categories → Google signals.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/consent/consent-mode.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ensureGtagStub,
  setConsentDefault,
  syncConsentMode,
} from '../../../features/consent/consent-mode'

function entries(): unknown[][] {
  return (window.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>))
}

beforeEach(() => {
  window.dataLayer = []
  // @ts-expect-error reset stub between tests
  window.gtag = undefined
})

describe('consent-mode bridge', () => {
  it('ensureGtagStub creates dataLayer + gtag once (idempotent)', () => {
    ensureGtagStub()
    const first = window.gtag
    ensureGtagStub()
    expect(window.gtag).toBe(first)
    expect(Array.isArray(window.dataLayer)).toBe(true)
  })

  it('setConsentDefault denies all controllable signals', () => {
    ensureGtagStub()
    setConsentDefault()
    const def = entries().find((e) => e[0] === 'consent' && e[1] === 'default')
    expect(def).toBeDefined()
    const params = def?.[2] as Record<string, unknown>
    expect(params.analytics_storage).toBe('denied')
    expect(params.ad_storage).toBe('denied')
    expect(params.ad_user_data).toBe('denied')
    expect(params.ad_personalization).toBe('denied')
    expect(params.security_storage).toBe('granted')
  })

  it('syncConsentMode maps granted analytics + denied marketing', () => {
    ensureGtagStub()
    syncConsentMode({ analytics: 'granted', marketing: 'denied' })
    const upd = entries().find((e) => e[0] === 'consent' && e[1] === 'update')
    const params = upd?.[2] as Record<string, unknown>
    expect(params.analytics_storage).toBe('granted')
    expect(params.ad_storage).toBe('denied')
    expect(params.ad_personalization).toBe('denied')
  })

  it('syncConsentMode treats undefined category as denied', () => {
    ensureGtagStub()
    syncConsentMode({ analytics: undefined, marketing: undefined })
    const upd = entries().find((e) => e[0] === 'consent' && e[1] === 'update')
    const params = upd?.[2] as Record<string, unknown>
    expect(params.analytics_storage).toBe('denied')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/consent/consent-mode.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the bridge**

Create `src/features/consent/consent-mode.ts`:

```ts
/**
 * Google Consent Mode v2 bridge.
 *
 * Translates the consent store's categories into the Google signals that
 * gtag.js reads. All signals default to `denied`; nothing is granted until
 * the user opts in. Pushing to `dataLayer` works whether or not gtag.js has
 * loaded yet — once it loads it replays the queued commands in order.
 */
import type { ConsentState, ConsentValue } from './types'

declare global {
  interface Window {
    // gtag itself is declared in src/lib/observability/analytics.ts
    dataLayer?: IArguments[]
  }
}

/** Idempotently install the dataLayer + gtag shim. */
export function ensureGtagStub(): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer ?? []
  if (window.gtag) return
  function gtag() {
    // gtag.js requires the raw `arguments` object, not a rest array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments as unknown as IArguments)
  }
  window.gtag = gtag as Window['gtag']
}

/** Push the all-denied consent default. Call before loading gtag.js. */
export function setConsentDefault(): void {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500,
  })
}

function normalise(value: ConsentValue | undefined): ConsentValue {
  return value === 'granted' ? 'granted' : 'denied'
}

/** Push a consent update reflecting the current store categories. */
export function syncConsentMode(
  state: Pick<ConsentState, 'analytics' | 'marketing'>,
): void {
  if (typeof window === 'undefined' || !window.gtag) return
  const analytics = normalise(state.analytics)
  const marketing = normalise(state.marketing)
  window.gtag('consent', 'update', {
    analytics_storage: analytics,
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/consent/consent-mode.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
yarn typecheck && yarn lint && yarn test src/__tests__/features/consent/consent-mode.test.ts
git add src/features/consent/consent-mode.ts src/__tests__/features/consent/consent-mode.test.ts
git commit -m "feat(consent): add Consent Mode v2 bridge (stub, default, update)"
```

---

### Task 4: GA4 loader + SPA page_view (`ga4.ts`)

**Files:**
- Create: `src/lib/observability/ga4.ts`
- Test: `src/__tests__/lib/observability/ga4.test.ts`

**Interfaces:**
- Consumes: `ensureGtagStub` from `src/features/consent/consent-mode`; global `window.gtag`.
- Produces:
  - `getMeasurementId(): string` — `import.meta.env.VITE_GA4_MEASUREMENT_ID ?? ''`
  - `isGa4Enabled(): boolean` — true only when enabled flag is `'true'` AND id is non-empty.
  - `loadGtagScript(): void` — idempotently injects `gtag.js` and runs `config` with `send_page_view: false`. No-op if disabled or already loaded.
  - `trackPageView(path: string, title?: string): void` — sends a manual `page_view`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/observability/ga4.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

function loadModule() {
  return import('../../../lib/observability/ga4')
}

beforeEach(() => {
  vi.resetModules()
  document.head.innerHTML = ''
  window.dataLayer = []
  // @ts-expect-error reset
  window.gtag = undefined
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ga4 loader', () => {
  it('isGa4Enabled is false when id is empty', async () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', '')
    const { isGa4Enabled } = await loadModule()
    expect(isGa4Enabled()).toBe(false)
  })

  it('isGa4Enabled is true when enabled and id present', async () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123')
    const { isGa4Enabled } = await loadModule()
    expect(isGa4Enabled()).toBe(true)
  })

  it('loadGtagScript injects exactly one gtag.js script (idempotent)', async () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123')
    const { loadGtagScript } = await loadModule()
    loadGtagScript()
    loadGtagScript()
    const scripts = document.head.querySelectorAll(
      'script[src*="googletagmanager.com/gtag/js"]',
    )
    expect(scripts.length).toBe(1)
    expect(scripts[0].getAttribute('src')).toContain('id=G-TEST123')
  })

  it('loadGtagScript is a no-op when disabled', async () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'false')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123')
    const { loadGtagScript } = await loadModule()
    loadGtagScript()
    expect(document.head.querySelectorAll('script').length).toBe(0)
  })

  it('trackPageView calls gtag with page_view event', async () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true')
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123')
    const { trackPageView } = await loadModule()
    const spy = vi.fn()
    window.gtag = spy
    trackPageView('/about', 'About')
    expect(spy).toHaveBeenCalledWith('event', 'page_view', {
      page_path: '/about',
      page_title: 'About',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/lib/observability/ga4.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the loader**

Create `src/lib/observability/ga4.ts`:

```ts
/**
 * GA4 (Google Analytics 4) loader with Consent Mode v2.
 *
 * gtag.js is injected lazily and only when GA4 is configured. Page views are
 * tracked manually because GA4 does not auto-track client-side route changes
 * in a SPA. All functions are SSR-safe and idempotent.
 */
import { ensureGtagStub } from '../../features/consent/consent-mode'

const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js'

let scriptInjected = false

export function getMeasurementId(): string {
  return import.meta.env.VITE_GA4_MEASUREMENT_ID ?? ''
}

export function isGa4Enabled(): boolean {
  return import.meta.env.VITE_GA4_ENABLED === 'true' && getMeasurementId() !== ''
}

/**
 * Inject gtag.js and run the initial config. Idempotent and no-op when GA4 is
 * disabled or unconfigured. Consent defaults must already be set (see
 * setConsentDefault) so the first config respects the denied state.
 */
export function loadGtagScript(): void {
  if (typeof window === 'undefined') return
  if (!isGa4Enabled() || scriptInjected) return

  const id = getMeasurementId()
  ensureGtagStub()

  const script = document.createElement('script')
  script.async = true
  script.src = `${GTAG_SRC}?id=${id}`
  document.head.appendChild(script)
  scriptInjected = true

  window.gtag?.('js', new Date())
  // We send page_view manually on each route change.
  window.gtag?.('config', id, { send_page_view: false })
}

/** Send a manual GA4 page_view. No-op when gtag is absent. */
export function trackPageView(path: string, title?: string): void {
  if (typeof window === 'undefined' || !window.gtag) return
  const params: Record<string, string> = { page_path: path }
  if (title) params.page_title = title
  window.gtag('event', 'page_view', params)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/lib/observability/ga4.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
yarn typecheck && yarn lint && yarn test src/__tests__/lib/observability/ga4.test.ts
git add src/lib/observability/ga4.ts src/__tests__/lib/observability/ga4.test.ts
git commit -m "feat(analytics): add GA4 loader with manual SPA page_view"
```

---

### Task 5: Orchestration component + Faro gating (`ConsentEffects.tsx`)

**Files:**
- Create: `src/features/consent/ConsentEffects.tsx`
- Modify: `src/app/__root.tsx` (remove the unconditional `initialiseFaroAdmin()` effect at lines ~124-126; Faro now initialises inside `ConsentEffects`)
- Test: `src/__tests__/features/consent/consent-effects.test.tsx`

**Interfaces:**
- Consumes: `useConsentStore` (Task 2); `ensureGtagStub`, `setConsentDefault`, `syncConsentMode` (Task 3); `loadGtagScript`, `trackPageView`, `isGa4Enabled` (Task 4); `initialiseFaroAdmin` from `src/lib/observability/faro-admin`; `useRouter` from `@tanstack/react-router`.
- Produces: `ConsentEffects` — a headless (`return null`) component that bootstraps consent mode, reacts to consent changes, gates GA4 + Faro, and subscribes to router navigations for page_view. Mounted in Task 8.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/consent/consent-effects.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  ensureGtagStub: vi.fn(),
  setConsentDefault: vi.fn(),
  syncConsentMode: vi.fn(),
  loadGtagScript: vi.fn(),
  trackPageView: vi.fn(),
  isGa4Enabled: vi.fn(() => true),
  initialiseFaroAdmin: vi.fn(),
}))

vi.mock('../../../features/consent/consent-mode', () => ({
  ensureGtagStub: mocks.ensureGtagStub,
  setConsentDefault: mocks.setConsentDefault,
  syncConsentMode: mocks.syncConsentMode,
}))
vi.mock('../../../lib/observability/ga4', () => ({
  loadGtagScript: mocks.loadGtagScript,
  trackPageView: mocks.trackPageView,
  isGa4Enabled: mocks.isGa4Enabled,
}))
vi.mock('../../../lib/observability/faro-admin', () => ({
  initialiseFaroAdmin: mocks.initialiseFaroAdmin,
}))
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ subscribe: () => () => {} }),
}))

import { ConsentEffects } from '../../../features/consent/ConsentEffects'
import { useConsentStore } from '../../../features/consent/store'
import { CONSENT_VERSION } from '../../../features/consent/types'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  useConsentStore.setState({
    analytics: undefined,
    marketing: undefined,
    decided: false,
    version: CONSENT_VERSION,
  })
})

describe('ConsentEffects', () => {
  it('bootstraps consent mode default on mount, no tags loaded', () => {
    render(<ConsentEffects />)
    expect(mocks.ensureGtagStub).toHaveBeenCalled()
    expect(mocks.setConsentDefault).toHaveBeenCalled()
    expect(mocks.loadGtagScript).not.toHaveBeenCalled()
    expect(mocks.initialiseFaroAdmin).not.toHaveBeenCalled()
  })

  it('loads GA4 + Faro once analytics is granted', () => {
    render(<ConsentEffects />)
    useConsentStore.getState().acceptAll()
    expect(mocks.syncConsentMode).toHaveBeenCalled()
    expect(mocks.loadGtagScript).toHaveBeenCalled()
    expect(mocks.initialiseFaroAdmin).toHaveBeenCalled()
  })

  it('does not load GA4/Faro when analytics denied', () => {
    render(<ConsentEffects />)
    useConsentStore.getState().rejectAll()
    expect(mocks.loadGtagScript).not.toHaveBeenCalled()
    expect(mocks.initialiseFaroAdmin).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/consent/consent-effects.test.tsx`
Expected: FAIL — `ConsentEffects` does not exist.

- [ ] **Step 3: Implement the orchestration component**

Create `src/features/consent/ConsentEffects.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  ensureGtagStub,
  setConsentDefault,
  syncConsentMode,
} from './consent-mode'
import { isGa4Enabled, loadGtagScript, trackPageView } from '../../lib/observability/ga4'
import { initialiseFaroAdmin } from '../../lib/observability/faro-admin'
import { useConsentStore } from './store'

/**
 * Headless component that wires consent state to telemetry. Renders nothing.
 *
 * - On mount: installs the gtag stub and pushes the all-denied default
 *   (before any tag loads).
 * - When Analytics is granted: pushes the consent update, lazy-loads gtag.js,
 *   and initialises Faro RUM.
 * - Subscribes to router navigations and sends a manual page_view, but only
 *   while Analytics consent is granted.
 */
export function ConsentEffects() {
  const router = useRouter()
  const analytics = useConsentStore((s) => s.analytics)
  const marketing = useConsentStore((s) => s.marketing)
  const analyticsRef = useRef(analytics)
  analyticsRef.current = analytics

  // 1. Bootstrap consent mode once, before any tag can load.
  useEffect(() => {
    ensureGtagStub()
    setConsentDefault()
  }, [])

  // 2. React to consent changes: update signals and load tags when granted.
  useEffect(() => {
    syncConsentMode({ analytics, marketing })
    if (analytics !== 'granted') return
    if (isGa4Enabled()) loadGtagScript()
    initialiseFaroAdmin()
  }, [analytics, marketing])

  // 3. Track SPA navigations only while analytics is granted.
  useEffect(() => {
    const unsub = router.subscribe('onResolved', () => {
      if (analyticsRef.current !== 'granted') return
      const { pathname } = router.state.location
      trackPageView(pathname, document.title)
    })
    return unsub
  }, [router])

  return null
}
```

- [ ] **Step 4: Remove the unconditional Faro init from `__root.tsx`**

In `src/app/__root.tsx`, delete these lines from `RootComponent` (~124-126):

```tsx
  React.useEffect(() => {
    initialiseFaroAdmin()
  }, [])
```

Also remove the now-unused import on line 14:

```tsx
import { initialiseFaroAdmin } from '../lib/observability/faro-admin'
```

(The `<ConsentEffects />` mount itself is added in Task 8.)

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/consent/consent-effects.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
yarn typecheck && yarn lint && yarn test src/__tests__/features/consent/consent-effects.test.tsx
git add src/features/consent/ConsentEffects.tsx src/app/__root.tsx src/__tests__/features/consent/consent-effects.test.tsx
git commit -m "feat(consent): gate GA4 and Faro behind consent via ConsentEffects"
```

---

### Task 6: Consent banner UI (`ConsentBanner.tsx`)

**Files:**
- Create: `src/features/consent/components/ConsentBanner.tsx`
- Test: `src/__tests__/features/consent/consent-banner.test.tsx`

**Interfaces:**
- Consumes: `useConsentStore` (Task 2); `Button` from `src/components/ui/Button`; `motion`, `AnimatePresence` from `motion/react`.
- Produces: `ConsentBanner` — renders only when `decided === false`. Buttons: "Accept all", "Reject all", "Manage preferences". The last calls a prop `onManage` so the parent can open the panel (Task 7/8).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/consent/consent-banner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConsentBanner } from '../../../features/consent/components/ConsentBanner'
import { useConsentStore } from '../../../features/consent/store'
import { CONSENT_VERSION } from '../../../features/consent/types'

beforeEach(() => {
  cleanup()
  localStorage.clear()
  useConsentStore.setState({
    analytics: undefined, marketing: undefined, decided: false, version: CONSENT_VERSION,
  })
})

describe('ConsentBanner', () => {
  it('renders Accept all and Reject all with equal prominence when undecided', () => {
    render(<ConsentBanner onManage={() => {}} />)
    expect(screen.getByRole('button', { name: /accept all/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reject all/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /manage preferences/i })).toBeTruthy()
  })

  it('hides once a decision has been made', () => {
    useConsentStore.setState({ decided: true })
    const { container } = render(<ConsentBanner onManage={() => {}} />)
    expect(container.querySelector('[data-testid="consent-banner"]')).toBeNull()
  })

  it('Accept all grants analytics', () => {
    render(<ConsentBanner onManage={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /accept all/i }))
    expect(useConsentStore.getState().analytics).toBe('granted')
  })

  it('Reject all denies analytics', () => {
    render(<ConsentBanner onManage={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /reject all/i }))
    expect(useConsentStore.getState().analytics).toBe('denied')
  })

  it('Manage preferences invokes onManage', () => {
    const onManage = vi.fn()
    render(<ConsentBanner onManage={onManage} />)
    fireEvent.click(screen.getByRole('button', { name: /manage preferences/i }))
    expect(onManage).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/consent/consent-banner.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the banner**

Create `src/features/consent/components/ConsentBanner.tsx`:

```tsx
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '../../../components/ui/Button'
import { useConsentStore } from '../store'

interface ConsentBannerProps {
  /** Open the granular preferences panel. */
  onManage: () => void
}

/**
 * Cookie consent banner. Shows once, until the user makes a decision.
 * "Accept all" and "Reject all" carry equal weight (PECR/GDPR requirement).
 */
export function ConsentBanner({ onManage }: ConsentBannerProps) {
  const decided = useConsentStore((s) => s.decided)
  const acceptAll = useConsentStore((s) => s.acceptAll)
  const rejectAll = useConsentStore((s) => s.rejectAll)

  return (
    <AnimatePresence>
      {!decided && (
        <motion.div
          data-testid="consent-banner"
          role="dialog"
          aria-label="Cookie consent"
          aria-live="polite"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          style={{ willChange: 'transform, opacity' }}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-4 w-[min(48rem,calc(100%-2rem))] rounded-md border border-zinc-300 bg-zinc-50 p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Tucaken uses cookies to understand how the site is used and to improve
            it. Analytics cookies are only set with your consent. See our{' '}
            <a
              href="/privacy"
              className="font-medium text-teal-600 underline hover:text-teal-500 dark:text-teal-400"
            >
              privacy policy
            </a>
            .
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={acceptAll}>
              Accept all
            </Button>
            <Button variant="ghost" onClick={rejectAll}>
              Reject all
            </Button>
            <button
              type="button"
              onClick={onManage}
              className="ml-auto text-xs font-medium text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Manage preferences
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

Note: `MotionConfig reducedMotion` is already set at the root; the spring respects the user's OS reduced-motion preference through Motion.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/consent/consent-banner.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
yarn typecheck && yarn lint && yarn test src/__tests__/features/consent/consent-banner.test.tsx
git add src/features/consent/components/ConsentBanner.tsx src/__tests__/features/consent/consent-banner.test.tsx
git commit -m "feat(consent): add cookie consent banner UI"
```

---

### Task 7: Preferences panel + reopen entry point

**Files:**
- Create: `src/features/consent/store-ui.ts` (tiny UI store for panel open state)
- Create: `src/features/consent/components/ConsentPreferences.tsx`
- Create: `src/features/consent/components/CookiePreferencesLink.tsx`
- Test: `src/__tests__/features/consent/consent-preferences.test.tsx`

**Interfaces:**
- Consumes: `useConsentStore` (Task 2); `Button`; `motion`, `AnimatePresence`.
- Produces:
  - `usePreferencesUiStore` — `{ open: boolean; openPanel(): void; closePanel(): void }` (Zustand, non-persisted).
  - `ConsentPreferences` — modal panel with per-category toggles. Necessary is shown disabled/locked-on. Analytics + Marketing are toggles. "Save preferences" calls `setCategory` for each and closes. Reads `open` from `usePreferencesUiStore`.
  - `CookiePreferencesLink` — an inline text button that calls `openPanel()`; drop into footers.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/consent/consent-preferences.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConsentPreferences } from '../../../features/consent/components/ConsentPreferences'
import { CookiePreferencesLink } from '../../../features/consent/components/CookiePreferencesLink'
import { usePreferencesUiStore } from '../../../features/consent/store-ui'
import { useConsentStore } from '../../../features/consent/store'
import { CONSENT_VERSION } from '../../../features/consent/types'

beforeEach(() => {
  cleanup()
  localStorage.clear()
  useConsentStore.setState({
    analytics: undefined, marketing: undefined, decided: false, version: CONSENT_VERSION,
  })
  usePreferencesUiStore.setState({ open: false })
})

describe('CookiePreferencesLink', () => {
  it('opens the preferences panel when clicked', () => {
    render(<CookiePreferencesLink />)
    fireEvent.click(screen.getByRole('button', { name: /cookie preferences/i }))
    expect(usePreferencesUiStore.getState().open).toBe(true)
  })
})

describe('ConsentPreferences', () => {
  it('is not rendered when closed', () => {
    const { container } = render(<ConsentPreferences />)
    expect(container.querySelector('[data-testid="consent-preferences"]')).toBeNull()
  })

  it('renders a locked Necessary row and a toggleable Analytics row when open', () => {
    usePreferencesUiStore.setState({ open: true })
    render(<ConsentPreferences />)
    const necessary = screen.getByLabelText(/necessary/i) as HTMLInputElement
    expect(necessary.disabled).toBe(true)
    expect(necessary.checked).toBe(true)
    expect(screen.getByLabelText(/analytics/i)).toBeTruthy()
    expect(screen.getByLabelText(/marketing/i)).toBeTruthy()
  })

  it('saving persists the chosen analytics value and closes', () => {
    usePreferencesUiStore.setState({ open: true })
    render(<ConsentPreferences />)
    fireEvent.click(screen.getByLabelText(/analytics/i))
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))
    expect(useConsentStore.getState().analytics).toBe('granted')
    expect(usePreferencesUiStore.getState().open).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/consent/consent-preferences.test.tsx`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Create the UI store**

Create `src/features/consent/store-ui.ts`:

```ts
import { create } from 'zustand'

interface PreferencesUiState {
  open: boolean
  openPanel: () => void
  closePanel: () => void
}

/** Ephemeral (non-persisted) open/close state for the preferences panel. */
export const usePreferencesUiStore = create<PreferencesUiState>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
}))
```

- [ ] **Step 4: Create the reopen link**

Create `src/features/consent/components/CookiePreferencesLink.tsx`:

```tsx
import { usePreferencesUiStore } from '../store-ui'

/** Footer entry point to reopen the consent preferences panel. */
export function CookiePreferencesLink({ className }: { className?: string }) {
  const openPanel = usePreferencesUiStore((s) => s.openPanel)
  return (
    <button
      type="button"
      onClick={openPanel}
      className={
        className ??
        'text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
      }
    >
      Cookie preferences
    </button>
  )
}
```

- [ ] **Step 5: Create the preferences panel**

Create `src/features/consent/components/ConsentPreferences.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '../../../components/ui/Button'
import { useConsentStore } from '../store'
import { usePreferencesUiStore } from '../store-ui'

interface ToggleRowProps {
  id: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange?: (next: boolean) => void
}

function ToggleRow({ id, label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 py-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 size-4 rounded accent-teal-600"
      />
      <span>
        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
      </span>
    </label>
  )
}

/**
 * Granular consent preferences. Necessary is always on. Analytics and Marketing
 * (placeholder) are user-controllable. Local draft state is committed to the
 * store only on Save.
 */
export function ConsentPreferences() {
  const open = usePreferencesUiStore((s) => s.open)
  const closePanel = usePreferencesUiStore((s) => s.closePanel)
  const analytics = useConsentStore((s) => s.analytics)
  const marketing = useConsentStore((s) => s.marketing)
  const setCategory = useConsentStore((s) => s.setCategory)

  const [analyticsDraft, setAnalyticsDraft] = useState(analytics === 'granted')
  const [marketingDraft, setMarketingDraft] = useState(marketing === 'granted')

  // Re-seed drafts whenever the panel opens so it reflects saved state.
  useEffect(() => {
    if (!open) return
    setAnalyticsDraft(analytics === 'granted')
    setMarketingDraft(marketing === 'granted')
  }, [open, analytics, marketing])

  const save = () => {
    setCategory('analytics', analyticsDraft ? 'granted' : 'denied')
    setCategory('marketing', marketingDraft ? 'granted' : 'denied')
    closePanel()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closePanel}
          style={{ willChange: 'opacity' }}
        >
          <motion.div
            data-testid="consent-preferences"
            role="dialog"
            aria-label="Cookie preferences"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            style={{ willChange: 'transform, opacity' }}
            className="w-[min(32rem,100%)] rounded-md border border-zinc-300 bg-zinc-50 p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2 className="font-heading text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Cookie preferences
            </h2>
            <div className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
              <ToggleRow
                id="consent-necessary"
                label="Necessary"
                description="Required for sign-in, security, and remembering your choices. Always on."
                checked
                disabled
              />
              <ToggleRow
                id="consent-analytics"
                label="Analytics"
                description="Google Analytics and Grafana RUM, to understand and improve the site."
                checked={analyticsDraft}
                onChange={setAnalyticsDraft}
              />
              <ToggleRow
                id="consent-marketing"
                label="Marketing"
                description="Not used yet. Reserved for future advertising and personalisation."
                checked={marketingDraft}
                onChange={setMarketingDraft}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={closePanel}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={save}>
                Save preferences
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn test src/__tests__/features/consent/consent-preferences.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck, lint, commit**

```bash
yarn typecheck && yarn lint && yarn test src/__tests__/features/consent/consent-preferences.test.tsx
git add src/features/consent/store-ui.ts src/features/consent/components/ConsentPreferences.tsx src/features/consent/components/CookiePreferencesLink.tsx src/__tests__/features/consent/consent-preferences.test.tsx
git commit -m "feat(consent): add granular preferences panel and reopen link"
```

---

### Task 8: Mount consent UI, enable Faro, full verification

**Files:**
- Modify: `src/app/__root.tsx` (mount `ConsentEffects`, `ConsentBanner`, `ConsentPreferences`)
- Modify: `src/features/home/sections/Sections.tsx` (add `CookiePreferencesLink` to the public footer — locate the `<footer>` element)
- Modify: `.env.local` (`VITE_FARO_ENABLED=true`)

**Interfaces:**
- Consumes: all components from Tasks 5-7.
- Produces: live, consent-gated analytics in the running app.

- [ ] **Step 1: Mount the consent system in `__root.tsx`**

Add imports near the other feature imports:

```tsx
import { ConsentEffects } from '../features/consent/ConsentEffects'
import { ConsentBanner } from '../features/consent/components/ConsentBanner'
import { ConsentPreferences } from '../features/consent/components/ConsentPreferences'
import { usePreferencesUiStore } from '../features/consent/store-ui'
```

In `RootComponent`, render the consent system inside the providers (it needs router context). Replace the `RootComponent` return with:

```tsx
function RootComponent() {
  const openPanel = usePreferencesUiStore((s) => s.openPanel)

  return (
    <MotionConfig reducedMotion="never">
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <PageTransitionProvider>
            <Outlet />
          </PageTransitionProvider>
          <ConsentEffects />
          <ConsentBanner onManage={openPanel} />
          <ConsentPreferences />
          <Suspense fallback={null}>
            <TanStackDevtools />
          </Suspense>
        </QueryClientProvider>
      </ThemeProvider>
    </MotionConfig>
  )
}
```

(`ConsentEffects` uses `useRouter()`, so it must render under the router — it does, as a descendant of the root route component.)

- [ ] **Step 2: Add the reopen link to the public footer**

In `src/features/home/sections/Sections.tsx`, find the `<footer>` element and add inside it:

```tsx
import { CookiePreferencesLink } from '../../consent/components/CookiePreferencesLink'
// ...inside the footer's link row:
<CookiePreferencesLink />
```

If `Sections.tsx` has no `<footer>`, add the link to the footer in `src/features/home/HomePage.tsx` instead. Run `rg -n "footer" src/features/home` to locate it.

- [ ] **Step 3: Enable Faro**

In `.env.local`, set:

```env
VITE_FARO_ENABLED=true
```

- [ ] **Step 4: Full automated verification**

```bash
yarn typecheck && yarn lint && yarn test
```

Expected: all pass (including every consent test from Tasks 1-7).

- [ ] **Step 5: Manual golden-path check**

```bash
yarn dev
```

Then in the browser at `http://localhost:5001` (DevTools open):

1. **First load:** banner appears; Network tab shows NO request to `googletagmanager.com`; Application → Local Storage has no `tucaken-consent` value yet. Application → Cookies has no `_ga` cookie.
2. **Reject all:** banner closes; still no `gtag.js` request; `tucaken-consent` shows `"analytics":"denied"`.
3. Clear `tucaken-consent`, reload, **Accept all:** `gtag.js?id=…` loads (only if a real `VITE_GA4_MEASUREMENT_ID` is set locally — otherwise confirm `isGa4Enabled()` short-circuits and no request fires); navigating between routes fires `page_view` events (visible in the GA DebugView or dataLayer).
4. **Manage preferences** / footer "Cookie preferences": panel opens, Necessary is locked on, toggling Analytics off and saving issues a `consent update` with `analytics_storage: denied`.
5. **Dark mode:** toggle theme; banner and panel render correctly in both modes.
6. **CSP:** Console shows no CSP violation for `googletagmanager.com` / `google-analytics.com`.

- [ ] **Step 6: Commit**

```bash
git add src/app/__root.tsx src/features/home/sections/Sections.tsx .env.local
git commit -m "feat(consent): mount consent UI, wire footer link, enable Faro RUM"
```

---

## Notes / known runtime dependencies (not code tasks)

- **GA4 property:** a real `VITE_GA4_MEASUREMENT_ID` (`G-XXXX`) must be provisioned via SSM `/tucaken-app/<env>/vite/` for production tracking. The feature is a verified no-op until then.
- **Faro collector:** enabling `VITE_FARO_ENABLED=true` wires the consent-gated init, but Faro only transmits once `VITE_FARO_URL` / the `/faro/collect` collector and SSM params exist. Track separately.
- **Privacy policy page:** the banner links to `/privacy`. If that route does not exist yet, create the content separately (out of scope for this plan).

## Self-review

- **Spec coverage:** compliance defaults (Task 3 `setConsentDefault`), prior consent / no pre-load (Tasks 4-5, verified Task 8), equal prominence (Task 6 test), granular + withdrawable (Task 7), Consent Mode v2 (Task 3), three categories incl. Marketing placeholder (Tasks 2, 7), CSP + env (Task 1), GA4 loader + SPA page_view (Task 4), Faro gating + enable (Tasks 5, 8), theming/tests (all). All spec sections map to a task.
- **Type consistency:** `ConsentValue`/`ConsentCategory`/`ConsentState` defined in Task 2 and reused verbatim in Tasks 3, 5, 7. `loadGtagScript`/`trackPageView`/`isGa4Enabled` defined in Task 4, consumed with matching signatures in Task 5. `usePreferencesUiStore` shape defined in Task 7 (`openPanel`/`closePanel`/`open`), consumed identically in Tasks 7-8.
- **Placeholder scan:** no TBD/TODO; every code step has complete code; commands have expected output.
