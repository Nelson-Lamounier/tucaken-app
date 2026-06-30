# Legal Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three minimal, honest legal pages — `/terms`, `/privacy`, `/cookies` — from one reusable shell, and wire the existing cookie banner to the real pages.

**Architecture:** A new `src/features/legal/` slice. Each document is data (a typed `LegalDoc`) rendered by one presentational `LegalPage` shell, so the three pages cannot visually drift. Three thin directory-based routes each pass their doc to `LegalPage`.

**Tech Stack:** TanStack Start/Router (directory-based routes), React 19, Tailwind v4 tokens, Vitest + @testing-library/react (happy-dom).

## Global Constraints

- Copy is **minimal, honest, conservative**; UK English; no non-ASCII diacritics. No solicitor review — say nothing untrue, promise no outcomes/uptime, exclude nothing that consumer law makes non-excludable.
- Operator name, contact email, jurisdiction, and authorities come **only** from `src/features/legal/config.ts` (`LEGAL`) — never hard-coded in prose.
- Operator: `Tucaken Resumes`. Contact: `support@tucaken.com`. Jurisdiction: `Ireland`. `lastUpdated`: `2026-06-30`. No free trial.
- Product name in user-facing copy is **Tucaken**, never "the agent".
- Tailwind v4 tokens only — no arbitrary hex. `font-heading` (Geist) for the doc title and section headings; Inter body. `rounded-md` surfaces. Must render correctly in **light and dark** mode.
- New routes are **directory-based** (`src/app/<seg>/route.tsx`), never flat-file.
- Tests live under `src/__tests__/**` (vitest `include` glob) and need a per-file `/** @vitest-environment happy-dom */` header (default env is `node`).
- Cross-document and contact links use plain `<a href>` (legal pages are low-traffic; this keeps the shell router-free and unit-testable). Internal section links use `#anchor`.
- No `console.*`; no `as any`; prefer early returns; `Set.has` for membership; stable React keys (use section `id`, never index).
- Before "done": `yarn typecheck && yarn lint && yarn test`.

---

## File Structure

- `src/features/legal/types.ts` — `LegalSlug`, `LegalSection`, `LegalDoc` shapes.
- `src/features/legal/config.ts` — `LEGAL` constant (operator facts).
- `src/features/legal/components/LegalSection.tsx` — one anchored `<section>`.
- `src/features/legal/components/LegalPage.tsx` — shell: title, last-updated, TOC, sections, cross-links.
- `src/features/legal/content/terms.tsx` — `termsDoc`.
- `src/features/legal/content/privacy.tsx` — `privacyDoc`.
- `src/features/legal/content/cookies.tsx` — `cookiesDoc`.
- `src/app/terms/route.tsx`, `src/app/privacy/route.tsx`, `src/app/cookies/route.tsx` — thin routes.
- `src/features/consent/components/ConsentBanner.tsx` — modify (privacy link already correct target `/privacy`; add cookie-policy link).
- Tests under `src/__tests__/features/legal/`.

---

### Task 1: Shell, types, and config

**Files:**
- Create: `src/features/legal/types.ts`
- Create: `src/features/legal/config.ts`
- Create: `src/features/legal/components/LegalSection.tsx`
- Create: `src/features/legal/components/LegalPage.tsx`
- Test: `src/__tests__/features/legal/LegalPage.test.tsx`

**Interfaces:**
- Produces: `LegalSlug = 'terms' | 'privacy' | 'cookies'`; `interface LegalSection { id: string; heading: string; body: ReactNode }`; `interface LegalDoc { slug: LegalSlug; title: string; lastUpdated: string; intro?: ReactNode; sections: LegalSection[] }`; `LEGAL` const; `LegalPage({ doc }: { doc: LegalDoc })`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/features/legal/LegalPage.test.tsx`:
```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LegalPage } from '@/features/legal/components/LegalPage'
import { LEGAL } from '@/features/legal/config'
import type { LegalDoc } from '@/features/legal/types'

const doc: LegalDoc = {
  slug: 'terms',
  title: 'Sample Doc',
  lastUpdated: '2026-06-30',
  sections: [
    { id: 'alpha', heading: 'Alpha', body: <p>alpha body</p> },
    { id: 'beta', heading: 'Beta', body: <p>beta body</p> },
  ],
}

describe('LegalPage', () => {
  it('renders title, last-updated, contact email and section anchors', () => {
    const { container } = render(<LegalPage doc={doc} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Sample Doc' })).toBeTruthy()
    expect(container.textContent).toContain('2026-06-30')
    expect(container.textContent).toContain(LEGAL.contactEmail)
    expect(container.querySelector('#alpha')).toBeTruthy()
    expect(container.querySelector('#beta')).toBeTruthy()
  })

  it('shows cross-links to the other two documents but not the current one', () => {
    const { container } = render(<LegalPage doc={doc} />)
    const hrefs = Array.from(container.querySelectorAll('footer a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/privacy')
    expect(hrefs).toContain('/cookies')
    expect(hrefs).not.toContain('/terms')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/legal/LegalPage.test.tsx`
Expected: FAIL — cannot resolve `@/features/legal/...` (modules not created).

- [ ] **Step 3: Create types and config**

`src/features/legal/types.ts`:
```ts
import type { ReactNode } from 'react'

export type LegalSlug = 'terms' | 'privacy' | 'cookies'

export interface LegalSection {
  /** Stable anchor id, e.g. 'ai-output'. Used by the TOC and deep links. */
  id: string
  heading: string
  body: ReactNode
}

export interface LegalDoc {
  slug: LegalSlug
  title: string
  /** Human-readable date string, rendered as 'Last updated on …'. */
  lastUpdated: string
  intro?: ReactNode
  sections: LegalSection[]
}
```

`src/features/legal/config.ts`:
```ts
/**
 * Single source of operator-specific legal facts. Content modules read from
 * here so a future company registration is a one-line change.
 */
export const LEGAL = {
  operator: 'Tucaken Resumes',
  contactEmail: 'support@tucaken.com',
  jurisdiction: 'Ireland',
  euAuthority: 'Data Protection Commission (Ireland)',
  ukAuthority: "Information Commissioner's Office (UK)",
  lastUpdated: '2026-06-30',
} as const
```

- [ ] **Step 4: Create the components**

`src/features/legal/components/LegalSection.tsx`:
```tsx
import type { LegalSection as LegalSectionData } from '../types'

export function LegalSection({ section }: { section: LegalSectionData }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-24">
      <h2 id={`${section.id}-heading`} className="font-heading text-xl font-semibold">
        {section.heading}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        {section.body}
      </div>
    </section>
  )
}
```

`src/features/legal/components/LegalPage.tsx`:
```tsx
import { LEGAL } from '../config'
import type { LegalDoc, LegalSlug } from '../types'
import { LegalSection } from './LegalSection'

const DOC_LINKS: { slug: LegalSlug; label: string; href: string }[] = [
  { slug: 'terms', label: 'Terms & Conditions', href: '/terms' },
  { slug: 'privacy', label: 'Privacy Policy', href: '/privacy' },
  { slug: 'cookies', label: 'Cookie Policy', href: '/cookies' },
]

const linkClass = 'text-teal-600 underline hover:text-teal-500 dark:text-teal-400'

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <main className="min-h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-[min(48rem,calc(100%-2rem))] py-16">
        <header className="mb-10">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Last updated on {doc.lastUpdated}. Questions:{' '}
            <a className={linkClass} href={`mailto:${LEGAL.contactEmail}`}>
              {LEGAL.contactEmail}
            </a>
            .
          </p>
        </header>

        {doc.intro ? (
          <div className="mb-10 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{doc.intro}</div>
        ) : null}

        <nav aria-label="On this page" className="mb-10">
          <ul className="space-y-1 text-sm">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a className={linkClass} href={`#${s.id}`}>
                  {s.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-10">
          {doc.sections.map((s) => (
            <LegalSection key={s.id} section={s} />
          ))}
        </div>

        <footer className="mt-16 border-t border-zinc-200 pt-6 text-sm dark:border-zinc-800">
          <ul className="flex flex-wrap gap-4">
            {DOC_LINKS.filter((l) => l.slug !== doc.slug).map((l) => (
              <li key={l.slug}>
                <a className={linkClass} href={l.href}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </footer>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/legal/LegalPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Lint and typecheck**

Run: `yarn lint && yarn typecheck`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/legal/types.ts src/features/legal/config.ts \
  src/features/legal/components/LegalSection.tsx src/features/legal/components/LegalPage.tsx \
  src/__tests__/features/legal/LegalPage.test.tsx
git commit -m "feat(legal): add reusable legal page shell, types and config"
```

---

### Task 2: Terms & Conditions content + route

**Files:**
- Create: `src/features/legal/content/terms.tsx`
- Create: `src/app/terms/route.tsx`
- Test: `src/__tests__/features/legal/terms.test.tsx`

**Interfaces:**
- Consumes: `LegalDoc`, `LegalPage`, `LEGAL`.
- Produces: `export const termsDoc: LegalDoc` (slug `'terms'`).

- [ ] **Step 1: Write the failing test**

`src/__tests__/features/legal/terms.test.tsx`:
```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { termsDoc } from '@/features/legal/content/terms'

describe('termsDoc', () => {
  it('is the terms document with the required clauses', () => {
    expect(termsDoc.slug).toBe('terms')
    const ids = new Set(termsDoc.sections.map((s) => s.id))
    for (const id of ['who-we-are', 'eligibility', 'acceptable-use', 'ai-output', 'ip', 'third-parties', 'billing', 'liability', 'governing-law']) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('has unique section ids', () => {
    const ids = termsDoc.sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/legal/terms.test.tsx`
Expected: FAIL — cannot resolve `@/features/legal/content/terms`.

- [ ] **Step 3: Create the terms content**

`src/features/legal/content/terms.tsx`:
```tsx
import { LEGAL } from '../config'
import type { LegalDoc } from '../types'

export const termsDoc: LegalDoc = {
  slug: 'terms',
  title: 'Terms & Conditions',
  lastUpdated: LEGAL.lastUpdated,
  intro: (
    <p>
      These terms govern your use of Tucaken, a service operated by {LEGAL.operator}.
      By creating an account or using Tucaken, you agree to them. Please read the
      section on AI-generated output carefully.
    </p>
  ),
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who we are',
      body: (
        <p>
          Tucaken is operated by {LEGAL.operator}. You can contact us at{' '}
          <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      ),
    },
    {
      id: 'eligibility',
      heading: 'Eligibility',
      body: (
        <p>
          You must be at least 16 years old to use Tucaken. By submitting or
          connecting data — including data from your GitHub account — you confirm
          you have the right to provide it to us for the purpose of generating
          your resume.
        </p>
      ),
    },
    {
      id: 'acceptable-use',
      heading: 'Acceptable use',
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>Do not scrape, reverse-engineer, or attempt to disrupt the service.</li>
          <li>Do not submit other people&apos;s personal data without the right to do so.</li>
          <li>Do not submit unlawful, infringing, or harmful content.</li>
        </ul>
      ),
    },
    {
      id: 'ai-output',
      heading: 'AI-generated output',
      body: (
        <>
          <p>
            Tucaken uses AI to generate a resume from the evidence you supply, such
            as your GitHub activity and professional history. You are interacting
            with and receiving output from an automated AI system.
          </p>
          <p>
            AI output may contain inaccuracies or omissions. You are responsible for
            reviewing and verifying all generated content before you use or share
            it. We do not warrant that output is accurate or complete, and we do not
            guarantee any employment, interview, or other outcome.
          </p>
        </>
      ),
    },
    {
      id: 'ip',
      heading: 'Intellectual property',
      body: (
        <>
          <p>
            We own the Tucaken platform and software. You keep ownership of the data
            you provide and of the resume Tucaken generates for you.
          </p>
          <p>
            You grant us a limited licence to process your data only as needed to
            provide the service to you.
          </p>
        </>
      ),
    },
    {
      id: 'third-parties',
      heading: 'Third-party services',
      body: (
        <p>
          Tucaken relies on third-party services to work: GitHub (for the
          connection you authorise), Amazon Web Services and Amazon Bedrock (for AI
          processing), and Stripe (for payments). Your use of those connections is
          also subject to their terms.
        </p>
      ),
    },
    {
      id: 'billing',
      heading: 'Billing and cancellation',
      body: (
        <>
          <p>
            Paid plans are billed through Stripe. You can cancel at any time to stop
            future billing; cancellation takes effect at the end of the current
            billing period.
          </p>
          <p>
            Tucaken is a digital service provided immediately. When you subscribe you
            ask us to begin straight away and acknowledge that your statutory 14-day
            right of withdrawal ends once the service has begun. This does not affect
            your other statutory consumer rights.
          </p>
        </>
      ),
    },
    {
      id: 'liability',
      heading: 'Liability',
      body: (
        <p>
          To the fullest extent permitted by law, we are not liable for indirect or
          unforeseeable loss arising from your use of Tucaken. Nothing in these terms
          excludes or limits our liability where it would be unlawful to do so —
          including liability for death or personal injury caused by negligence, for
          fraud, or for your non-excludable statutory consumer rights.
        </p>
      ),
    },
    {
      id: 'governing-law',
      heading: 'Changes, termination and governing law',
      body: (
        <p>
          We may update these terms or suspend or end accounts that breach them; we
          will show the updated date above when we make changes. These terms are
          governed by the laws of {LEGAL.jurisdiction}, and disputes fall to its
          courts. If you are a consumer in the EU, you keep the mandatory
          protections of the country where you live.
        </p>
      ),
    },
  ],
}
```

- [ ] **Step 4: Create the route**

`src/app/terms/route.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '@/features/legal/components/LegalPage'
import { termsDoc } from '@/features/legal/content/terms'

export const Route = createFileRoute('/terms')({
  component: () => <LegalPage doc={termsDoc} />,
})
```

- [ ] **Step 5: Regenerate the route tree**

The `tanstackStart` Vite plugin writes `src/routeTree.gen.ts`. Start the dev server briefly so it regenerates, then stop it:

Run: `yarn dev` (let it boot, ~5s), confirm no errors, then stop with Ctrl-C.
Verify: `rg -n "'/terms'" src/routeTree.gen.ts` returns a match.
(Do NOT hand-edit `routeTree.gen.ts`.)

- [ ] **Step 6: Run test, lint, typecheck**

Run: `yarn test src/__tests__/features/legal/terms.test.tsx && yarn lint && yarn typecheck`
Expected: PASS, zero errors. (Typecheck needs the regenerated tree from Step 5.)

- [ ] **Step 7: Commit**

```bash
git add src/features/legal/content/terms.tsx src/app/terms/route.tsx \
  src/__tests__/features/legal/terms.test.tsx src/routeTree.gen.ts
git commit -m "feat(legal): add terms and conditions page"
```

---

### Task 3: Privacy Policy content + route

**Files:**
- Create: `src/features/legal/content/privacy.tsx`
- Create: `src/app/privacy/route.tsx`
- Test: `src/__tests__/features/legal/privacy.test.tsx`

**Interfaces:**
- Consumes: `LegalDoc`, `LegalPage`, `LEGAL`.
- Produces: `export const privacyDoc: LegalDoc` (slug `'privacy'`).

- [ ] **Step 1: Write the failing test**

`src/__tests__/features/legal/privacy.test.tsx`:
```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { privacyDoc } from '@/features/legal/content/privacy'

describe('privacyDoc', () => {
  it('is the privacy document with the required GDPR sections', () => {
    expect(privacyDoc.slug).toBe('privacy')
    const ids = new Set(privacyDoc.sections.map((s) => s.id))
    for (const id of ['controller', 'data-we-process', 'lawful-basis', 'sub-processors', 'automated-processing', 'rights']) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('has unique section ids', () => {
    const ids = privacyDoc.sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/legal/privacy.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create the privacy content**

`src/features/legal/content/privacy.tsx`:
```tsx
import { LEGAL } from '../config'
import type { LegalDoc } from '../types'

export const privacyDoc: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  lastUpdated: LEGAL.lastUpdated,
  intro: (
    <p>
      This policy explains how {LEGAL.operator} handles your personal data when you
      use Tucaken. It covers both the EU GDPR and the UK GDPR.
    </p>
  ),
  sections: [
    {
      id: 'controller',
      heading: 'Who controls your data',
      body: (
        <p>
          {LEGAL.operator} is the data controller for the personal data you provide
          to Tucaken. For any privacy request, contact{' '}
          <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      ),
    },
    {
      id: 'data-we-process',
      heading: 'Data we process',
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>Account and sign-in details, managed through Amazon Cognito.</li>
          <li>Data you connect from GitHub, used to generate your resume.</li>
          <li>Profile and professional information you add.</li>
          <li>Billing details handled by Stripe — Stripe holds your card data, not us.</li>
          <li>
            Please avoid placing sensitive information (for example, health or
            political details) in free-text fields, as it is not needed.
          </li>
        </ul>
      ),
    },
    {
      id: 'lawful-basis',
      heading: 'Why we are allowed to process it',
      body: (
        <p>
          We process the data needed to generate your resume on the basis of our
          contract with you. We use analytics and marketing cookies only with your
          consent, which you can change at any time on the Cookie Policy page.
        </p>
      ),
    },
    {
      id: 'sub-processors',
      heading: 'Sub-processors and international transfers',
      body: (
        <p>
          We share data with service providers that help us run Tucaken: Amazon Web
          Services and Amazon Bedrock (hosting and AI processing), GitHub (the
          connection you authorise), Stripe (payments), and Amazon Cognito
          (authentication). Where data is transferred outside the EU or UK, we rely
          on the relevant safeguards, such as Standard Contractual Clauses and the
          UK Addendum.
        </p>
      ),
    },
    {
      id: 'automated-processing',
      heading: 'Automated processing',
      body: (
        <p>
          Tucaken uses automated steps to extract skills and structure your evidence
          into a resume. This supports you; it does not make an automated decision
          with legal or similarly significant effect. You decide whether and how to
          use the resume Tucaken produces.
        </p>
      ),
    },
    {
      id: 'rights',
      heading: 'Your rights and how long we keep data',
      body: (
        <>
          <p>
            You can ask us to access, correct, delete, or export your data, or object
            to certain processing. To exercise any right, contact{' '}
            <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
            We keep your data for as long as your account is active and delete it on
            request, unless we must keep it to meet a legal obligation.
          </p>
          <p>
            You can also complain to a supervisory authority: the {LEGAL.euAuthority}
            {' '}in the EU, or the {LEGAL.ukAuthority} in the UK.
          </p>
        </>
      ),
    },
  ],
}
```

- [ ] **Step 4: Create the route**

`src/app/privacy/route.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '@/features/legal/components/LegalPage'
import { privacyDoc } from '@/features/legal/content/privacy'

export const Route = createFileRoute('/privacy')({
  component: () => <LegalPage doc={privacyDoc} />,
})
```

- [ ] **Step 5: Regenerate the route tree**

Run: `yarn dev` (boot ~5s), stop with Ctrl-C.
Verify: `rg -n "'/privacy'" src/routeTree.gen.ts` returns a match.

- [ ] **Step 6: Run test, lint, typecheck**

Run: `yarn test src/__tests__/features/legal/privacy.test.tsx && yarn lint && yarn typecheck`
Expected: PASS, zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/legal/content/privacy.tsx src/app/privacy/route.tsx \
  src/__tests__/features/legal/privacy.test.tsx src/routeTree.gen.ts
git commit -m "feat(legal): add privacy policy page"
```

---

### Task 4: Cookie Policy content + route

**Files:**
- Create: `src/features/legal/content/cookies.tsx`
- Create: `src/app/cookies/route.tsx`
- Test: `src/__tests__/features/legal/cookies.test.tsx`

**Interfaces:**
- Consumes: `LegalDoc`, `LegalPage`, `LEGAL`, `CookiePreferencesLink` from `@/features/consent/components/CookiePreferencesLink`.
- Produces: `export const cookiesDoc: LegalDoc` (slug `'cookies'`).

- [ ] **Step 1: Write the failing test**

`src/__tests__/features/legal/cookies.test.tsx`:
```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { cookiesDoc } from '@/features/legal/content/cookies'

describe('cookiesDoc', () => {
  it('is the cookies document with the required sections', () => {
    expect(cookiesDoc.slug).toBe('cookies')
    const ids = new Set(cookiesDoc.sections.map((s) => s.id))
    for (const id of ['what-we-use', 'manage']) {
      expect(ids.has(id)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/legal/cookies.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create the cookies content**

`src/features/legal/content/cookies.tsx`:
```tsx
import { CookiePreferencesLink } from '@/features/consent/components/CookiePreferencesLink'
import { LEGAL } from '../config'
import type { LegalDoc } from '../types'

export const cookiesDoc: LegalDoc = {
  slug: 'cookies',
  title: 'Cookie Policy',
  lastUpdated: LEGAL.lastUpdated,
  intro: (
    <p>
      This policy explains the cookies Tucaken uses and how you can control them.
      See our Privacy Policy for how we handle personal data more broadly.
    </p>
  ),
  sections: [
    {
      id: 'what-we-use',
      heading: 'Cookies we use',
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Necessary</strong> cookies keep you signed in and the site
            working. These are always on.
          </li>
          <li>
            <strong>Analytics</strong> cookies help us understand how the site is
            used. We set them only with your consent.
          </li>
          <li>
            <strong>Marketing</strong> cookies support relevant messaging. We set
            them only with your consent.
          </li>
        </ul>
      ),
    },
    {
      id: 'manage',
      heading: 'Managing your preferences',
      body: (
        <p>
          You can change your analytics and marketing choices at any time:{' '}
          <CookiePreferencesLink className="underline text-teal-600 hover:text-teal-500 dark:text-teal-400" />
          . You can also ask us anything at{' '}
          <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      ),
    },
  ],
}
```

- [ ] **Step 4: Create the route**

`src/app/cookies/route.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '@/features/legal/components/LegalPage'
import { cookiesDoc } from '@/features/legal/content/cookies'

export const Route = createFileRoute('/cookies')({
  component: () => <LegalPage doc={cookiesDoc} />,
})
```

- [ ] **Step 5: Regenerate the route tree**

Run: `yarn dev` (boot ~5s), stop with Ctrl-C.
Verify: `rg -n "'/cookies'" src/routeTree.gen.ts` returns a match.

- [ ] **Step 6: Run test, lint, typecheck**

Run: `yarn test src/__tests__/features/legal/cookies.test.tsx && yarn lint && yarn typecheck`
Expected: PASS, zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/legal/content/cookies.tsx src/app/cookies/route.tsx \
  src/__tests__/features/legal/cookies.test.tsx src/routeTree.gen.ts
git commit -m "feat(legal): add cookie policy page"
```

---

### Task 5: Wire the consent banner to the cookie policy

**Files:**
- Modify: `src/features/consent/components/ConsentBanner.tsx`
- Test: `src/__tests__/features/legal/consent-banner-links.test.tsx`

**Interfaces:**
- Consumes: existing `ConsentBanner` (already links `/privacy`; add a `/cookies` link).

- [ ] **Step 1: Write the failing test**

`src/__tests__/features/legal/consent-banner-links.test.tsx`:
```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ConsentBanner } from '@/features/consent/components/ConsentBanner'

describe('ConsentBanner legal links', () => {
  it('links to both the privacy policy and the cookie policy', () => {
    const { container } = render(<ConsentBanner onManage={() => {}} />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/privacy')
    expect(hrefs).toContain('/cookies')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/legal/consent-banner-links.test.tsx`
Expected: FAIL — no `/cookies` link yet. (If the banner does not render because `decided` is true in the persisted store, the test still fails on the missing link; if it renders nothing, see Step 3 note.)

> Note: `ConsentBanner` only renders when `decided` is false. In a fresh happy-dom store this is the default, so the banner renders. If a future store change defaults `decided` to true, reset it in the test via `useConsentStore.getState().reset()` before rendering.

- [ ] **Step 3: Update the banner copy**

In `src/features/consent/components/ConsentBanner.tsx`, replace the descriptive paragraph (the `<p id="consent-banner-desc">…</p>` block) with one that links to both pages:
```tsx
          <p id="consent-banner-desc" className="text-sm text-zinc-700 dark:text-zinc-300">
            Tucaken uses cookies to understand how the site is used and to improve
            it. Analytics cookies are only set with your consent. See our{' '}
            <a
              href="/privacy"
              className="font-medium text-teal-600 underline hover:text-teal-500 dark:text-teal-400"
            >
              privacy policy
            </a>{' '}
            and{' '}
            <a
              href="/cookies"
              className="font-medium text-teal-600 underline hover:text-teal-500 dark:text-teal-400"
            >
              cookie policy
            </a>
            .
          </p>
```

- [ ] **Step 4: Run test, lint, typecheck**

Run: `yarn test src/__tests__/features/legal/consent-banner-links.test.tsx && yarn lint && yarn typecheck`
Expected: PASS, zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/consent/components/ConsentBanner.tsx \
  src/__tests__/features/legal/consent-banner-links.test.tsx
git commit -m "feat(consent): link banner to privacy and cookie policies"
```

---

### Task 6: Full verification

- [ ] **Step 1: Run the whole gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all pass, zero errors.

- [ ] **Step 2: Manual check in the browser**

Run: `yarn dev`, then visit `/terms`, `/privacy`, `/cookies`:
- Each page renders title, TOC anchors jump correctly, cross-links work.
- Toggle light/dark (next-themes) and confirm both render correctly.
- Open the cookie banner (clear consent in storage / call `reset()`), confirm both links resolve.

- [ ] **Step 3: Final commit (only if manual fixes were needed)**

```bash
git add -A
git commit -m "fix(legal): polish legal pages after manual review"
```

---

## Self-Review

- **Spec coverage:** Terms 9 clauses → Task 2; Privacy 6 sections → Task 3; Cookies 2 sections → Task 4; shell/config/TOC/cross-links/last-updated/contact line → Task 1; dead `/privacy` link fix + `/cookies` link → Task 5; styling tokens + light/dark + tests → all tasks + Task 6. The spec's "Legal cluster of footer links in app layout" is intentionally deferred — cross-links live on each legal page (Task 1) and the consent banner links in (Task 5); a global app-footer link cluster can be a follow-up once a shared public footer exists (none exists today). All other spec items covered.
- **Placeholder scan:** none — all code and copy is literal.
- **Type consistency:** `LegalDoc`/`LegalSection`/`LegalSlug` defined in Task 1 and used unchanged in Tasks 2–4; `LegalPage({ doc })` signature consistent across routes; section `id` strings used as keys and anchors throughout.
