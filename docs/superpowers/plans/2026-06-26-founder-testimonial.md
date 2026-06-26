# Founder testimonial redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `FounderSection` into a centred testimonial with a teal-highlighted "Tucaken Resumes" phrase and motion reveal.

**Architecture:** A pure `highlightParts` helper splits the quote into plain/highlighted segments; `FounderSection` renders them centred via `<strong>` (no `dangerouslySetInnerHTML`, no `next/image`), re-skinned teal/zinc, with `motion/react` reveals.

**Tech Stack:** React 19, `motion/react`, Tailwind v4, Vitest + happy-dom.

## Global Constraints

- Animation `motion/react` only — never `framer-motion`; no new deps; no `next/image`; no `dangerouslySetInnerHTML`.
- Teal/zinc palette; `willChange` lists only transform/opacity.
- No nested ternaries (single ternary in a map is fine); complexity <= 10; stable keys (`${part.text}-${i}`); UK English; no `console.*`; no `as any`.
- Reduced-motion gated (static fallback); keep the `Section` + `Eyebrow`.
- No generic `components/ui/Testimonial` (used once — inline into `FounderSection`).
- Before done: `yarn typecheck && yarn lint && yarn test` green.

## File Structure

- Create `src/features/home/lib/highlight.ts` — `highlightParts` pure helper + `HighlightPart` type.
- Create `src/__tests__/features/home/highlight.test.ts`.
- Modify `src/features/home/content.ts` — first `Tucaken` -> `Tucaken Resumes` in `founder.quote`.
- Modify `src/features/home/sections/Sections.tsx` — rewrite `FounderSection`.
- Modify `src/__tests__/features/home/FounderSection.test.tsx` — updated quote substring + highlight assertion.

---

### Task 1: `highlightParts` pure helper

**Files:**
- Create: `src/features/home/lib/highlight.ts`
- Test: `src/__tests__/features/home/highlight.test.ts`

**Interfaces:**
- Produces: `type HighlightPart = { text: string; highlight: boolean }` and
  `highlightParts(text: string, term: string): HighlightPart[]`. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/home/highlight.test.ts
import { describe, it, expect } from 'vitest'
import { highlightParts } from '@/features/home/lib/highlight'

describe('highlightParts', () => {
  it('splits around a single occurrence of the term', () => {
    expect(highlightParts('I built Tucaken Resumes today', 'Tucaken Resumes')).toEqual([
      { text: 'I built ', highlight: false },
      { text: 'Tucaken Resumes', highlight: true },
      { text: ' today', highlight: false },
    ])
  })

  it('highlights every occurrence', () => {
    expect(highlightParts('a X b X', 'X')).toEqual([
      { text: 'a ', highlight: false },
      { text: 'X', highlight: true },
      { text: ' b ', highlight: false },
      { text: 'X', highlight: true },
    ])
  })

  it('returns a single plain part when the term is absent', () => {
    expect(highlightParts('hello world', 'zzz')).toEqual([
      { text: 'hello world', highlight: false },
    ])
  })

  it('returns a single plain part when the term is empty', () => {
    expect(highlightParts('hello', '')).toEqual([{ text: 'hello', highlight: false }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/highlight.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/home/lib/highlight.ts
// Splits text into ordered segments, flagging segments that equal `term` for
// emphasis. Used to render a highlighted phrase as <strong> without
// dangerouslySetInnerHTML. Matches the literal term (no regex), so there is no
// injection risk from the term value.
export type HighlightPart = { text: string; highlight: boolean }

export function highlightParts(text: string, term: string): HighlightPart[] {
  if (!term) return [{ text, highlight: false }]
  const parts: HighlightPart[] = []
  let rest = text
  let idx = rest.indexOf(term)
  while (idx !== -1) {
    if (idx > 0) parts.push({ text: rest.slice(0, idx), highlight: false })
    parts.push({ text: term, highlight: true })
    rest = rest.slice(idx + term.length)
    idx = rest.indexOf(term)
  }
  if (rest) parts.push({ text: rest, highlight: false })
  return parts
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/highlight.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/home/lib/highlight.ts src/__tests__/features/home/highlight.test.ts
git commit -m "feat(founder): highlightParts helper for safe phrase emphasis"
```

---

### Task 2: Rewrite `FounderSection` as a centred testimonial

**Files:**
- Modify: `src/features/home/content.ts`
- Modify: `src/features/home/sections/Sections.tsx`
- Test: `src/__tests__/features/home/FounderSection.test.tsx`

**Interfaces:**
- Consumes: `highlightParts` (Task 1); existing `Section`, `Eyebrow`, `motion`, `useReducedMotion`, `founder`.

- [ ] **Step 1: Update the test first**

Replace the body of `src/__tests__/features/home/FounderSection.test.tsx` with:
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
  it('renders the founder name and role', () => {
    render(<FounderSection />)
    expect(screen.getByText(founder.name)).toBeTruthy()
    expect(screen.getByText(founder.role)).toBeTruthy()
  })

  it('renders the quote inside a blockquote with the highlighted phrase', () => {
    const { container } = render(<FounderSection />)
    expect(container.querySelector('blockquote')).not.toBeNull()
    expect(container.textContent).toContain('I built Tucaken Resumes because')
    const strong = container.querySelector('strong')
    expect(strong?.textContent).toBe('Tucaken Resumes')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/__tests__/features/home/FounderSection.test.tsx`
Expected: FAIL — the quote still says "I built Tucaken because" and there is no `<strong>`.

- [ ] **Step 3: Edit the quote in `content.ts`**

In `founder.quote`, change the FIRST `Tucaken` to `Tucaken Resumes`. The exact new value:
```ts
  quote: 'I built Tucaken Resumes because every resume tool I tried produced something that did not sound like me. I had years of real work in my GitHub that no tool could read. Tucaken is the tool I built for myself — I use it for my own job search every day.',
```
(Only the first mention changes; the later "Tucaken is the tool…" stays.)

- [ ] **Step 4: Add the import to `Sections.tsx`**

Add to the top import block:
```tsx
import { highlightParts } from '../lib/highlight'
```

- [ ] **Step 5: Replace the `FounderSection` body**

Replace the whole `export function FounderSection() { … }` with:
```tsx
export function FounderSection() {
  const reduce = useReducedMotion() ?? false
  const parts = highlightParts(founder.quote, 'Tucaken Resumes')
  return (
    <Section className="border-t border-white/5">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <Eyebrow>Built by a user, for users</Eyebrow>

        <motion.blockquote
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={reduce ? undefined : { willChange: 'transform, opacity' }}
          className="mt-6 text-balance text-xl leading-relaxed text-zinc-100 sm:text-2xl"
        >
          &ldquo;
          {parts.map((part, i) =>
            part.highlight ? (
              <strong key={`${part.text}-${i}`} className="font-semibold text-teal-300">
                {part.text}
              </strong>
            ) : (
              <span key={`${part.text}-${i}`}>{part.text}</span>
            ),
          )}
          &rdquo;
        </motion.blockquote>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.15 }}
          style={reduce ? undefined : { willChange: 'transform, opacity' }}
        >
          <div className="mt-6 font-medium text-zinc-300">{founder.name}</div>
          <div className="mt-1.5 text-sm text-zinc-500">{founder.role}</div>
        </motion.div>
      </div>
    </Section>
  )
}
```
This removes the avatar, the top name/role block, the LinkedIn/GitHub links, and the bordered card. The `part.highlight ? … : …` is a single (non-nested) ternary inside the map — allowed. If after this `motion`/`useReducedMotion` are unused elsewhere in the file, leave the imports — other sections still use them.

- [ ] **Step 6: Run the test to verify it passes**

Run: `yarn test src/__tests__/features/home/FounderSection.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Full verification gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all PASS, zero lint errors, full suite green (the `content.ts` quote change touches only this section; confirm no other test asserts the old "I built Tucaken because" string — `grep -rn "I built Tucaken because" src` should return nothing after this).

- [ ] **Step 8: Manual UI check (controller runs separately)**

`yarn dev`, open `/`, Founder section: centred quote with **Tucaken Resumes** bold in teal, name + role beneath, reveal on scroll; reduced-motion static; no avatar/links/card.

- [ ] **Step 9: Commit**

```bash
git add src/features/home/content.ts src/features/home/sections/Sections.tsx src/__tests__/features/home/FounderSection.test.tsx
git commit -m "feat(founder): centred testimonial with highlighted Tucaken Resumes"
```

---

## Self-Review

**Spec coverage:**
- `highlightParts` pure helper (0/1/many/empty) → Task 1. ✓
- Quote first-mention edit to "Tucaken Resumes" → Task 2 Step 3. ✓
- Centred testimonial, no card/image/links, keep Section + Eyebrow → Task 2 Step 5. ✓
- Highlight via `<strong>` teal, no `dangerouslySetInnerHTML`/`next/image` → Task 2 Step 5. ✓
- Motion reveal (quote + name/role), reduced-motion gated, willChange transform/opacity → Task 2 Step 5. ✓
- No generic Testimonial primitive (inlined) → File Structure. ✓
- Tests: helper + FounderSection (name/role/quote/strong) → Tasks 1-2. ✓
- Teal/zinc, no nested ternary, stable keys, UK English → Global Constraints + notes. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `HighlightPart`/`highlightParts` signature consistent between Task 1 and Task 2; `founder.quote` new value used consistently in the content edit and the test assertion (`I built Tucaken Resumes because`).
