# Orbital motion rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the desktop `OrbitalComparison` so clicking a CTA rotates it to the top and opens a centre card (spin pauses), and scrolling flies the CTAs in from outside onto the ring — replacing the CSS-spin and the scroll scale.

**Architecture:** Drive rotation with a `motion` `useMotionValue` (degrees) that loops continuously and is animated to a target on click. Each node derives its `x`/`y` from `rotation` + a scroll-driven `radius` via `useTransform` (no counter-spin). Pure geometry helpers are unit-tested; the component rewrite is one cohesive change.

**Tech Stack:** React 19, `motion/react` (`useMotionValue`, `animate`, `useScroll`, `useTransform`, `AnimatePresence`), Tailwind v4, Vitest + happy-dom.

## Global Constraints

- Animation `motion/react` only — never `framer-motion`; no new deps; no `motion-plus`.
- Teal/zinc palette; `willChange` lists only transform/opacity (none on the svgEffect path).
- No nested ternaries (S3358); guard clauses; cyclomatic complexity cap 10 (keep `OrbitalNode`/helpers small).
- Stable React keys — `item.label`, never array index.
- **Never read a MotionValue in render** — only inside a `useTransform`/effect callback (e.g. `rotation.get()` lives in the transform fn, never in JSX).
- Rules of hooks: per-node `useTransform`s live **inside `OrbitalNode`** (one instance per node), never in a `.map` in the parent body.
- Hooks (`useReducedMotion`, `useState`, `useRef`, `useMotionValue`, `useScroll`, `useTransform`) run unconditionally **before** the `if (reduce) return <ComparisonList/>` guard. The auto-spin effect no-ops when `reduce` is true.
- In frame callbacks (`useTransform`), avoid object allocation — compute the number inline (use `nodeX`/`nodeY`, not an object-returning helper).
- UK English; no `console.*`; no `as any`/redundant `!`.
- Use the MotionPlus MCP (`motion`) / `css-spring` skill to tune the snap spring + fly-in.
- Before done: `yarn typecheck && yarn lint && yarn test` green.

## File Structure

- Modify `src/features/home/lib/orbital-geometry.ts` — add `baseNodeAngle`, `rotationToTop`, `nodeX`, `nodeY`, `shortestEquivalentAngle`; remove the now-unused `nodeAngles`/`nodeTransform` (in Task 2, once the component stops importing them).
- Modify `src/__tests__/features/home/orbital-geometry.test.ts` — tests for the new helpers; drop the `nodeAngles`/`nodeTransform` tests in Task 2.
- Modify `src/features/home/lib/OrbitalComparison.tsx` — rotation MotionValue, rewritten `OrbitalNode`, click-snap, centre card, scroll radius, static ring, hide infinity when open.
- Modify `src/styles.css` — remove `.orbit-spin-anim`/`.orbit-counter-spin-anim` (keyframes + classes + reduced-motion entries).
- Modify `src/__tests__/features/home/OrbitalComparison.test.tsx` — centre-card + infinity-hidden assertions.

---

### Task 1: Geometry helpers for motion-driven rotation

**Files:**
- Modify: `src/features/home/lib/orbital-geometry.ts`
- Test: `src/__tests__/features/home/orbital-geometry.test.ts`

**Interfaces:**
- Produces (consumed by Task 2):
  - `baseNodeAngle(i: number, total: number): number` — `(i/total)*360 - 90` (node 0 at top).
  - `rotationToTop(i: number, total: number): number` — `-(i/total)*360` (rotation that puts node *i* at the top).
  - `nodeX(baseAngleDeg: number, rotationDeg: number, radius: number): number` — `radius * cos((base+rot)·π/180)`.
  - `nodeY(baseAngleDeg: number, rotationDeg: number, radius: number): number` — `radius * sin((base+rot)·π/180)`.
  - `shortestEquivalentAngle(target: number, current: number): number` — `target + round((current-target)/360)*360`.

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/features/home/orbital-geometry.test.ts`:
```ts
import {
  baseNodeAngle,
  rotationToTop,
  nodeX,
  nodeY,
  shortestEquivalentAngle,
} from '@/features/home/lib/orbital-geometry'

describe('baseNodeAngle', () => {
  it('places node 0 at the top (-90) and spaces evenly', () => {
    expect(baseNodeAngle(0, 4)).toBe(-90)
    expect(baseNodeAngle(1, 4)).toBe(0)
    expect(baseNodeAngle(2, 4)).toBe(90)
  })
})

describe('rotationToTop', () => {
  it('returns the rotation that brings node i to the top', () => {
    expect(rotationToTop(0, 4)).toBe(-0)
    expect(rotationToTop(1, 4)).toBe(-90)
    expect(rotationToTop(2, 4)).toBe(-180)
  })
})

describe('nodeX / nodeY', () => {
  it('puts a top node (base -90, rotation 0) at (0, -radius)', () => {
    expect(nodeX(-90, 0, 200)).toBeCloseTo(0, 5)
    expect(nodeY(-90, 0, 200)).toBeCloseTo(-200, 5)
  })
  it('puts a right node (base 0, rotation 0) at (radius, 0)', () => {
    expect(nodeX(0, 0, 200)).toBeCloseTo(200, 5)
    expect(nodeY(0, 0, 200)).toBeCloseTo(0, 5)
  })
})

describe('shortestEquivalentAngle', () => {
  it('picks the equivalent target nearest the current angle', () => {
    expect(shortestEquivalentAngle(-90, 350)).toBe(270)
    expect(shortestEquivalentAngle(0, -10)).toBe(0)
    expect(shortestEquivalentAngle(-180, 200)).toBe(180)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/orbital-geometry.test.ts`
Expected: FAIL — the new helpers are not exported.

- [ ] **Step 3: Add the helpers to `orbital-geometry.ts`**

Append:
```ts
// Base angle (degrees) for node i, node 0 at the top (-90), evenly spaced.
export function baseNodeAngle(i: number, total: number): number {
  return (i / total) * 360 - 90
}

// Rotation (degrees) that brings node i to the top of the ring.
export function rotationToTop(i: number, total: number): number {
  return -(i / total) * 360
}

// Cartesian position of a node given its base angle, the current rotation and
// radius. Split into x/y number helpers so frame callbacks allocate nothing.
export function nodeX(baseAngleDeg: number, rotationDeg: number, radius: number): number {
  return radius * Math.cos(((baseAngleDeg + rotationDeg) * Math.PI) / 180)
}

export function nodeY(baseAngleDeg: number, rotationDeg: number, radius: number): number {
  return radius * Math.sin(((baseAngleDeg + rotationDeg) * Math.PI) / 180)
}

// The equivalent of `target` (same angle mod 360) closest to `current`, so a
// snap animation always takes the shortest path.
export function shortestEquivalentAngle(target: number, current: number): number {
  return target + Math.round((current - target) / 360) * 360
}
```
(Leave `nodeAngles`/`nodeTransform` in place for now — the component still imports them until Task 2.)

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/orbital-geometry.test.ts`
Expected: PASS (all new + existing geometry tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/home/lib/orbital-geometry.ts src/__tests__/features/home/orbital-geometry.test.ts
git commit -m "feat(orbital): geometry helpers for motion-driven rotation"
```

---

### Task 2: Rewrite the orbital — rotation MotionValue, click-snap, centre card, scroll fly-in

**Files:**
- Modify: `src/features/home/lib/OrbitalComparison.tsx`
- Modify: `src/styles.css`
- Modify: `src/features/home/lib/orbital-geometry.ts` (remove unused `nodeAngles`/`nodeTransform`)
- Test: `src/__tests__/features/home/OrbitalComparison.test.tsx`, `src/__tests__/features/home/orbital-geometry.test.ts`

**Interfaces:**
- Consumes Task 1 helpers; existing `ComparisonDetail`, `ComparisonList`, `InfinityHub`, `ICONS`, `ComparisonItem`.

- [ ] **Step 1: Update the failing tests first**

In `src/__tests__/features/home/OrbitalComparison.test.tsx`, replace the `'toggles aria-expanded on the clicked node (single-open)'` test and add centre-card / infinity assertions. Ensure `within` is imported from `@testing-library/react`. Use these tests (place inside the existing `describe('OrbitalComparison', ...)`, replacing the old aria-expanded test):
```tsx
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

  it('opens the clicked node detail in the centre card', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const { within } = await import('@testing-library/react')
    render(<OrbitalComparison items={items} />)
    await userEvent.click(screen.getAllByRole('button')[0])
    const card = screen.getByTestId('orbit-detail-card')
    expect(within(card).getByText(items[0].q)).toBeTruthy()
    expect(within(card).getByText(items[0].t, { exact: false })).toBeTruthy()
  })

  it('hides the infinity hub while a card is open', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<OrbitalComparison items={items} />)
    expect(screen.getByTestId('infinity-hub')).toBeTruthy()
    await userEvent.click(screen.getAllByRole('button')[0])
    expect(screen.queryByTestId('infinity-hub')).toBeNull()
  })
```
Keep the existing tests for node-count, the static list q/o/t, the outer ring, and the reduced-motion list. (If a test named `'still renders one node button per item with the scroll wrapper'` exists, keep it — it still holds.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx`
Expected: FAIL — there is no `orbit-detail-card` testid yet and the infinity hub is not conditionally rendered.

- [ ] **Step 3: Update imports + constants in `OrbitalComparison.tsx`**

Replace the import line and the geometry import:
```tsx
import { motion, AnimatePresence, useReducedMotion, useScroll, useTransform, useMotionValue, animate, svgEffect, motionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { FileSearch, Target, FileWarning, Fingerprint, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { baseNodeAngle, nodeX, nodeY, rotationToTop, shortestEquivalentAngle } from './orbital-geometry'
import type { ComparisonItem } from '../content'
```
Replace the constants block:
```tsx
const ICONS: Record<string, LucideIcon> = { FileSearch, Target, FileWarning, Fingerprint }
const OUTER_RADIUS = 200
const FLY_IN_RADIUS = 520
```
(`SCROLL_SCALE_RANGE` is removed.)

- [ ] **Step 4: Replace `OrbitalNode` with a MotionValue-driven node**

Replace the whole `OrbitalNode` function with:
```tsx
function OrbitalNode({
  item,
  baseAngle,
  rotation,
  radius,
  expanded,
  onToggle,
}: {
  item: ComparisonItem
  baseAngle: number
  rotation: ReturnType<typeof useMotionValue<number>>
  radius: ReturnType<typeof useTransform<number, number>>
  expanded: boolean
  onToggle: () => void
}) {
  const Icon = ICONS[item.icon] ?? FileSearch
  const x = useTransform(() => nodeX(baseAngle, rotation.get(), radius.get()))
  const y = useTransform(() => nodeY(baseAngle, rotation.get(), radius.get()))
  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{ x, y, willChange: 'transform' }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={cn(
          'absolute left-0 top-0 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 transition-colors',
          expanded
            ? 'border-teal-400 bg-teal-400 text-zinc-950'
            : 'border-white/30 bg-zinc-900 text-white hover:border-teal-400/60',
        )}
      >
        <Icon size={18} />
      </button>
      <div className="absolute left-0 top-7 -translate-x-1/2 whitespace-nowrap text-center font-mono text-[11px] uppercase tracking-widest text-white/70">
        {item.label}
      </div>
    </motion.div>
  )
}
```
Note: the `radius` prop type `ReturnType<typeof useTransform<number, number>>` is a `MotionValue<number>`; if that generic form does not typecheck cleanly, import the type with `import type { MotionValue } from 'motion/react'` and type both `rotation: MotionValue<number>` and `radius: MotionValue<number>`.

- [ ] **Step 5: Replace the `OrbitalComparison` body**

Replace the whole `export function OrbitalComparison(...)` with:
```tsx
export function OrbitalComparison({ items }: { items: readonly ComparisonItem[] }) {
  const reduce = useReducedMotion() ?? false
  const [activeId, setActiveId] = useState<string | null>(null)
  const orbitRef = useRef<HTMLDivElement>(null)
  const rotation = useMotionValue(0)
  const { scrollYProgress } = useScroll({
    target: reduce ? undefined : orbitRef,
    offset: ['start end', 'end start'],
  })
  // Nodes fly in from outside (FLY_IN_RADIUS) and settle on the ring by the
  // scroll midpoint; useTransform clamps past 0.5 so they stay on the ring.
  const radius = useTransform(scrollYProgress, [0, 0.5], [FLY_IN_RADIUS, OUTER_RADIUS])
  const activeItem = items.find((x) => x.label === activeId) ?? null

  // Continuous spin while nothing is open; stopped on cleanup (and never started
  // under reduced motion or while a node is anchored open).
  useEffect(() => {
    if (reduce || activeId !== null) return
    const controls = animate(rotation, rotation.get() + 360, {
      duration: 48,
      ease: 'linear',
      repeat: Infinity,
    })
    return () => controls.stop()
  }, [reduce, activeId, rotation])

  const handleToggle = (index: number, label: string) => {
    if (activeId === label) {
      setActiveId(null)
      return
    }
    const target = shortestEquivalentAngle(rotationToTop(index, items.length), rotation.get())
    animate(rotation, target, { type: 'spring', stiffness: 120, damping: 20 })
    setActiveId(label)
  }

  if (reduce) {
    return <ComparisonList items={items} />
  }

  return (
    <div>
      <div className="block lg:hidden">
        <ComparisonList items={items} />
      </div>

      <div
        ref={orbitRef}
        className="relative hidden h-[520px] w-full lg:block"
        onClick={() => setActiveId(null)}
      >
        <div
          aria-hidden="true"
          data-testid="orbit-ring-outer"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-teal-400/15"
          style={{ width: 2 * OUTER_RADIUS, height: 2 * OUTER_RADIUS }}
        />

        {items.map((item, i) => (
          <OrbitalNode
            key={item.label}
            item={item}
            baseAngle={baseNodeAngle(i, items.length)}
            rotation={rotation}
            radius={radius}
            expanded={activeId === item.label}
            onToggle={() => handleToggle(i, item.label)}
          />
        ))}

        {activeId === null && (
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <InfinityHub />
          </div>
        )}

        <AnimatePresence>
          {activeItem && (
            <motion.div
              key={activeItem.label}
              data-testid="orbit-detail-card"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              style={{ willChange: 'transform, opacity' }}
              onClick={(e) => e.stopPropagation()}
              className="absolute left-1/2 top-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/15 bg-zinc-950/90 p-5 backdrop-blur-lg"
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
Notes: the `group/orbit` hover-pause is intentionally dropped (superseded by click-pause, per the approved spec). The scroll `scale` wrapper is gone; `orbitRef` is on the layout-stable `h-[520px]` wrapper so `useScroll` measures an untransformed element.

- [ ] **Step 6: Remove the dead spin CSS from `src/styles.css`**

Delete the `@keyframes orbit-spin`, `@keyframes orbit-counter-spin`, `.orbit-spin-anim`, `.orbit-counter-spin-anim`, and the `.orbit-spin-anim[data-paused='true'], .orbit-counter-spin-anim[data-paused='true']` rules. Remove `.orbit-spin-anim, .orbit-counter-spin-anim` from the `@media (prefers-reduced-motion: reduce)` selector list (the orbital no longer uses any CSS animation).

- [ ] **Step 7: Remove the now-unused geometry helpers**

In `src/features/home/lib/orbital-geometry.ts`, delete `nodeAngles` and `nodeTransform` (no longer imported anywhere). In `src/__tests__/features/home/orbital-geometry.test.ts`, delete their `describe` blocks. (Verify nothing else imports them: `grep -rn "nodeAngles\|nodeTransform" src` should return only the deletions.)

- [ ] **Step 8: Run the component + geometry tests**

Run: `yarn test src/__tests__/features/home/OrbitalComparison.test.tsx src/__tests__/features/home/orbital-geometry.test.ts`
Expected: PASS — node-count, single-open aria toggle, centre-card content, infinity-hidden-on-open, outer ring, static list, reduced-motion list, and all geometry helpers.

- [ ] **Step 9: Full verification gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all PASS, zero lint errors, full suite green. Watch the `complexity` cap on `OrbitalComparison` — if it trips, extract `handleToggle`'s body or the auto-spin effect into a small named helper; node rendering is already in `OrbitalNode`.

- [ ] **Step 10: Manual UI check (controller runs separately)**

`yarn dev` (5001/next free port), open `/`, Comparison section:
- Scroll the section into view: the four CTAs start outside and travel in to settle on the ring.
- Auto-spin loops while nothing is open.
- Click a CTA: the ring rotates that node to the top (shortest path), the spin pauses, and the detail card opens centred in the ring with the infinity hidden.
- Click another CTA: it switches; click the backdrop: card closes, infinity returns, spin resumes.
- Below `lg` / `prefers-reduced-motion`: the static list (no orbital).

- [ ] **Step 11: Commit**

```bash
git add src/features/home/lib/OrbitalComparison.tsx src/styles.css src/features/home/lib/orbital-geometry.ts src/__tests__/features/home/OrbitalComparison.test.tsx src/__tests__/features/home/orbital-geometry.test.ts
git commit -m "feat(orbital): click-to-top rotation, centre card, scroll fly-in"
```

---

## Self-Review

**Spec coverage:**
- Rotation = MotionValue, auto-spin loop, click stop/resume → Task 2 (`rotation`, effect, `handleToggle`). ✓
- Node position from `rotation` + `radius` via `useTransform` x/y, no counter-spin → Task 2 (`OrbitalNode`). ✓
- Click snap to top (shortest path), spring → Task 1 (`rotationToTop`, `shortestEquivalentAngle`) + Task 2 (`handleToggle`). ✓
- Centre detail card, same spot, infinity hidden while open → Task 2 (`orbit-detail-card`, `activeId === null` hub). ✓
- Spin pause on open / resume on backdrop close → Task 2 (effect dep on `activeId`, backdrop `onClick`). ✓
- Scroll fly-in replaces scale → Task 2 (`radius` useTransform [0,0.5]→[520,200]; scale removed). ✓
- Static outer ring (testid kept) → Task 2. ✓
- Reduced-motion/mobile list unchanged; hooks before guard → Task 2. ✓
- Remove dead orbit-spin CSS + unused geometry helpers → Task 2 steps 6-7. ✓
- Tests: geometry; node count; aria toggle; centre-card content; infinity hidden; reduced-motion list → Tasks 1-2. ✓
- Constraints (motion/react only, teal/zinc, willChange, no MotionValue read in render, rules-of-hooks via per-node component, no nested ternary, stable keys, UK English) → Global Constraints + per-task notes. ✓

**Placeholder scan:** none — every step carries concrete code/commands.

**Type consistency:** `baseNodeAngle`/`rotationToTop`/`nodeX`/`nodeY`/`shortestEquivalentAngle` signatures match between Task 1 and Task 2; `rotation: MotionValue<number>` and `radius: MotionValue<number>` consistent in `OrbitalNode`/parent; `FLY_IN_RADIUS`/`OUTER_RADIUS` consistent; `orbit-detail-card` testid used in both the test and the card.
