# Pricing reveal redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the home/landing `PricingSection` into a "spectacle reveal" — animated price counters, a light motion sparkle backdrop, and a sliding motion toggle — re-skinned teal/zinc and still wired to live tier config.

**Architecture:** Refactor `PricingSection` in `src/features/home/sections/Sections.tsx`. Extract a pure CTA-target helper (`pricing-cta.ts`), a presentational `SparkleField` backdrop, and two exported sub-components (`TierPrice` using NumberFlow, `BillingToggle` using a `motion` `layoutId` pill). The section gains a single `frequency` React state (required because NumberFlow takes a numeric prop), retiring the old CSS-only `:has()` price swap.

**Tech Stack:** TanStack Start (SSR) + React 19, `motion/react`, `@number-flow/react` (new), Tailwind v4, Vitest + happy-dom + @testing-library/react.

## Global Constraints

- Animation import: `motion/react` only — never `framer-motion`.
- Palette: teal/zinc tokens only — no blue/indigo, no arbitrary hex outside teal glow values already proven in the file.
- No `Math.random` for any generated value (SonarLint S2245 fails the gate) — use deterministic seeding.
- No nested ternaries (S3358); single ternaries are fine. Guard clauses / early returns. Cyclomatic complexity cap 10 (lint).
- Stable React keys — never the array index for content; seed-id keys allowed for the sparkle field.
- UK English in all prose/comments. Product name "Tucaken".
- Reuse-first: keep `KineticText`, `MagneticButton` — do NOT add `VerticalCutReveal`/`tsparticles`.
- Package manager: Yarn 4 (`yarn add ...`), never npm/npx.
- Use MotionPlus MCP (`motion`) + `css-spring`/`see-transition` skills to tune the pill spring and sparkle twinkle.
- Before done: `yarn typecheck && yarn lint && yarn test` all green.

## File Structure

- Create `src/features/home/lib/pricing-cta.ts` — pure CTA target helper (no React).
- Create `src/__tests__/features/home/pricing-cta.test.ts` — node-env unit test.
- Create `src/features/home/lib/SparkleField.tsx` — decorative motion sparkle backdrop.
- Create `src/__tests__/features/home/SparkleField.test.tsx` — happy-dom test.
- Modify `package.json` / `yarn.lock` — add `@number-flow/react`.
- Modify `src/features/home/sections/Sections.tsx` — add `TierPrice`, `BillingToggle` (exported), rewrite `PricingSection`.
- Create `src/__tests__/features/home/PricingSection.test.tsx` — happy-dom integration + sub-component tests.

Reference types (already in repo, `src/features/billing/catalog.ts`):
```ts
interface Tier {
  id: PlanId            // 'free' | 'pro' | 'premium'
  name: string
  priceMonthly: number
  priceAnnual: number
  blurb: string
  features: string[]
  cta: string
  highlighted?: boolean
  free?: boolean
}
export function tiersFromPublic(config): readonly Tier[]
export const TIERS: readonly Tier[]
```

---

### Task 1: Add `@number-flow/react` dependency

**Files:**
- Modify: `package.json`, `yarn.lock`

**Interfaces:**
- Produces: `import NumberFlow from '@number-flow/react'` — `<NumberFlow value={number} format={Intl.NumberFormatOptions} className?: string suffix?: string />`. (API confirmed via context7 `/barvian/number-flow`.)

- [ ] **Step 1: Add the dependency**

Run: `yarn add @number-flow/react`
Expected: package added to `package.json` dependencies, `yarn.lock` updated, no peer-dep errors against React 19.

- [ ] **Step 2: Verify it imports and builds**

Run: `yarn typecheck`
Expected: PASS (no missing-module error for `@number-flow/react`).

- [ ] **Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "build(pricing): add @number-flow/react for animated price counters"
```

---

### Task 2: Pure CTA-target helper

**Files:**
- Create: `src/features/home/lib/pricing-cta.ts`
- Test: `src/__tests__/features/home/pricing-cta.test.ts`

**Interfaces:**
- Consumes: `Tier` from `@/features/billing/catalog`.
- Produces: `tierCtaTarget(tier: Tier): CtaTarget` where
  `CtaTarget = { to: '/sign-in' } | { to: '/checkout/$tier'; params: { tier: 'pro' | 'premium' } }`.
  Consumed by `PricingSection` (Task 5) as `navigate(tierCtaTarget(t))`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/home/pricing-cta.test.ts
import { describe, it, expect } from 'vitest'
import { tierCtaTarget } from '@/features/home/lib/pricing-cta'
import { TIERS } from '@/features/billing/catalog'

const byId = (id: string) => {
  const t = TIERS.find((x) => x.id === id)
  if (!t) throw new Error(`missing tier ${id}`)
  return t
}

describe('tierCtaTarget', () => {
  it('routes the free tier to sign-in', () => {
    expect(tierCtaTarget(byId('free'))).toEqual({ to: '/sign-in' })
  })

  it('routes a paid tier to checkout with its id', () => {
    expect(tierCtaTarget(byId('pro'))).toEqual({
      to: '/checkout/$tier',
      params: { tier: 'pro' },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/pricing-cta.test.ts`
Expected: FAIL — cannot resolve `@/features/home/lib/pricing-cta`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/home/lib/pricing-cta.ts
// Maps a tier to its CTA navigation target. Free tiers go to sign-in;
// paid tiers go to the checkout route keyed by tier id. Kept React-free so
// the routing logic is unit-testable without a router/query context.
import type { Tier } from '@/features/billing/catalog'

export type CtaTarget =
  | { to: '/sign-in' }
  | { to: '/checkout/$tier'; params: { tier: 'pro' | 'premium' } }

export function tierCtaTarget(tier: Tier): CtaTarget {
  if (tier.free) return { to: '/sign-in' }
  // Free tiers short-circuited above, so id is 'pro' | 'premium' here —
  // TS cannot narrow a string union from the boolean `free` flag.
  return { to: '/checkout/$tier', params: { tier: tier.id as 'pro' | 'premium' } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/pricing-cta.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/home/lib/pricing-cta.ts src/__tests__/features/home/pricing-cta.test.ts
git commit -m "feat(pricing): extract pure tierCtaTarget routing helper"
```

---

### Task 3: `SparkleField` backdrop

**Files:**
- Create: `src/features/home/lib/SparkleField.tsx`
- Test: `src/__tests__/features/home/SparkleField.test.tsx`

**Interfaces:**
- Produces: `<SparkleField count?: number /* default 36 */ className?: string />` — a decorative, `aria-hidden`, `pointer-events-none` absolutely-positioned layer rendering `count` `<span>` dots. Consumed by `PricingSection` (Task 5).

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/features/home/SparkleField.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SparkleField } from '@/features/home/lib/SparkleField'

describe('SparkleField', () => {
  it('renders the requested number of sparkles', () => {
    const { container } = render(<SparkleField count={5} />)
    expect(container.querySelectorAll('span').length).toBe(5)
  })

  it('is decorative and non-interactive', () => {
    const { container } = render(<SparkleField count={3} />)
    const root = container.firstChild as HTMLElement
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.className).toContain('pointer-events-none')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/SparkleField.test.tsx`
Expected: FAIL — cannot resolve `@/features/home/lib/SparkleField`.

- [ ] **Step 3: Write minimal implementation**

```tsx
"use client"
// src/features/home/lib/SparkleField.tsx
// Decorative twinkling sparkle layer for the pricing reveal. Positions, sizes
// and timings are deterministically seeded (no Math.random — SonarLint S2245),
// so SSR and client markup match and keys are stable. Twinkle animates
// opacity/scale only; static under reduced motion.
import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'

// Deterministic pseudo-random in [0,1) from an integer seed.
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

interface Sparkle {
  id: number
  left: number
  top: number
  size: number
  delay: number
  duration: number
}

function buildSparkles(count: number): Sparkle[] {
  const out: Sparkle[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      id: i,
      left: seeded(i * 3 + 1) * 100,
      top: seeded(i * 3 + 2) * 100,
      size: 1 + seeded(i * 3 + 3) * 2.5,
      delay: seeded(i + 7) * 4,
      duration: 2.5 + seeded(i + 11) * 2.5,
    })
  }
  return out
}

interface Props {
  count?: number
  className?: string
}

export function SparkleField({ count = 36, className = '' }: Props) {
  const reduce = useReducedMotion() ?? false
  const sparkles = useMemo(() => buildSparkles(count), [count])
  return (
    <div
      aria-hidden="true"
      className={[
        'pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]',
        className,
      ].join(' ')}
    >
      {sparkles.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full bg-teal-300"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            willChange: 'opacity, transform',
          }}
          initial={{ opacity: 0.15 }}
          animate={reduce ? { opacity: 0.2 } : { opacity: [0.15, 0.8, 0.15], scale: [1, 1.6, 1] }}
          transition={
            reduce
              ? undefined
              : { duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/SparkleField.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/home/lib/SparkleField.tsx src/__tests__/features/home/SparkleField.test.tsx
git commit -m "feat(pricing): add deterministic motion SparkleField backdrop"
```

---

### Task 4: `TierPrice` and `BillingToggle` sub-components

**Files:**
- Modify: `src/features/home/sections/Sections.tsx` (add two exported components + imports)
- Test: `src/__tests__/features/home/PricingSection.test.tsx` (create with sub-component tests)

**Interfaces:**
- Consumes: `NumberFlow` (Task 1), `Tier`, `motion/react`.
- Produces:
  - `Frequency = 'monthly' | 'annually'`
  - `<BillingToggle value: Frequency onChange: (v: Frequency) => void />` — a radiogroup of two buttons with a sliding `layoutId="billing-pill"` indicator.
  - `<TierPrice tier: Tier isYearly: boolean />` — renders "Free" for free tiers, else a NumberFlow EUR amount + `/month`|`/year` suffix.
  Both consumed by `PricingSection` (Task 5).

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/features/home/PricingSection.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }))
vi.mock('@/server/tier-config', () => ({ getPublicTierConfigFn: vi.fn() }))
// NumberFlow is a custom-element wrapper; stub it to a plain span so digits
// are deterministically assertable in happy-dom.
vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}))

import { TierPrice, BillingToggle } from '@/features/home/sections/Sections'
import { TIERS } from '@/features/billing/catalog'

const byId = (id: string) => {
  const t = TIERS.find((x) => x.id === id)
  if (!t) throw new Error(`missing tier ${id}`)
  return t
}

beforeEach(() => navigateMock.mockReset())

describe('TierPrice', () => {
  it('renders "Free" for the free tier', () => {
    render(<TierPrice tier={byId('free')} isYearly={false} />)
    expect(screen.getByText('Free')).toBeTruthy()
  })

  it('shows monthly price + /month when not yearly', () => {
    render(<TierPrice tier={byId('pro')} isYearly={false} />)
    expect(screen.getByText('19')).toBeTruthy()
    expect(screen.getByText('/month')).toBeTruthy()
  })

  it('shows annual price + /year when yearly', () => {
    render(<TierPrice tier={byId('pro')} isYearly={true} />)
    expect(screen.getByText('190')).toBeTruthy()
    expect(screen.getByText('/year')).toBeTruthy()
  })
})

describe('BillingToggle', () => {
  it('calls onChange with the clicked frequency', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const onChange = vi.fn()
    render(<BillingToggle value="monthly" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: /annually/i }))
    expect(onChange).toHaveBeenCalledWith('annually')
  })

  it('marks the active option checked', () => {
    render(<BillingToggle value="annually" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /annually/i }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /monthly/i }).getAttribute('aria-checked')).toBe('false')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/PricingSection.test.tsx`
Expected: FAIL — `TierPrice` / `BillingToggle` are not exported from `Sections.tsx`.

- [ ] **Step 3: Add imports + the two components to `Sections.tsx`**

Add to the import block at the top of `src/features/home/sections/Sections.tsx`:
```tsx
import NumberFlow from '@number-flow/react'
import type { Tier } from '@/features/billing/catalog'
```

Add these exported components above `PricingSection` (after `Eyebrow`):
```tsx
export type Frequency = 'monthly' | 'annually'

const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: 'Monthly',
  annually: 'Annually',
}

export function BillingToggle({
  value,
  onChange,
}: {
  value: Frequency
  onChange: (v: Frequency) => void
}) {
  const options: Frequency[] = ['monthly', 'annually']
  return (
    <div className="mt-10 flex justify-center">
      <div
        role="radiogroup"
        aria-label="Billing frequency"
        className="grid grid-cols-2 gap-x-1 rounded-full p-1 font-mono text-[11px] uppercase tracking-widest inset-ring inset-ring-white/10"
      >
        {options.map((opt) => {
          const active = value === opt
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt)}
              className="relative cursor-pointer rounded-full px-4 py-1.5"
            >
              {active && (
                <motion.span
                  layoutId="billing-pill"
                  className="absolute inset-0 rounded-full bg-teal-500"
                  style={{ willChange: 'transform' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className={active ? 'relative text-zinc-950' : 'relative text-zinc-400'}>
                {FREQUENCY_LABEL[opt]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TierPrice({ tier, isYearly }: { tier: Tier; isYearly: boolean }) {
  if (tier.free) {
    return <p className="mt-6 text-4xl font-semibold tracking-tight text-white">Free</p>
  }
  const value = isYearly ? tier.priceAnnual : tier.priceMonthly
  return (
    <p className="mt-6 flex items-baseline gap-x-1">
      <NumberFlow
        value={value}
        format={{ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }}
        className="text-4xl font-semibold tracking-tight text-white"
      />
      <span className="text-sm/6 font-semibold text-zinc-500">
        {isYearly ? '/year' : '/month'}
      </span>
    </p>
  )
}
```

Note: the `FREQUENCY_LABEL` lookup avoids an inline ternary for labels (keeps things flat). The single `active ? … : …` and `isYearly ? … : …` ternaries are allowed (not nested).

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/PricingSection.test.tsx`
Expected: PASS (5 tests). If NumberFlow currency formatting in the real component prepends a symbol, note the stub renders only `value` — assertions target the stub, so `19`/`190` match.

- [ ] **Step 5: Commit**

```bash
git add src/features/home/sections/Sections.tsx src/__tests__/features/home/PricingSection.test.tsx
git commit -m "feat(pricing): add BillingToggle pill + NumberFlow TierPrice"
```

---

### Task 5: Rewire `PricingSection` (state, toggle, prices, backdrop)

**Files:**
- Modify: `src/features/home/sections/Sections.tsx` (`PricingSection` body + imports)
- Test: `src/__tests__/features/home/PricingSection.test.tsx` (append integration tests)

**Interfaces:**
- Consumes: `useState`, `tierCtaTarget` (Task 2), `SparkleField` (Task 3), `TierPrice` + `BillingToggle` + `Frequency` (Task 4), existing `tiersFromPublic`, `KineticText`, `MagneticButton`.

- [ ] **Step 1: Append failing integration tests**

Add to `src/__tests__/features/home/PricingSection.test.tsx` (after the existing `describe` blocks):
```tsx
import { PricingSection } from '@/features/home/sections/Sections'

describe('PricingSection', () => {
  it('renders every tier name', () => {
    render(<PricingSection />)
    for (const t of TIERS) {
      expect(screen.getByText(t.name)).toBeTruthy()
    }
  })

  it('free tier CTA navigates to sign-in', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<PricingSection />)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(byId('free').cta, 'i') }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/sign-in' })
  })

  it('paid tier CTA navigates to checkout with its id', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<PricingSection />)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(byId('pro').cta, 'i') }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/checkout/$tier', params: { tier: 'pro' } })
  })

  it('toggling to annually swaps the displayed prices', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<PricingSection />)
    expect(screen.getByText(String(byId('pro').priceMonthly))).toBeTruthy()
    await userEvent.click(screen.getByRole('radio', { name: /annually/i }))
    expect(screen.getByText(String(byId('pro').priceAnnual))).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `yarn test src/__tests__/features/home/PricingSection.test.tsx`
Expected: FAIL — current `PricingSection` still uses the CSS toggle (two price `<p>` rendered at once, no `radio` role), so the annually-swap and/or CTA assertions fail.

- [ ] **Step 3: Add imports to `Sections.tsx`**

Ensure these are present in the import block:
```tsx
import { SparkleField } from '../lib/SparkleField'
import { tierCtaTarget } from '../lib/pricing-cta'
```
`useState` is already imported. `motion` already imported.

- [ ] **Step 4: Replace the `PricingSection` body**

Replace the whole `export function PricingSection() { … }` (currently ~lines 105-254) with:
```tsx
export function PricingSection() {
  const navigate = useNavigate()
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const isYearly = frequency === 'annually'
  // Live, admin-editable tier display. Falls back to the static TIERS catalog
  // while loading or if the public endpoint is unreachable.
  const { data: publicConfig } = useQuery({
    queryKey: ['public-tier-config'],
    queryFn: getPublicTierConfigFn,
  })
  const tiers = tiersFromPublic(publicConfig)
  return (
    <Section id="pricing" className="overflow-hidden border-t border-white/5">
      {/* Reveal backdrop: twinkling sparkles + a soft teal glow, behind cards. */}
      <SparkleField className="z-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[10%] top-0 z-0 h-full"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 30%, rgba(45,212,191,0.16) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <KineticText
            as="h2"
            text="Free until it's worth paying for."
            className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl"
          />
          <p className="mx-auto mt-5 max-w-xl text-pretty text-sm text-zinc-400 md:text-base">
            Pick a tier that matches how often you ship. Switch or cancel any
            time — we prorate down to the day.
          </p>
        </div>

        <BillingToggle value={frequency} onChange={setFrequency} />

        <div className="isolate mx-auto mt-10 grid max-w-md grid-cols-1 gap-6 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {tiers.map((t) => (
            <motion.div
              key={t.id}
              data-featured={t.highlighted ? 'true' : undefined}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16 }}
              style={{ willChange: 'transform, opacity' }}
              className="group/tier relative rounded-3xl bg-white/[0.02] p-8 ring-1 ring-white/10 data-featured:ring-2 data-featured:ring-teal-500/60 xl:p-10"
            >
              {t.highlighted && (
                <div className="gradient-sweep-anim absolute -top-3 right-6 rounded-full bg-[linear-gradient(110deg,#14b8a6,#34d399,#14b8a6)] px-3 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-950">
                  Recommended
                </div>
              )}
              <h3
                id={`tier-${t.id}`}
                className="font-mono text-xs uppercase tracking-widest text-zinc-400 group-data-featured/tier:text-teal-300"
              >
                {t.name}
              </h3>
              <p className="mt-3 text-sm/6 text-zinc-300">{t.blurb}</p>

              <TierPrice tier={t} isYearly={isYearly} />

              <MagneticButton
                primary={t.highlighted}
                className="mt-7 w-full"
                onClick={() => navigate(tierCtaTarget(t))}
              >
                {t.cta}
              </MagneticButton>

              <ul className="mt-8 space-y-3 text-sm/6 text-zinc-300 xl:mt-10">
                {t.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <span
                      aria-hidden="true"
                      className={t.highlighted ? 'mt-0.5 text-teal-400' : 'mt-0.5 text-zinc-500'}
                    >
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  )
}
```

Note: the old `<form className="group/tiers …">` wrapper and the CSS `:has()` price-swap classes are removed — pricing is now driven by `frequency` state.

- [ ] **Step 5: Run the test file to verify it passes**

Run: `yarn test src/__tests__/features/home/PricingSection.test.tsx`
Expected: PASS (all sub-component + integration tests).

- [ ] **Step 6: Full verification gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all PASS, zero lint errors (watch the `complexity` cap on `PricingSection`; if it trips, extract the tier `<motion.div>` into an exported `TierCard` component and render `{tiers.map((t) => <TierCard key={t.id} tier={t} isYearly={isYearly} onCta={() => navigate(tierCtaTarget(t))} />)}`).

- [ ] **Step 7: Manual UI check**

Run: `yarn dev` (port 5001). Open `/` (scroll to pricing) and `/pricing`. Verify:
- Toggle slides; prices animate between monthly/annual (NumberFlow), `/month`↔`/year` swaps.
- Sparkles twinkle behind cards; cards remain interactive (sparkles `pointer-events-none`).
- Free CTA → sign-in; paid CTA → checkout.
- `prefers-reduced-motion: reduce` (devtools rendering emulation): sparkles static, counters do not animate.
- Mobile (1-col) and desktop (3-col), light + dark.
- No hydration warning in console for NumberFlow (SSR risk). If one appears, wrap the price number render so it only mounts client-side, or pass `prefix`/plain fallback — re-verify.

- [ ] **Step 8: Commit**

```bash
git add src/features/home/sections/Sections.tsx src/__tests__/features/home/PricingSection.test.tsx
git commit -m "feat(pricing): spectacle reveal — sparkle backdrop, motion toggle, animated prices"
```

---

## Self-Review

**Spec coverage:**
- SparkleField (light motion sparkles, seeded, reduced-motion) → Task 3. ✓
- `isYearly` state + NumberFlow prices → Tasks 4-5. ✓
- Motion `layoutId` pill toggle, retire CSS toggle → Tasks 4-5. ✓
- Keep KineticText/MagneticButton, no VerticalCutReveal/tsparticles → Tasks 4-5 (reused, none added). ✓
- `@number-flow/react` only new dep, context7-verified, SSR risk flagged → Task 1 + Task 5 Step 7. ✓
- Live tiers query + fallback unchanged → Task 5. ✓
- Tests: toggle swap, free→sign-in, paid→checkout, SparkleField renders → Tasks 2-5. ✓
- Palette teal/zinc, no blue → all card/sparkle/glow classes teal. ✓
- MotionPlus MCP for spring tuning → Global Constraints + noted. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `Frequency`, `tierCtaTarget`/`CtaTarget`, `TierPrice`/`BillingToggle` props, `SparkleField` props consistent across tasks. `tiersFromPublic`/`Tier`/`TIERS` match repo source.
