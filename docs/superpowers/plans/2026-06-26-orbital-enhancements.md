# Orbital enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an orbit-path outline ring, a decorative second concentric ring, a traced infinity-symbol hub, and a scroll-linked scale to the existing `OrbitalComparison`.

**Architecture:** All four additions live inside the existing `lg:`-only orbital branch of `src/features/home/lib/OrbitalComparison.tsx`, via small extracted sub-components (`OrbitRing`, `InnerRing`, `InfinityHub`) plus a `useScroll`/`useTransform` scale wrapper. The mobile + reduced-motion fallback list is untouched. Infinity trace and scroll use core `motion` — no `motion-plus`.

**Tech Stack:** React 19, `motion/react` (`motion.path` `pathLength`, `useScroll`, `useTransform`), Tailwind v4, Vitest + happy-dom.

## Global Constraints

- Animation `motion/react` only — never `framer-motion`; no `motion-plus` package; no new dependencies.
- Palette teal/zinc only; `willChange` may list only transform/opacity/clipPath/filter (do NOT put `willChange` on the infinity path — `pathLength` drives stroke-dash, not a compositor prop).
- No nested ternaries (S3358); guard clauses; cyclomatic complexity cap 10 (keep the extracted sub-components small).
- Stable React keys — use the angle value for decorative dots, never the array index.
- Hooks run unconditionally BEFORE the `if (reduce) return <ComparisonList/>` guard.
- Never read a `MotionValue` (`scale.get()`) in render — bind via `style` only.
- Keep the existing hover-pause (`group-hover/orbit`), expand-pause (`data-paused`), expand card, node buttons, and the list fallback exactly as they are.
- Decorative rings/dots/hub are `aria-hidden`; only the 4 real nodes are interactive. No fabricated data.
- UK English; no `console.*`; no `as any`/redundant `!`.
- Use the MotionPlus MCP (`motion`) / `css-spring` skill to tune the trace + scroll feel if needed.
- Before done: `yarn typecheck && yarn lint && yarn test` green.

## File Structure

- Modify `src/features/home/lib/OrbitalComparison.tsx` — constants, `OrbitRing`, `InnerRing`, `InfinityHub`, scroll wrapper.
- Modify `src/styles.css` — `.orbit-spin-slow-anim` keyframes + reduced-motion kill-switch entry.
- Modify `src/__tests__/features/home/OrbitalComparison.test.tsx` — add assertions for the new elements.

Current relevant code (for reference): constants `const RADIUS = 200`; the orbital `lg:block` container holds `.orbit-spin-anim` ring of `OrbitalNode` buttons, a teal-gradient hub `<div>` containing `<div className="h-7 w-7 rounded-full bg-white/80 backdrop-blur-md" />`, and an `AnimatePresence` expand card. Geometry helpers `nodeAngles(total)` / `nodeTransform(angle, radius)` already exist.

---

### Task 1: Constants + orbit-path outline rings

**Files:**
- Modify: `src/features/home/lib/OrbitalComparison.tsx`
- Test: `src/__tests__/features/home/OrbitalComparison.test.tsx`

**Interfaces:**
- Produces: `OUTER_RADIUS = 200`, `INNER_RADIUS = 120` constants; an `OrbitRing` sub-component rendering an `aria-hidden` centred ring with a `data-testid`. Consumed by Tasks 2-4.

- [ ] **Step 1: Add the failing test**

Append inside the `describe('OrbitalComparison', ...)` block in `src/__tests__/features/home/OrbitalComparison.test.tsx`:
```tsx
  it('renders the outer and inner orbit-path outline rings', () => {
    render(<OrbitalComparison items={items} />)
    expect(screen.getByTestId('orbit-ring-outer')).toBeTruthy()
    expect(screen.getByTestId('orbit-ring-inner')).toBeTruthy()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: FAIL — no element with testid `orbit-ring-outer`.

- [ ] **Step 3: Rename the radius constant and add the inner radius**

In `OrbitalComparison.tsx`, replace `const RADIUS = 200` with:
```tsx
const OUTER_RADIUS = 200
const INNER_RADIUS = 120
```
Then update the single `nodeTransform(angles[i], RADIUS)` call (in the `items.map` for `OrbitalNode`) to `nodeTransform(angles[i], OUTER_RADIUS)`.

- [ ] **Step 4: Add the `OrbitRing` component**

Add above `OrbitalComparison` (e.g. after `OrbitalNode`):
```tsx
function OrbitRing({
  diameter,
  className,
  testId,
}: {
  diameter: number
  className: string
  testId: string
}) {
  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      className={cn(
        'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border',
        className,
      )}
      style={{ width: diameter, height: diameter }}
    />
  )
}
```

- [ ] **Step 5: Render the two rings in the orbital container**

In the orbital `lg:block` container, add the two rings as the FIRST children (so they sit behind the nodes), immediately inside the `<div className="group/orbit relative hidden h-[520px] w-full lg:block" ...>`:
```tsx
        <OrbitRing diameter={2 * OUTER_RADIUS} className="border-teal-400/15" testId="orbit-ring-outer" />
        <OrbitRing diameter={2 * INNER_RADIUS} className="border-white/5" testId="orbit-ring-inner" />
```

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: PASS (existing tests + the new ring test).

- [ ] **Step 7: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: PASS, zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/features/home/lib/OrbitalComparison.tsx src/__tests__/features/home/OrbitalComparison.test.tsx
git commit -m "feat(orbital): add orbit-path outline rings + INNER_RADIUS"
```

---

### Task 2: Inner decorative ring of dots

**Files:**
- Modify: `src/features/home/lib/OrbitalComparison.tsx`
- Modify: `src/styles.css`
- Test: `src/__tests__/features/home/OrbitalComparison.test.tsx`

**Interfaces:**
- Consumes: `INNER_RADIUS` (Task 1), `nodeAngles`/`nodeTransform`.
- Produces: `INNER_DOTS = 6` constant; `InnerRing` sub-component rendering `INNER_DOTS` `aria-hidden` dots with `data-testid="orbit-inner-dot"`, spinning via `.orbit-spin-slow-anim`.

- [ ] **Step 1: Add the failing test**

Append inside `describe('OrbitalComparison', ...)`:
```tsx
  it('renders the inner ring decorative dots', () => {
    render(<OrbitalComparison items={items} />)
    expect(screen.getAllByTestId('orbit-inner-dot')).toHaveLength(6)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: FAIL — no `orbit-inner-dot` elements.

- [ ] **Step 3: Add the slow-spin CSS to `src/styles.css`**

Add after the existing `.orbit-spin-anim` / `.orbit-counter-spin-anim` block:
```css
@keyframes orbit-spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.orbit-spin-slow-anim { animation: orbit-spin-slow 72s linear infinite; will-change: transform; }
.orbit-spin-slow-anim[data-paused='true'] { animation-play-state: paused; }
```
Then append `, .orbit-spin-slow-anim` to the existing `@media (prefers-reduced-motion: reduce)` selector list (the line ending `… .orbit-spin-anim, .orbit-counter-spin-anim { animation: none !important; }`), so it becomes:
```css
  .belt-scroll-anim, .scan-sweep-anim, .item-state-anim, .pipe-pulse-anim, .node-glow-anim, .gradient-sweep-anim, .marquee-anim, .orbit-spin-anim, .orbit-counter-spin-anim, .orbit-spin-slow-anim { animation: none !important; }
```

- [ ] **Step 4: Add the `INNER_DOTS` constant and `InnerRing` component**

Add `const INNER_DOTS = 6` next to the other constants. Add this component above `OrbitalComparison`:
```tsx
function InnerRing({ paused }: { paused: boolean }) {
  const angles = nodeAngles(INNER_DOTS)
  return (
    <div className="absolute left-1/2 top-1/2" aria-hidden="true">
      <div
        className="orbit-spin-slow-anim group-hover/orbit:[animation-play-state:paused]"
        style={{ willChange: 'transform' }}
        data-paused={paused ? 'true' : undefined}
      >
        {angles.map((a) => (
          <span
            key={a}
            data-testid="orbit-inner-dot"
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-400/50"
            style={{ transform: nodeTransform(a, INNER_RADIUS) }}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Render `InnerRing` in the orbital container**

Add `<InnerRing paused={paused} />` immediately after the two `OrbitRing` elements (so the dots sit on the inner outline, behind the real nodes). `paused` is the existing `const paused = activeId !== null`.

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: PASS, zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/features/home/lib/OrbitalComparison.tsx src/styles.css src/__tests__/features/home/OrbitalComparison.test.tsx
git commit -m "feat(orbital): add decorative inner ring of dots (slow spin)"
```

---

### Task 3: Traced infinity-symbol hub

**Files:**
- Modify: `src/features/home/lib/OrbitalComparison.tsx`
- Test: `src/__tests__/features/home/OrbitalComparison.test.tsx`

**Interfaces:**
- Consumes: `motion` (already imported from `motion/react`).
- Produces: `InfinityHub` sub-component rendering an `aria-hidden` `<svg>` with a `<motion.path>` lemniscate that traces via `pathLength`. Replaces the hub's inner white dot.

- [ ] **Step 1: Add the failing test**

Append inside `describe('OrbitalComparison', ...)`:
```tsx
  it('renders an infinity-symbol path at the hub', () => {
    const { container } = render(<OrbitalComparison items={items} />)
    expect(container.querySelector('svg path')).not.toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: FAIL — no `svg path` in the tree.

- [ ] **Step 3: Add the `InfinityHub` component**

Add the path constant near the other constants:
```tsx
// Lemniscate (figure-eight) traced by the hub.
const INFINITY_PATH =
  'M 50 25 C 50 10 75 10 75 25 C 75 40 50 40 50 25 C 50 10 25 10 25 25 C 25 40 50 40 50 25'
```
Add the component above `OrbitalComparison`:
```tsx
function InfinityHub() {
  return (
    <svg
      viewBox="0 0 100 50"
      aria-hidden="true"
      className="h-8 w-12"
      style={{ filter: 'drop-shadow(0 0 6px rgba(45,212,191,0.6))' }}
    >
      <motion.path
        d={INFINITY_PATH}
        fill="none"
        stroke="#2dd4bf"
        strokeWidth={4}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  )
}
```
(No `willChange` on the path — `pathLength` drives stroke-dash, not a compositor property.)

- [ ] **Step 4: Replace the hub's inner white dot with `InfinityHub`**

In the hub `<div className="absolute left-1/2 top-1/2 grid h-16 w-16 ... rounded-full bg-gradient-to-br from-teal-400 to-emerald-600">`, replace its child:
```tsx
          <div className="h-7 w-7 rounded-full bg-white/80 backdrop-blur-md" />
```
with:
```tsx
          <InfinityHub />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: PASS, zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/home/lib/OrbitalComparison.tsx src/__tests__/features/home/OrbitalComparison.test.tsx
git commit -m "feat(orbital): traced infinity-symbol hub (motion pathLength)"
```

---

### Task 4: Scroll-linked expansion + final gate

**Files:**
- Modify: `src/features/home/lib/OrbitalComparison.tsx`
- Test: `src/__tests__/features/home/OrbitalComparison.test.tsx`

**Interfaces:**
- Consumes: `useScroll`, `useTransform` from `motion/react`; `useRef` from `react`.
- Produces: a `motion.div` scale wrapper around the orbital, driven by section scroll progress.

- [ ] **Step 1: Add the failing test**

Append inside `describe('OrbitalComparison', ...)`:
```tsx
  it('still renders one node button per item with the scroll wrapper', () => {
    render(<OrbitalComparison items={items} />)
    expect(screen.getAllByRole('button')).toHaveLength(items.length)
  })
```
(This test passes today; it is a regression guard that the scroll wrapper does not change node rendering. It will be re-run after Step 4.)

- [ ] **Step 2: Run the full file to capture the baseline**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: all current tests PASS (the new guard included).

- [ ] **Step 3: Extend the imports**

Update the imports at the top of `OrbitalComparison.tsx`:
```tsx
import { motion, AnimatePresence, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef, useState } from 'react'
```
Add the scale-range constant near the others:
```tsx
const SCROLL_SCALE_RANGE = [0.82, 1.06] as const
```

- [ ] **Step 4: Add the scroll hooks and wrap the orbital**

In `OrbitalComparison`, add these hooks BEFORE the `if (reduce) return <ComparisonList items={items} />` guard (after the existing `useState`):
```tsx
  const orbitRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: orbitRef,
    offset: ['start end', 'end start'],
  })
  const scale = useTransform(scrollYProgress, [0, 1], [...SCROLL_SCALE_RANGE])
```
Then change the orbital branch. Replace the current single orbital container:
```tsx
      <div
        className="group/orbit relative hidden h-[520px] w-full lg:block"
        onClick={() => setActiveId(null)}
      >
        {/* rings, spin ring, hub, card */}
      </div>
```
with a non-scaled ref wrapper holding a scaled `motion.div`:
```tsx
      <div ref={orbitRef} className="hidden lg:block">
        <motion.div
          style={{ scale, willChange: 'transform' }}
          className="group/orbit relative h-[520px] w-full"
          onClick={() => setActiveId(null)}
        >
          {/* rings, spin ring, hub, card — unchanged children */}
        </motion.div>
      </div>
```
Keep ALL existing children (the two `OrbitRing`s, `InnerRing`, the spin ring of `OrbitalNode`s, the hub with `InfinityHub`, and the `AnimatePresence` card) exactly as they are — only the wrapping element changes. The `orbitRef` sits on the layout-stable outer wrapper (so `useScroll` measures a non-scaled element); the inner `motion.div` carries the scale.

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: PASS — all tests including the button-count guard, ring, dots, and infinity tests.

- [ ] **Step 6: Full verification gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all PASS, zero lint errors, full suite green (no regressions). Watch the `complexity` cap on `OrbitalComparison` — if it trips, the rings/dots/hub are already extracted; no further change should be needed.

- [ ] **Step 7: Manual UI check (controller runs separately)**

`yarn dev` (5001), open `/`, scroll to the Comparison section:
- Outer + inner outline rings visible; 6 inner dots orbit at a slower speed than the nodes.
- Hub traces an infinity symbol on a 3s loop with a teal glow.
- Scrolling the section through the viewport scales the orbital ~0.82 -> 1.06.
- Hover pauses both rings; clicking a node pauses + expands; backdrop collapses.
- Below `lg` and under `prefers-reduced-motion`: the static list (no rings/scroll).

- [ ] **Step 8: Commit**

```bash
git add src/features/home/lib/OrbitalComparison.tsx src/__tests__/features/home/OrbitalComparison.test.tsx
git commit -m "feat(orbital): scroll-linked scale expansion (useScroll/useTransform)"
```

---

## Self-Review

**Spec coverage:**
- Orbit-path outline ring → Task 1 (`OrbitRing`, outer + inner). ✓
- Second concentric ring of decorative dots, different speed → Task 2 (`InnerRing`, `.orbit-spin-slow-anim` 72s). ✓
- Infinity-symbol hub, traced via `pathLength` → Task 3 (`InfinityHub`, `motion.path`). ✓
- Scroll-linked expansion, whole-orbital scale → Task 4 (`useScroll`/`useTransform`, scale 0.82-1.06). ✓
- Hooks before reduce guard; no `scale.get()` in render → Task 4. ✓
- No new deps / no motion-plus; core motion only → Global Constraints + Tasks 3-4. ✓
- Decorative elements aria-hidden, only 4 real nodes interactive, no fabricated data → Tasks 1-3. ✓
- Reduced-motion + mobile list untouched; hover/expand pause kept → all tasks operate inside the orbital branch only. ✓
- willChange transform/opacity only (none on the path) → Tasks 2-4. ✓
- styles.css kill-switch entry → Task 2. ✓
- Tests: rings, dots count, infinity path, node-count guard, reduced-motion list → Tasks 1-4 (existing reduced-motion test unchanged). ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `OUTER_RADIUS`/`INNER_RADIUS`/`INNER_DOTS`/`SCROLL_SCALE_RANGE` constants, `OrbitRing`/`InnerRing`/`InfinityHub` props, and the `nodeAngles`/`nodeTransform` signatures are consistent across tasks. `paused` (existing `activeId !== null`) is threaded into `InnerRing`.
