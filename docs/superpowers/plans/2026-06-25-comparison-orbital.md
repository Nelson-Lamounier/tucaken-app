# Comparison orbital + Founder motion refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home `ComparisonSection` table with an interactive teal/zinc radial orbital (nodes orbiting a Tucaken hub, click-to-expand q/o/t), and give `FounderSection` a light motion refresh.

**Architecture:** A presentational `OrbitalComparison` renders an auto-spinning ring of node buttons on `lg+` (CSS-transform spin, no per-frame React re-render) and an accessible static list on mobile / reduced-motion. Pure geometry helpers are unit-tested in isolation. `ComparisonSection` and `FounderSection` (in `Sections.tsx`) are rewired to consume them. Data lives in `content.ts`, extended with a UI `label` + lucide `icon` per row — the real `q`/`o`/`t` text is unchanged.

**Tech Stack:** React 19, `motion/react`, `lucide-react` (already present), Tailwind v4, Vitest + happy-dom + @testing-library/react.

## Global Constraints

- Animation: `motion/react` only — never `framer-motion`. Server-component files would use `motion/react-client`, but these are `"use client"`.
- Palette: teal/zinc only — no purple/blue/indigo. Hub gradient `from-teal-400 to-emerald-600`.
- **No new dependencies.** Do NOT port shadcn `Badge`/`Button`/`Card`; do NOT add `class-variance-authority` or `@radix-ui/react-slot`. Use the repo `cn` from `@/lib/utils` and plain elements.
- **No fabricated data.** Keep only the real `comparison` fields `q`/`o`/`t`; the only additions are a short UI `label` and a lucide `icon` name. No energy/status/date/relatedIds.
- lucide icons resolved via a static `Record<string, LucideIcon>` allow-list with a fallback — never a dynamic `lucide[name]` lookup.
- `willChange` may list only `transform`/`opacity`/`clipPath`/`filter`.
- No nested ternaries (S3358); guard clauses/early returns; cyclomatic complexity cap 10 (extract components/helpers if needed).
- Stable React keys — use `item.label`, never the array index.
- `Number.*` over globals; `Set` for membership; no `console.*`; no `as any`; no redundant `!`/casts.
- Default corner radius `rounded-md` for new surfaces (cards, list tiles); `rounded-full` only for the circular hub and icon node buttons.
- UK English in copy/comments. Product name "Tucaken".
- Reduced motion: `useReducedMotion()` → static list, no spin; the page already wraps in `<MotionConfig reducedMotion="user">`. CSS spin classes also added to the `styles.css` `prefers-reduced-motion` kill-switch.
- Use the MotionPlus MCP (`motion`) / `css-spring` skill to tune the expand spring + spin speed.
- Before done: `yarn typecheck && yarn lint && yarn test` green.

## File Structure

- Modify `src/features/home/content.ts` — add `label`+`icon` to each `comparison` row; export `ComparisonItem` type.
- Create `src/features/home/lib/orbital-geometry.ts` — pure ring-position math.
- Create `src/__tests__/features/home/orbital-geometry.test.ts`.
- Create `src/features/home/lib/OrbitalComparison.tsx` — orbital + fallback list + nodes.
- Create `src/__tests__/features/home/OrbitalComparison.test.tsx`.
- Modify `src/styles.css` — orbit-spin keyframes + reduced-motion kill-switch entry.
- Modify `src/features/home/sections/Sections.tsx` — `ComparisonSection` body + `FounderSection` motion.
- Create `src/__tests__/features/home/ComparisonSection.test.tsx`.
- Create `src/__tests__/features/home/FounderSection.test.tsx`.

---

### Task 1: Extend `comparison` data + `ComparisonItem` type

**Files:**
- Modify: `src/features/home/content.ts:22-27`
- Test: `src/__tests__/features/home/comparison-data.test.ts`

**Interfaces:**
- Produces: `type ComparisonItem = { label: string; icon: string; q: string; o: string; t: string }` and `export const comparison: readonly ComparisonItem[]`. Consumed by Tasks 3-4.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/home/comparison-data.test.ts
import { describe, it, expect } from 'vitest'
import { comparison } from '@/features/home/content'

const KNOWN_ICONS = new Set(['FileSearch', 'Target', 'FileWarning', 'Fingerprint'])

describe('comparison data', () => {
  it('every item carries label, icon, q, o, t', () => {
    expect(comparison.length).toBeGreaterThan(0)
    for (const item of comparison) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.icon.length).toBeGreaterThan(0)
      expect(item.q.length).toBeGreaterThan(0)
      expect(item.o.length).toBeGreaterThan(0)
      expect(item.t.length).toBeGreaterThan(0)
    }
  })

  it('every icon is a known lucide key', () => {
    for (const item of comparison) {
      expect(KNOWN_ICONS.has(item.icon)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/comparison-data.test.ts`
Expected: FAIL — current items have no `label`/`icon`.

- [ ] **Step 3: Replace the `comparison` export in `content.ts`**

Replace lines 22-27 (`export const comparison = [ … ] as const`) with:
```ts
export type ComparisonItem = {
  label: string
  icon: string
  q: string
  o: string
  t: string
}

export const comparison: readonly ComparisonItem[] = [
  { label: 'Evidence', icon: 'FileSearch', q: 'What is your evidence for this claim?', o: '"It seemed like a reasonable thing to say."', t: 'Points to your specific commit, file, or architecture decision.' },
  { label: 'Tailoring', icon: 'Target', q: 'Can you tailor for a Kubernetes role?', o: 'Generic Kubernetes language.', t: 'Pulls your actual K8s work — the cluster you ran, the issues you solved.' },
  { label: 'Thin docs', icon: 'FileWarning', q: 'What if my repos have thin docs?', o: 'Generates plausible content anyway.', t: 'Tells you which repos need better docs and how to improve them.' },
  { label: 'Sounds like you', icon: 'Fingerprint', q: 'Will this resume sound like me?', o: 'Trained on millions of generic resumes.', t: 'Trained on the documentation you wrote about systems you built.' },
]
```
(The `q`/`o`/`t` strings are byte-for-byte the current content; only `label`+`icon` are new.)

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/comparison-data.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck (catches any other `comparison` consumer)**

Run: `yarn typecheck`
Expected: PASS. (Only `ComparisonSection` consumes `comparison`; it is rewired in Task 4.)

- [ ] **Step 6: Commit**

```bash
git add src/features/home/content.ts src/__tests__/features/home/comparison-data.test.ts
git commit -m "feat(comparison): add label + icon fields and ComparisonItem type"
```

---

### Task 2: Pure orbital geometry helpers

**Files:**
- Create: `src/features/home/lib/orbital-geometry.ts`
- Test: `src/__tests__/features/home/orbital-geometry.test.ts`

**Interfaces:**
- Produces: `nodeAngles(total: number): number[]` (evenly spaced degrees, first at `-90`) and `nodeTransform(angle: number, radius: number): string`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/home/orbital-geometry.test.ts
import { describe, it, expect } from 'vitest'
import { nodeAngles, nodeTransform } from '@/features/home/lib/orbital-geometry'

describe('nodeAngles', () => {
  it('returns evenly spaced angles starting at -90', () => {
    expect(nodeAngles(4)).toEqual([-90, 0, 90, 180])
  })
  it('returns [] for non-positive counts', () => {
    expect(nodeAngles(0)).toEqual([])
  })
})

describe('nodeTransform', () => {
  it('positions a node on the ring and keeps it upright', () => {
    expect(nodeTransform(90, 200)).toBe('rotate(90deg) translateX(200px) rotate(-90deg)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/orbital-geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/home/lib/orbital-geometry.ts
// Pure geometry for the radial comparison orbital. Kept React-free so the
// ring maths is unit-testable without rendering.

// Evenly spaced node angles (degrees), first node at the top (-90).
export function nodeAngles(total: number): number[] {
  if (total <= 0) return []
  const out: number[] = []
  for (let i = 0; i < total; i++) {
    out.push((i / total) * 360 - 90)
  }
  return out
}

// Places a node on the ring at `radius` then counter-rotates it so its
// contents stay upright regardless of the node's angle.
export function nodeTransform(angle: number, radius: number): string {
  return `rotate(${angle}deg) translateX(${radius}px) rotate(${-angle}deg)`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/orbital-geometry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/home/lib/orbital-geometry.ts src/__tests__/features/home/orbital-geometry.test.ts
git commit -m "feat(comparison): pure orbital ring geometry helpers"
```

---

### Task 3: `OrbitalComparison` component + spin CSS

**Files:**
- Create: `src/features/home/lib/OrbitalComparison.tsx`
- Modify: `src/styles.css` (orbit keyframes + reduced-motion kill-switch)
- Test: `src/__tests__/features/home/OrbitalComparison.test.tsx`

**Interfaces:**
- Consumes: `nodeAngles`/`nodeTransform` (Task 2), `ComparisonItem` (Task 1), `cn` from `@/lib/utils`, `lucide-react`.
- Produces: `export function OrbitalComparison({ items }: { items: readonly ComparisonItem[] })`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/features/home/OrbitalComparison.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { OrbitalComparison } from '@/features/home/lib/OrbitalComparison'
import type { ComparisonItem } from '@/features/home/content'

const items: ComparisonItem[] = [
  { label: 'Evidence', icon: 'FileSearch', q: 'Q-evidence?', o: 'O-evidence', t: 'T-evidence' },
  { label: 'Tailoring', icon: 'Target', q: 'Q-tailoring?', o: 'O-tailoring', t: 'T-tailoring' },
]

afterEach(cleanup)

describe('OrbitalComparison', () => {
  it('renders a node button per item with its label', () => {
    render(<OrbitalComparison items={items} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(items.length)
    expect(screen.getAllByText('Evidence').length).toBeGreaterThan(0)
  })

  it('toggles aria-expanded on the clicked node (single-open)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<OrbitalComparison items={items} />)
    const [first, second] = screen.getAllByRole('button')
    expect(first.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(first)
    expect(first.getAttribute('aria-expanded')).toBe('true')
    await userEvent.click(second)
    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(second.getAttribute('aria-expanded')).toBe('true')
  })

  it('shows every item q/o/t in the accessible static list', () => {
    render(<OrbitalComparison items={items} />)
    for (const item of items) {
      expect(screen.getByText(item.q)).toBeTruthy()
      expect(screen.getByText(item.o)).toBeTruthy()
      expect(screen.getByText(item.t, { exact: false })).toBeTruthy()
    }
  })

  it('renders only the static list under reduced motion (no node buttons)', () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    try {
      render(<OrbitalComparison items={items} />)
      expect(screen.queryAllByRole('button')).toHaveLength(0)
      expect(screen.getByText('Q-evidence?')).toBeTruthy()
    } finally {
      window.matchMedia = original
    }
  })
})
```

Note on test reasoning: with reduced motion off (default happy-dom), both the orbital and the `lg:hidden` list render in the DOM (no real CSS layout in tests), so the buttons come from the orbital and the q/o/t text comes from the list. Before any click the expand card is not mounted, so each q/o/t string appears exactly once → `getByText` is unambiguous. The `t` line is prefixed with a `✓ ` glyph, so it is asserted with `{ exact: false }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the spin keyframes to `src/styles.css`**

Append near the other `@keyframes` (e.g. after `gradient-sweep`):
```css
@keyframes orbit-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes orbit-counter-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
}
.orbit-spin-anim { animation: orbit-spin 48s linear infinite; will-change: transform; }
.orbit-counter-spin-anim { animation: orbit-counter-spin 48s linear infinite; will-change: transform; }
.orbit-spin-anim[data-paused='true'],
.orbit-counter-spin-anim[data-paused='true'] { animation-play-state: paused; }
```

Then add the two classes to the existing reduced-motion kill-switch selector list (the `@media (prefers-reduced-motion: reduce)` block, `.belt-scroll-anim, …, .marquee-anim { animation: none !important; }`) so it reads:
```css
  .belt-scroll-anim, .scan-sweep-anim, .item-state-anim, .pipe-pulse-anim, .node-glow-anim, .gradient-sweep-anim, .marquee-anim, .orbit-spin-anim, .orbit-counter-spin-anim { animation: none !important; }
```

- [ ] **Step 4: Write `OrbitalComparison.tsx`**

```tsx
"use client"
// src/features/home/lib/OrbitalComparison.tsx
// Radial comparison orbital: nodes orbit a teal Tucaken hub on lg+ (CSS-transform
// spin, no per-frame React re-render); an accessible static list is shown on
// mobile and under reduced motion. Only the real q/o/t data is rendered.
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { FileSearch, Target, FileWarning, Fingerprint, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { nodeAngles, nodeTransform } from './orbital-geometry'
import type { ComparisonItem } from '../content'

const ICONS: Record<string, LucideIcon> = { FileSearch, Target, FileWarning, Fingerprint }
const RADIUS = 200

function ComparisonDetail({ item }: { item: ComparisonItem }) {
  return (
    <div className="text-left">
      <p className="text-sm font-medium text-white">{item.q}</p>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-zinc-500">
          <span className="font-mono text-[11px] uppercase tracking-widest">Other tools</span>
          <br />
          {item.o}
        </p>
        <p className="text-zinc-100">
          <span className="font-mono text-[11px] uppercase tracking-widest text-teal-300">Tucaken</span>
          <br />
          <span className="text-teal-400">✓ </span>
          {item.t}
        </p>
      </div>
    </div>
  )
}

// Accessible, motion-free list — mobile and reduced-motion.
function ComparisonList({ items }: { items: readonly ComparisonItem[] }) {
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.label} className="rounded-md border border-white/10 bg-white/[0.02] p-5">
          <div className="font-mono text-[11px] uppercase tracking-widest text-teal-400">{item.label}</div>
          <div className="mt-3">
            <ComparisonDetail item={item} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function OrbitalNode({
  item,
  transform,
  expanded,
  paused,
  onToggle,
}: {
  item: ComparisonItem
  transform: string
  expanded: boolean
  paused: boolean
  onToggle: () => void
}) {
  const Icon = ICONS[item.icon] ?? FileSearch
  return (
    <div className="absolute" style={{ transform, willChange: 'transform' }}>
      <div
        className="orbit-counter-spin-anim"
        style={{ willChange: 'transform' }}
        data-paused={paused ? 'true' : undefined}
      >
        <button
          type="button"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className={cn(
            'grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 transition-colors',
            expanded
              ? 'border-teal-400 bg-teal-400 text-zinc-950'
              : 'border-white/30 bg-zinc-900 text-white hover:border-teal-400/60',
          )}
        >
          <Icon size={18} />
        </button>
        <div className="-translate-x-1/2 whitespace-nowrap text-center font-mono text-[11px] uppercase tracking-widest text-white/70">
          {item.label}
        </div>
      </div>
    </div>
  )
}

export function OrbitalComparison({ items }: { items: readonly ComparisonItem[] }) {
  const reduce = useReducedMotion() ?? false
  const [activeId, setActiveId] = useState<string | null>(null)
  const angles = nodeAngles(items.length)
  const activeItem = items.find((x) => x.label === activeId) ?? null
  const paused = activeId !== null

  if (reduce) {
    return <ComparisonList items={items} />
  }

  return (
    <div>
      <div className="block lg:hidden">
        <ComparisonList items={items} />
      </div>

      <div
        className="relative hidden h-[520px] w-full lg:block"
        onClick={() => setActiveId(null)}
      >
        <div className="absolute left-1/2 top-1/2">
          <div className="orbit-spin-anim" data-paused={paused ? 'true' : undefined}>
            {items.map((item, i) => (
              <OrbitalNode
                key={item.label}
                item={item}
                transform={nodeTransform(angles[i], RADIUS)}
                expanded={activeId === item.label}
                paused={paused}
                onToggle={() => setActiveId(activeId === item.label ? null : item.label)}
              />
            ))}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600"
        >
          <div className="h-7 w-7 rounded-full bg-white/80 backdrop-blur-md" />
        </div>

        <AnimatePresence>
          {activeItem && (
            <motion.div
              key={activeItem.label}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              style={{ willChange: 'transform, opacity' }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-1/2 w-80 -translate-x-1/2 rounded-md border border-white/15 bg-zinc-950/90 p-5 backdrop-blur-lg"
            >
              <ComparisonDetail item={activeItem} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
```

Notes: `activeItem` is derived safely with `?? null` (no `!`). The reduced-motion early return sits after all hooks. Each rendered branch uses single (non-nested) ternaries only. Keys are `item.label`.

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + lint the new files**

Run: `yarn typecheck && yarn lint`
Expected: PASS, zero errors (watch complexity on `OrbitalComparison` — node rendering is already extracted into `OrbitalNode`).

- [ ] **Step 7: Commit**

```bash
git add src/features/home/lib/OrbitalComparison.tsx src/styles.css src/__tests__/features/home/OrbitalComparison.test.tsx
git commit -m "feat(comparison): OrbitalComparison component with spin CSS and a11y fallback"
```

---

### Task 4: Rewire `ComparisonSection`

**Files:**
- Modify: `src/features/home/sections/Sections.tsx:109-143` (`ComparisonSection`)
- Test: `src/__tests__/features/home/ComparisonSection.test.tsx`

**Interfaces:**
- Consumes: `OrbitalComparison` (Task 3), `comparison` (Task 1), existing `Section`/`Eyebrow`/`KineticText`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/features/home/ComparisonSection.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Sections.tsx imports NumberFlow at module scope (custom element); stub it.
vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}))

import { ComparisonSection } from '@/features/home/sections/Sections'
import { comparison } from '@/features/home/content'

describe('ComparisonSection', () => {
  it('renders the heading and one orbital node per comparison item', () => {
    const { container } = render(<ComparisonSection />)
    // KineticText splits the heading into per-word spans — assert on text content.
    expect(container.textContent).toMatch(/other AI resume tools/i)
    expect(screen.getAllByRole('button')).toHaveLength(comparison.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/ComparisonSection.test.tsx`
Expected: FAIL — the current table has no `button` roles.

- [ ] **Step 3: Add the import to `Sections.tsx`**

Add to the top import block:
```tsx
import { OrbitalComparison } from '../lib/OrbitalComparison'
```

- [ ] **Step 4: Replace the `ComparisonSection` body**

Replace the whole `export function ComparisonSection() { … }` (currently lines 109-143) with:
```tsx
export function ComparisonSection() {
  return (
    <Section className="border-t border-white/5">
      <div className="mx-auto max-w-5xl">
        <Eyebrow>Why Tucaken</Eyebrow>
        <KineticText
          as="h2"
          text="What other AI resume tools can't say."
          className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl"
        />
        <p className="mt-4 max-w-xl text-pretty text-sm text-zinc-400 md:text-base">
          Tap a node to see how Tucaken answers — grounded in your real work, not
          generic filler.
        </p>
        <div className="mt-8">
          <OrbitalComparison items={comparison} />
        </div>
      </div>
    </Section>
  )
}
```
The old `<motion.div>` table rows and their `comparison.map` are removed. If, after this, `motion` or `useReducedMotion` is no longer referenced anywhere else in the file, leave the imports — `FounderSection` (Task 5) still uses both. Do not remove imports other tasks need.

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/ComparisonSection.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/home/sections/Sections.tsx src/__tests__/features/home/ComparisonSection.test.tsx
git commit -m "feat(comparison): render OrbitalComparison in ComparisonSection"
```

---

### Task 5: `FounderSection` motion refresh

**Files:**
- Modify: `src/features/home/sections/Sections.tsx:145-178` (`FounderSection`)
- Test: `src/__tests__/features/home/FounderSection.test.tsx`

**Interfaces:**
- Consumes: existing `motion`, `useReducedMotion`, `Section`, `Eyebrow`, `founder` content.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/features/home/FounderSection.test.tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}))

import { FounderSection } from '@/features/home/sections/Sections'
import { founder } from '@/features/home/content'

describe('FounderSection', () => {
  it('renders the founder name and quote', () => {
    const { container } = render(<FounderSection />)
    expect(screen.getByText(founder.name)).toBeTruthy()
    expect(container.textContent).toContain('I built Tucaken because')
  })

  it('renders the quote inside a blockquote element', () => {
    const { container } = render(<FounderSection />)
    expect(container.querySelector('blockquote')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/FounderSection.test.tsx`
Expected: The first test may pass already, but the second fails once you convert to `motion.blockquote` only if the element changes; run to capture the baseline. If both already pass against the current code, proceed — Step 4 must keep them passing.

- [ ] **Step 3: (none — test-capture step above)**

- [ ] **Step 4: Update the `blockquote` in `FounderSection`**

In `FounderSection`, replace the existing static blockquote:
```tsx
          <blockquote className="mt-6 whitespace-pre-line text-[17px] leading-relaxed text-zinc-200">
            "{founder.quote}"
          </blockquote>
```
with a motion reveal (the component already computes `const reduce = useReducedMotion() ?? false`):
```tsx
          <motion.blockquote
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={reduce ? undefined : { willChange: 'transform, opacity' }}
            className="mt-6 whitespace-pre-line text-[17px] leading-relaxed text-zinc-200"
          >
            "{founder.quote}"
          </motion.blockquote>
```
Also add `transition-colors` to the two founder links so the existing `hover:text-teal-300` eases:
```tsx
            <a className="text-zinc-400 transition-colors hover:text-teal-300" href="#">linkedin.com/in/nelson</a>
```
(apply the same `transition-colors` to the github link).

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/FounderSection.test.tsx`
Expected: PASS (2 tests). `motion.blockquote` renders a real `<blockquote>` element, so the querySelector assertion holds.

- [ ] **Step 6: Full verification gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all PASS, zero lint errors, full suite green (no regressions).

- [ ] **Step 7: Manual UI check (controller runs separately)**

`yarn dev` (5001), open `/` and scroll to the Comparison section:
- Desktop: ring of 4 nodes slowly orbits the teal hub; hovering pauses; clicking a node pauses + expands its q/o/t card; clicking the backdrop collapses and resumes.
- Resize below `lg`: orbital is replaced by the accessible list.
- `prefers-reduced-motion: reduce`: list only, no spin.
- Founder quote fades/rises in on scroll; links ease on hover.
- Light + dark.

- [ ] **Step 8: Commit**

```bash
git add src/features/home/sections/Sections.tsx src/__tests__/features/home/FounderSection.test.tsx
git commit -m "feat(founder): motion quote reveal and link hover easing"
```

---

## Self-Review

**Spec coverage:**
- Drop fabricated energy/status/date; keep real q/o/t → Task 1 (only label+icon added). ✓
- `label`+`icon` on comparison, `ComparisonItem` type, icon allow-list → Tasks 1, 3. ✓
- `OrbitalComparison`: desktop spin (CSS transform, no re-render), click-expand, teal hub, button nodes, lg+ → Task 3. ✓
- Mobile + reduced-motion accessible list fallback → Task 3 (`ComparisonList`, `reduce` early return, `lg:hidden`). ✓
- Rotation approach A (CSS keyframes + counter-spin), pause on hover/expand, reduced-motion kill-switch → Task 3 (CSS + `data-paused`). ✓
- No new deps / no shadcn → Global Constraints; component uses `cn` + plain elements + lucide. ✓
- `ComparisonSection` rewire keeping Section/Eyebrow/KineticText → Task 4. ✓
- Founder light motion refresh (quote reveal + link hover), reduced-motion gated → Task 5. ✓
- Tests: node-per-item, expand toggle, fallback list content, reduced-motion renders, founder quote → Tasks 1-5. ✓
- Palette teal/zinc, willChange transform/opacity only, stable keys, no nested ternary, complexity via `OrbitalNode` extraction, UK English → Global Constraints + per-task notes. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `ComparisonItem` ({label,icon,q,o,t}) consistent across Tasks 1/3/4; `nodeAngles`/`nodeTransform` signatures match between Task 2 and Task 3; `OrbitalComparison`/`OrbitalNode`/`ComparisonList`/`ComparisonDetail` props consistent within Task 3.
