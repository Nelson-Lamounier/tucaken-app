# Home Redesign (Kinetic / Bold) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the public Home page with a kinetic/bold motion language (oversized kinetic type, marquee/conveyor motifs, gradient sweeps, scroll-driven motion) while keeping the teal+zinc colours and all copy.

**Architecture:** Add a small reusable motion toolkit (`Marquee`, `KineticText`, `ScrollProgress`) plus CSS keyframes, then restyle each section to use them. Existing components (`MagneticButton`, `RepoCard`, `MeshBg`, `pipe-pulse`) are reused. Pricing business logic and all `content.ts` copy are untouched.

**Tech Stack:** TanStack Start, React 19, `motion@^12` (import from `motion/react`), Tailwind v4 (`@theme` in `src/styles.css`), `lucide-react`, Vitest (node env), `cn` from `@/lib/utils`.

## Global Constraints

- Animation imports from `motion/react` only — never `framer-motion`. (`.claude/rules/motion-react.md`)
- Animate only `transform` / `opacity` / `clipPath` / `filter`; set matching `willChange`. Use independent transforms (`x`, `scaleX`). Never read a `MotionValue` during render.
- Every new animation has a reduced-motion path (a styles.css kill-switch class **or** `useReducedMotion()`).
- Colours: teal accent (`--accent`) + zinc only. No new shadcn token set. No arbitrary hex outside the `@theme` block where avoidable.
- SonarQube/ESLint: cyclomatic complexity ≤ 10 (extract helpers), no nested ternaries (guard clauses / early returns), `Set.has()` for membership, stable React keys, `crypto.randomUUID()` for ids, `Number.parseInt`/`Number.isNaN`, no `console.*` in app code.
- UK English in prose/comments. Term is `resume` (no diacritics). Product name "Tucaken".
- New chrome uses `rounded-md`; existing large card radii (`rounded-2xl/3xl`) are kept intentionally.
- Tests live under `src/__tests__/**` and run in **node env** (no DOM) — test pure helpers only. Vitest globals are on (`describe`/`it`/`expect` available without import).
- Before "done": `yarn typecheck && yarn lint && yarn test` all green.

---

### Task 1: Motion toolkit — `Marquee` + CSS keyframes

**Files:**
- Modify: `src/styles.css` (add `gradient-sweep` keyframe + classes, extend reduced-motion rule)
- Create: `src/features/home/lib/marquee-util.ts` (pure helper)
- Create: `src/features/home/lib/Marquee.tsx`
- Test: `src/__tests__/features/home/marquee-util.test.ts`

**Interfaces:**
- Produces: `repeatForLoop<T>(items: T[], times?: number): T[]` (default `times = 2`); `Marquee` component with props `{ children: ReactNode; speed?: number; reverse?: boolean; className?: string }`.
- Consumes: existing `belt-scroll` keyframe in `src/styles.css`, `cn` from `@/lib/utils`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/home/marquee-util.test.ts
import { repeatForLoop } from '@/features/home/lib/marquee-util'

describe('repeatForLoop', () => {
  it('duplicates the list twice by default for a seamless loop', () => {
    expect(repeatForLoop(['a', 'b'])).toEqual(['a', 'b', 'a', 'b'])
  })

  it('repeats the given number of times', () => {
    expect(repeatForLoop([1], 3)).toEqual([1, 1, 1])
  })

  it('returns an empty array for empty input', () => {
    expect(repeatForLoop([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/marquee-util.test.ts`
Expected: FAIL — cannot resolve `@/features/home/lib/marquee-util`.

- [ ] **Step 3: Write the pure helper**

```ts
// src/features/home/lib/marquee-util.ts
// Duplicate a list so a -50% translateX marquee loops seamlessly.
export function repeatForLoop<T>(items: T[], times = 2): T[] {
  const out: T[] = []
  for (let i = 0; i < times; i++) {
    for (let j = 0; j < items.length; j++) out.push(items[j])
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/marquee-util.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add CSS keyframes + reduced-motion freeze**

In `src/styles.css`, after the existing `.node-glow-anim` block (around line 80) and BEFORE the `@media (prefers-reduced-motion: reduce)` block, add:

```css
@keyframes gradient-sweep {
  0% { background-position: 0% center; }
  100% { background-position: 200% center; }
}
.gradient-sweep-anim {
  background-size: 200% auto;
  animation: gradient-sweep 6s linear infinite;
}
.marquee-anim {
  animation: belt-scroll var(--marquee-duration, 32s) linear infinite;
}
.marquee-anim[data-reverse='true'] {
  animation-direction: reverse;
}
```

Then extend the existing reduced-motion rule (it currently lists `.belt-scroll-anim, .scan-sweep-anim, .item-state-anim, .pipe-pulse-anim, .node-glow-anim`) to also include `.gradient-sweep-anim` and `.marquee-anim`:

```css
@media (prefers-reduced-motion: reduce) {
  .belt-scroll-anim, .scan-sweep-anim, .item-state-anim, .pipe-pulse-anim, .node-glow-anim, .gradient-sweep-anim, .marquee-anim { animation: none !important; }
}
```

- [ ] **Step 6: Write the `Marquee` component**

```tsx
// src/features/home/lib/Marquee.tsx
"use client"
// Horizontal infinite-scroll band. Compositor-only (translateX via the
// `belt-scroll` keyframe). The track is duplicated so -50% loops seamlessly;
// the second copy is aria-hidden. Frozen by the reduced-motion kill-switch.
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  speed?: number
  reverse?: boolean
  className?: string
}

export function Marquee({ children, speed = 32, reverse = false, className }: Props) {
  return (
    <div className={cn('relative w-full overflow-hidden', className)}>
      <div
        className="marquee-anim flex w-max"
        data-reverse={reverse ? 'true' : undefined}
        style={{ '--marquee-duration': `${speed}s`, willChange: 'transform' } as React.CSSProperties}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: zero errors.

- [ ] **Step 8: Commit** [git-commit skill]

```bash
git add src/styles.css src/features/home/lib/marquee-util.ts src/features/home/lib/Marquee.tsx src/__tests__/features/home/marquee-util.test.ts
git commit -m "feat(home): add Marquee toolkit and gradient-sweep keyframes"
```

---

### Task 2: Motion toolkit — `KineticText`

**Files:**
- Create: `src/features/home/lib/kinetic-util.ts` (pure helper)
- Create: `src/features/home/lib/KineticText.tsx`
- Test: `src/__tests__/features/home/kinetic-util.test.ts`

**Interfaces:**
- Produces: `splitTokens(text: string): string[]` (splits on runs of whitespace, drops empties); `KineticText` component with props `{ text: string; as?: 'h1' | 'h2' | 'span'; className?: string; stagger?: number }`.
- Consumes: `motion`, `useReducedMotion` from `motion/react`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/home/kinetic-util.test.ts
import { splitTokens } from '@/features/home/lib/kinetic-util'

describe('splitTokens', () => {
  it('splits a sentence into words', () => {
    expect(splitTokens('Now your resume can.')).toEqual(['Now', 'your', 'resume', 'can.'])
  })

  it('collapses multiple spaces and trims', () => {
    expect(splitTokens('  a   b ')).toEqual(['a', 'b'])
  })

  it('returns an empty array for an empty string', () => {
    expect(splitTokens('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/kinetic-util.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the pure helper**

```ts
// src/features/home/lib/kinetic-util.ts
// Split a heading into word tokens for staggered on-view reveal.
export function splitTokens(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/kinetic-util.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the `KineticText` component**

```tsx
// src/features/home/lib/KineticText.tsx
"use client"
// Reveals a heading word-by-word on scroll into view: each token clips up
// from below with a stagger. Independent transforms only; reduced motion
// renders the text statically (no clip, no offset).
import { motion, useReducedMotion } from 'motion/react'
import { splitTokens } from './kinetic-util'

interface Props {
  text: string
  as?: 'h1' | 'h2' | 'span'
  className?: string
  stagger?: number
}

export function KineticText({ text, as = 'h2', className, stagger = 0.06 }: Props) {
  const reduce = useReducedMotion() ?? false
  const tokens = splitTokens(text)
  const MotionTag = motion[as]

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      transition={{ staggerChildren: reduce ? 0 : stagger }}
    >
      {tokens.map((token, i) => (
        <span key={`${token}-${i}`} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className="inline-block"
            style={{ willChange: 'transform, opacity' }}
            variants={{
              hidden: { y: reduce ? 0 : '100%', opacity: reduce ? 1 : 0 },
              show: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 120, damping: 18 } },
            }}
          >
            {token}
          </motion.span>
          {i < tokens.length - 1 ? ' ' : null}
        </span>
      ))}
    </MotionTag>
  )
}
```

- [ ] **Step 6: Verify typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: zero errors. (If `motion[as]` triggers a TS index error, type it as `const MotionTag = motion[as] as typeof motion.h2`.)

- [ ] **Step 7: Commit** [git-commit skill]

```bash
git add src/features/home/lib/kinetic-util.ts src/features/home/lib/KineticText.tsx src/__tests__/features/home/kinetic-util.test.ts
git commit -m "feat(home): add KineticText word-reveal heading"
```

---

### Task 3: Motion toolkit — `ScrollProgress`

**Files:**
- Create: `src/features/home/lib/ScrollProgress.tsx`

**Interfaces:**
- Produces: `ScrollProgress` component (no props). A fixed teal bar at the top whose `scaleX` follows page scroll.
- Consumes: `motion`, `useScroll`, `useSpring` from `motion/react`.

- [ ] **Step 1: Write the component**

```tsx
// src/features/home/lib/ScrollProgress.tsx
"use client"
// Fixed scroll-progress bar. scaleX is driven by a MotionValue (scrollYProgress
// smoothed by a spring) and bound via style — never read during render.
import { motion, useScroll, useSpring } from 'motion/react'

export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })

  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-teal-400 to-emerald-500"
      style={{ scaleX, willChange: 'transform' }}
    />
  )
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: zero errors.

- [ ] **Step 3: Commit** [git-commit skill]

```bash
git add src/features/home/lib/ScrollProgress.tsx
git commit -m "feat(home): add ScrollProgress top bar"
```

---

### Task 4: Hero redesign + `repos` content

**Files:**
- Modify: `src/features/home/content.ts` (append a `repos` array)
- Modify: `src/features/home/sections/HeroSection.tsx`

**Interfaces:**
- Consumes: `KineticText` (Task 2), `Marquee` (Task 1), `repeatForLoop` (Task 1), existing `RepoCard`/`Repo` (`./lib/RepoCard`), `MagneticButton`, `MeshBg`, `hero` from `content.ts`.
- Produces: `repos: Repo[]` export in `content.ts`.

- [ ] **Step 1: Append `repos` to `content.ts`**

Add at the end of `src/features/home/content.ts` (the `Repo` shape is `{ name, desc, meta, lang, color }`):

```ts
export const repos = [
  { name: 'platform-eks', desc: 'Zero-trust network policies, autoscaling', meta: 'PR #284 · merged', lang: 'YAML', color: '#2dd4bf' },
  { name: 'cost-optimiser', desc: 'Spot-fleet scheduler, −38% spend', meta: '14 commits this week', lang: 'Go', color: '#34d399' },
  { name: 'kafka-migration', desc: 'Event backbone cutover · ADR-007', meta: '99.95% uptime', lang: 'Rust', color: '#22d3ee' },
  { name: 'tucaken-app', desc: 'TanStack Start SSR web app', meta: 'main · green', lang: 'TS', color: '#5eead4' },
  { name: 'rds-bootstrap', desc: 'Aurora DSQL migrations, IAM auth', meta: 'release v2.1', lang: 'SQL', color: '#2dd4bf' },
] as const
```

- [ ] **Step 2: Rewrite `HeroSection.tsx`**

Replace the whole file with:

```tsx
// src/features/home/sections/HeroSection.tsx
"use client"
import { motion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { MagneticButton } from '../lib/MagneticButton'
import { MeshBg } from '../lib/MeshBg'
import { Marquee } from '../lib/Marquee'
import { KineticText } from '../lib/KineticText'
import { RepoCard } from '../lib/RepoCard'
import { repeatForLoop } from '../lib/marquee-util'
import { hero, repos } from '../content'

function RepoBand({ reverse, speed }: { reverse?: boolean; speed: number }) {
  return (
    <Marquee reverse={reverse} speed={speed} className="[mask-image:linear-gradient(to_right,transparent,white_12%,white_88%,transparent)]">
      {repeatForLoop([...repos]).map((r, i) => (
        <div key={`${r.name}-${i}`} className="mx-3 w-64 shrink-0">
          <RepoCard r={r} />
        </div>
      ))}
    </Marquee>
  )
}

export function HeroSection() {
  const navigate = useNavigate()

  return (
    <div className="relative overflow-hidden border-b border-white/5 bg-zinc-950">
      <MeshBg intense />

      <div className="relative mx-auto grid min-h-[600px] max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-12 md:px-12 md:py-32">
        <div className="md:col-span-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 backdrop-blur-md"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shadow-[0_0_8px_currentColor]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-teal-200">{hero.eyebrow}</span>
          </motion.div>

          <KineticText
            as="h1"
            text="Your GitHub already proves you can do the job."
            className="mt-7 block text-balance text-4xl font-semibold leading-[1.04] tracking-tight text-white md:text-6xl"
          />
          <KineticText
            as="span"
            stagger={0.05}
            text="Now your resume can."
            className="mt-2 block bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-300 bg-clip-text text-4xl font-semibold leading-[1.04] tracking-tight text-transparent md:text-6xl"
          />

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <MagneticButton primary onClick={() => navigate({ to: '/sign-in' })}>
              ⌥ {hero.primaryCta}
            </MagneticButton>
            <MagneticButton onClick={() => navigate({ to: '/sign-in' })}>
              {hero.secondaryCta}
            </MagneticButton>
          </div>
          <div className="mt-5 font-mono text-[11px] text-zinc-500">{hero.founderNote}</div>
        </div>

        <div className="hidden md:col-span-6 md:block">
          <div className="flex flex-col gap-4 [perspective:1000px]">
            <RepoBand speed={40} />
            <RepoBand reverse speed={52} />
          </div>
        </div>
      </div>

      {/* Mobile repo band below the fold of the hero copy */}
      <div className="relative block pb-10 md:hidden">
        <RepoBand speed={36} />
      </div>
    </div>
  )
}
```

Note: this removes the `ConveyorBelt` and `PipelineScene` imports from the hero. They remain in the repo for other use; do not delete them.

- [ ] **Step 3: Verify typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: zero errors. (`repos` is `as const`; `repeatForLoop([...repos])` spreads to a mutable copy so `RepoCard`'s `Repo` prop accepts it.)

- [ ] **Step 4: Manual check**

Run: `yarn dev` → open http://localhost:5001. Confirm: headline words reveal on load, two repo bands scroll in opposite directions, CTAs magnetic. Toggle reduced motion (DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`) and confirm bands freeze and headline shows fully.

- [ ] **Step 5: Commit** [git-commit skill]

```bash
git add src/features/home/content.ts src/features/home/sections/HeroSection.tsx
git commit -m "feat(home): kinetic hero with repo conveyor and word-reveal"
```

---

### Task 5: HowItWorks + Problem motion

**Files:**
- Modify: `src/features/home/sections/Sections.tsx` (`HowItWorksSection`, `ProblemSection`)

**Interfaces:**
- Consumes: `KineticText` (Task 2). Existing `Section`, `Eyebrow`, `steps`, `problems`.

- [ ] **Step 1: Add the import**

At the top of `src/features/home/sections/Sections.tsx`, add to the imports:

```tsx
import { KineticText } from '../lib/KineticText'
```

- [ ] **Step 2: Update `HowItWorksSection`**

Replace its `<h2>…</h2>` line:

```tsx
<h2 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">Three steps. No magic.</h2>
```

with:

```tsx
<KineticText as="h2" text="Three steps. No magic." className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl" />
```

Then change the step card motion from `y` to a horizontal slide-in. In the `steps.map` block, change:

```tsx
initial={{ opacity: 0, y: 20 }}
whileInView={{ opacity: 1, y: 0 }}
viewport={{ once: true }}
transition={{ delay: i * 0.12 }}
```

to:

```tsx
initial={{ opacity: 0, x: -28 }}
whileInView={{ opacity: 1, x: 0 }}
viewport={{ once: true }}
transition={{ delay: i * 0.12, type: 'spring', stiffness: 90, damping: 16 }}
style={{ willChange: 'transform, opacity' }}
```

- [ ] **Step 3: Update `ProblemSection`**

Replace its `<h2>` with a `KineticText` (same pattern):

```tsx
<KineticText as="h2" text="You did the work. Your resume doesn't show it." className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl" />
```

In the `problems.map` card, change the motion to add a slight tilt and `willChange`:

```tsx
initial={{ opacity: 0, y: 20, rotate: -1 }}
whileInView={{ opacity: 1, y: 0, rotate: 0 }}
viewport={{ once: true }}
transition={{ delay: i * 0.1, type: 'spring', stiffness: 90, damping: 15 }}
style={{ willChange: 'transform, opacity' }}
```

Note: keep the existing `key={i}` as-is here (static list rendered once; not reordered). For the deflated line, the current `line-through` class already conveys the strike-through; no JS draw animation is added (keeps complexity ≤ 10 and avoids a layout-animating pseudo-element). The kinetic feel comes from the card tilt + heading reveal.

- [ ] **Step 4: Verify typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: zero errors.

- [ ] **Step 5: Manual check**

`yarn dev` → scroll to "How it works" and "The problem". Confirm headings reveal word-by-word, step cards slide in from the left, problem cards settle from a slight tilt. Reduced-motion: headings static, cards just fade.

- [ ] **Step 6: Commit** [git-commit skill]

```bash
git add src/features/home/sections/Sections.tsx
git commit -m "feat(home): kinetic motion for HowItWorks and Problem"
```

---

### Task 6: Comparison + Founder motion

**Files:**
- Modify: `src/features/home/sections/Sections.tsx` (`ComparisonSection`, `FounderSection`)

**Interfaces:**
- Consumes: `KineticText`, `motion` (already imported).

- [ ] **Step 1: Update `ComparisonSection` heading + row reveal**

Replace the `<h2>` with:

```tsx
<KineticText as="h2" text="What other AI resume tools can't say." className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl" />
```

Wrap each comparison row in a `motion.div` so rows stagger in. Change the row `<div key={i} className={...}>` to `motion.div` with:

```tsx
<motion.div
  key={i}
  initial={{ opacity: 0, x: -16 }}
  whileInView={{ opacity: 1, x: 0 }}
  viewport={{ once: true }}
  transition={{ delay: i * 0.06 }}
  style={{ willChange: 'transform, opacity' }}
  className={['grid grid-cols-12 text-sm', i < comparison.length - 1 ? 'border-b border-white/5' : ''].join(' ')}
>
```

Add a gradient sweep to the teal "Tucaken" header cell. Change the header cell:

```tsx
<div className="col-span-4 border-l border-white/10 bg-teal-500/5 px-5 py-3 text-teal-300">Tucaken</div>
```

to:

```tsx
<div className="gradient-sweep-anim col-span-4 border-l border-white/10 bg-[linear-gradient(110deg,transparent,rgba(45,212,191,0.18),transparent)] px-5 py-3 text-teal-300">Tucaken</div>
```

- [ ] **Step 2: Update `FounderSection`**

Replace the blockquote text node with `KineticText` is overkill (it's a long quote); instead keep the blockquote but add a word-fade on view to the avatar + quote container. Wrap the avatar's gradient circle with a pulse: change

```tsx
<div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 font-mono text-lg font-bold text-white">
  N
</div>
```

to:

```tsx
<motion.div
  animate={{ opacity: [0.85, 1, 0.85] }}
  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
  style={{ willChange: 'opacity' }}
  className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 font-mono text-lg font-bold text-white"
>
  N
</motion.div>
```

(The `motion` import already exists. `useReducedMotion` is not needed — this is an opacity-only pulse; for strict reduced-motion freeze, guard with `const reduce = useReducedMotion() ?? false` at the top of `FounderSection` and set `animate={reduce ? undefined : { opacity: [0.85, 1, 0.85] }}`. Add `import { motion, useReducedMotion } from 'motion/react'` — update the existing `import { motion } from 'motion/react'`.)

- [ ] **Step 3: Verify typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: zero errors.

- [ ] **Step 4: Manual check**

`yarn dev` → Comparison rows stagger in, "Tucaken" header shimmers; Founder avatar pulses (and is static under reduced motion).

- [ ] **Step 5: Commit** [git-commit skill]

```bash
git add src/features/home/sections/Sections.tsx
git commit -m "feat(home): comparison row stagger, teal sweep, founder pulse"
```

---

### Task 7: Pricing reveal (logic untouched) + FAQ AnimatePresence

**Files:**
- Modify: `src/features/home/sections/Sections.tsx` (`PricingSection`, `FAQSection`)

**Interfaces:**
- Consumes: `motion`, `AnimatePresence` from `motion/react`, `KineticText`.

- [ ] **Step 1: Update the import line**

Change `import { motion, useReducedMotion } from 'motion/react'` (from Task 6) to:

```tsx
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
```

- [ ] **Step 2: Pricing heading + card reveal (DO NOT touch the form/toggle/checkout logic)**

Replace the pricing `<h2>` with:

```tsx
<KineticText as="h2" text="Free until it's worth paying for." className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl" />
```

Wrap each tier card. Change the tier card `<div key={t.id} data-featured=... className="group/tier relative rounded-3xl ...">` to a `motion.div` adding reveal + hover lift — keep ALL existing classes, `data-featured`, and children exactly:

```tsx
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
```

For the featured "Recommended" badge, add the sweep class — change

```tsx
<div className="absolute -top-3 right-6 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 px-3 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-950">
```

to:

```tsx
<div className="gradient-sweep-anim absolute -top-3 right-6 rounded-full bg-[linear-gradient(110deg,#14b8a6,#34d399,#14b8a6)] px-3 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-950">
```

Important: the `</div>` closing the tier card must become `</motion.div>`.

- [ ] **Step 3: FAQ spring open/close**

In `FAQSection`, replace the conditional answer render. Currently:

```tsx
{open === i && <p className="mt-3 text-sm leading-relaxed text-zinc-400">{f.a}</p>}
```

Replace with an `AnimatePresence` height/opacity animation:

```tsx
<AnimatePresence initial={false}>
  {open === i ? (
    <motion.p
      key="a"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      style={{ overflow: 'hidden', willChange: 'opacity' }}
      className="mt-3 text-sm leading-relaxed text-zinc-400"
    >
      {f.a}
    </motion.p>
  ) : null}
</AnimatePresence>
```

Note: the FAQ trigger is currently a `<button>` wrapping everything. Animating height inside a button is valid. Keep the `setOpen(open === i ? -1 : i)` handler and the `+`/rotate indicator unchanged. (`open === i ? (...) : null` is a single ternary, not nested — Sonar-safe.)

- [ ] **Step 4: Verify typecheck + lint + tests**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: zero errors; all tests pass.

- [ ] **Step 5: Manual check (critical — checkout flow)**

`yarn dev` → Pricing: toggle Monthly/Annually still swaps prices (CSS toggle intact); cards reveal + lift on hover; "Recommended" badge shimmers. Click a paid tier CTA → confirm it still navigates to `/checkout/$tier`. FAQ: items expand/collapse with a spring.

- [ ] **Step 6: Commit** [git-commit skill]

```bash
git add src/features/home/sections/Sections.tsx
git commit -m "feat(home): pricing reveal/lift and FAQ spring accordion"
```

---

### Task 8: Header scroll behaviour, Footer marquee, ScrollProgress mount, dividers, final QA

**Files:**
- Modify: `src/features/home/HomePage.tsx` (Header scroll state, mount `ScrollProgress`)
- Modify: `src/features/home/sections/Sections.tsx` (`FooterSection` marquee)

**Interfaces:**
- Consumes: `ScrollProgress` (Task 3), `Marquee` (Task 1), `useScroll`/`useMotionValueEvent` from `motion/react`.

- [ ] **Step 1: Header shrink-on-scroll + mount `ScrollProgress`**

In `src/features/home/HomePage.tsx`, update imports:

```tsx
import { useState } from 'react'
import { useScroll, useMotionValueEvent } from 'motion/react'
import { ScrollProgress } from './lib/ScrollProgress'
```

Change the `Header` component so it shrinks past 24px scroll:

```tsx
function Header() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24))

  return (
    <header
      className={[
        'sticky top-0 z-30 border-b px-6 backdrop-blur-md transition-all duration-300 md:px-12',
        scrolled ? 'border-zinc-200/80 bg-white/95 py-2' : 'border-transparent bg-white/80 py-3',
      ].join(' ')}
    >
      {/* …existing inner markup unchanged… */}
    </header>
  )
}
```

(Keep the existing inner `<div className="mx-auto flex max-w-6xl …">…</div>` exactly. Only the `<header>` className and the new hooks change. Logo height may shrink: optionally change `h-18` to `scrolled ? 'h-14' : 'h-18'` on the `<img>` — keep `transition-all`.)

In `HomePage`, mount `ScrollProgress` as the first child:

```tsx
export function HomePage() {
  return (
    <div className="dark min-h-screen bg-zinc-950 text-white antialiased">
      <ScrollProgress />
      <Header />
      <HeroSection />
      {/* …rest unchanged… */}
    </div>
  )
}
```

- [ ] **Step 2: Footer marquee band**

In `FooterSection` (`Sections.tsx`), add a `Marquee` tagline band above the existing footer row. Add `import { Marquee } from '../lib/Marquee'` to the imports, then change the `<footer>` to wrap a band on top:

```tsx
export function FooterSection() {
  const band = ['Resumes grounded in real code', 'Made in Dublin', 'Backed by your commits', 'No fabricated bullet points']
  return (
    <footer className="border-t border-white/5">
      <Marquee speed={30} className="border-b border-white/5 py-4 [mask-image:linear-gradient(to_right,transparent,white_10%,white_90%,transparent)]">
        {band.concat(band).map((t, i) => (
          <span key={`${t}-${i}`} className="mx-6 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {t} <span className="text-teal-400">·</span>
          </span>
        ))}
      </Marquee>
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center md:px-12">
        {/* …existing brand + subscribe markup unchanged… */}
      </div>
    </footer>
  )
}
```

(Keep the existing brand block and subscribe `<input>`/`MagneticButton` markup exactly inside the second `<div>`.)

- [ ] **Step 3: Verify typecheck + lint + tests**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: zero errors; all tests pass.

- [ ] **Step 4: Full manual QA pass**

`yarn dev` → full scroll-through:
- Top teal `ScrollProgress` bar fills as you scroll.
- Header shrinks + background solidifies after scrolling.
- Hero, all section headings reveal kinetically; repo bands and footer band scroll.
- Pricing toggle + paid CTA → `/checkout/$tier` still works.
- Force `prefers-reduced-motion: reduce` (DevTools → Rendering): all marquees, sweeps, pulses, and word-reveals freeze/settle; page fully readable and usable.
- Check at 375px (mobile) and ≥1280px (desktop): no horizontal overflow, repo band visible on mobile fallback.

- [ ] **Step 5: Commit** [git-commit skill]

```bash
git add src/features/home/HomePage.tsx src/features/home/sections/Sections.tsx
git commit -m "feat(home): scroll progress, sticky header shrink, footer marquee"
```

---

## Self-Review notes

- **Spec coverage:** toolkit (Tasks 1–3), Hero (4), HowItWorks+Problem (5), Comparison+Founder (6), Pricing+FAQ (7), Header/Footer/dividers/ScrollProgress (8). Section "dividers" are addressed via the footer marquee band + existing borders + sweeps rather than a dedicated divider component — the kinetic separation comes from marquee bands and gradient sweeps already added; a standalone divider component was dropped as YAGNI. The Problem strike-through "draw" animation was deliberately simplified to the existing `line-through` (documented in Task 5 Step 3) to respect the complexity-≤10 rule.
- **Particle canvas:** out of scope per spec (kinetic direction); not implemented.
- **Type consistency:** `repeatForLoop` / `splitTokens` / `Marquee` / `KineticText` / `ScrollProgress` names are used identically across tasks. `repos` is `as const`; consumers spread (`[...repos]`) to satisfy `RepoCard`'s mutable `Repo` prop.
- **Reduced motion:** every new animation either uses the `.marquee-anim`/`.gradient-sweep-anim` kill-switch classes or guards with `useReducedMotion()`.
