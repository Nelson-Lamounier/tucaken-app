# HowItWorks + Problem Scroll-Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home `ProblemSection` + `HowItWorksSection` with one page-scroll-driven sticky scroll-story (3 problems → 3 steps), with on-brand proof mocks on the right.

**Architecture:** A tall section (`h-[600vh]`) with a `position: sticky` inner panel; Motion `useScroll` on the section maps scroll progress → active slide index. Left column = slide text + pagination + CTA; right column = a vertical stack of mock visuals translated by the active index. Mobile and reduced-motion fall back to a plain stacked layout.

**Tech Stack:** React 19, `motion/react`, `@tanstack/react-router`, Tailwind v4, Vitest (node env), `cn` from `@/lib/utils`.

## Global Constraints

- Animation imports from `motion/react` only — never `framer-motion`. Animate only `transform`/`opacity`/`clipPath`/`filter` with matching `willChange`; never read a `MotionValue` during render (use `useMotionValueEvent` → state, or `style`-bound values); independent transforms.
- No nested `overflow-y-auto` scroll container — the carousel advances with the PAGE scroll via `useScroll({ target: sectionRef, offset: ['start start', 'end end'] })`.
- Reduced motion (`useReducedMotion`) and `< md`: render a plain stacked layout (no pin/scrub).
- Copy comes from existing `problems` + `steps` in `src/features/home/content.ts` — none invented.
- Teal accent + zinc dark only; `cn` from `@/lib/utils`. The page wraps everything in `<MotionConfig reducedMotion="user">` (in `HomePage`), so keyed enter animations should be opacity-led.
- Sonar/ESLint: no nested ternaries (guard clauses / lookup maps), stable React keys (slide `id`), `Set`/lookup-map over `includes`, cyclomatic complexity ≤ 10 (extract subcomponents), no `console.*`, no `Math.random`.
- UK English; product "Tucaken"; `resume` (no diacritics). New chrome `rounded-md`; mock cards may use `rounded-xl/2xl` to match `RepoCard`.
- Yarn 4: `yarn typecheck`, `yarn lint`, `yarn test` (never npm/npx). Tests live under `src/__tests__/**`, node env, vitest globals OFF — test files `import { describe, it, expect } from 'vitest'`.
- Before "done": `yarn typecheck && yarn lint && yarn test` green.

---

### Task 1: Slide model + scroll math (`story-data.ts`)

**Files:**
- Create: `src/features/home/lib/story-data.ts`
- Test: `src/__tests__/features/home/story-data.test.ts`

**Interfaces:**
- Produces:
  - `type MockKind = 'commit' | 'architecture' | 'skim' | 'repos' | 'jd' | 'resume'`
  - `interface StorySlide { id: string; phase: 'problem' | 'how'; eyebrow: string; title: string; body: string; mock: MockKind }`
  - `function buildStorySlides(): StorySlide[]` (6 slides: 3 `problem`, 3 `how`)
  - `function activeIndexFromProgress(progress: number, count: number): number`
- Consumes: `problems`, `steps` from `../content`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/features/home/story-data.test.ts
import { describe, it, expect } from 'vitest'
import { buildStorySlides, activeIndexFromProgress } from '@/features/home/lib/story-data'

describe('buildStorySlides', () => {
  it('returns 6 slides: 3 problem then 3 how, with unique ids', () => {
    const slides = buildStorySlides()
    expect(slides).toHaveLength(6)
    expect(slides.slice(0, 3).every((s) => s.phase === 'problem')).toBe(true)
    expect(slides.slice(3).every((s) => s.phase === 'how')).toBe(true)
    expect(new Set(slides.map((s) => s.id)).size).toBe(6)
  })

  it('assigns the six mock kinds in order', () => {
    expect(buildStorySlides().map((s) => s.mock)).toEqual([
      'commit', 'architecture', 'skim', 'repos', 'jd', 'resume',
    ])
  })
})

describe('activeIndexFromProgress', () => {
  it('maps progress to a clamped slide index', () => {
    expect(activeIndexFromProgress(0, 6)).toBe(0)
    expect(activeIndexFromProgress(1, 6)).toBe(5)
    expect(activeIndexFromProgress(0.5, 6)).toBe(3)
    expect(activeIndexFromProgress(-0.2, 6)).toBe(0)
    expect(activeIndexFromProgress(1.4, 6)).toBe(5)
  })

  it('returns 0 for a non-positive count', () => {
    expect(activeIndexFromProgress(0.5, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/home/story-data.test.ts`
Expected: FAIL — cannot resolve `@/features/home/lib/story-data`.

- [ ] **Step 3: Implement**

```ts
// src/features/home/lib/story-data.ts
// Pure slide model for the HowItWorks+Problem scroll-story. Maps the existing
// `problems` + `steps` content into an ordered list of slides (3 problems then
// 3 steps) and provides the scroll-progress -> slide-index mapping.
import { problems, steps } from '../content'

export type MockKind = 'commit' | 'architecture' | 'skim' | 'repos' | 'jd' | 'resume'

export interface StorySlide {
  id: string
  phase: 'problem' | 'how'
  eyebrow: string
  title: string
  body: string
  mock: MockKind
}

const PROBLEM_MOCKS: MockKind[] = ['commit', 'architecture', 'skim']
const STEP_MOCKS: MockKind[] = ['repos', 'jd', 'resume']

export function buildStorySlides(): StorySlide[] {
  const problemSlides: StorySlide[] = problems.map((p, i) => ({
    id: `problem-${i}`,
    phase: 'problem',
    eyebrow: 'The problem',
    title: p.real,
    body: p.deflated,
    mock: PROBLEM_MOCKS[i % PROBLEM_MOCKS.length],
  }))
  const stepSlides: StorySlide[] = steps.map((s, i) => ({
    id: `how-${s.n}`,
    phase: 'how',
    eyebrow: 'How it works',
    title: `${s.n} · ${s.t}`,
    body: s.d,
    mock: STEP_MOCKS[i % STEP_MOCKS.length],
  }))
  return [...problemSlides, ...stepSlides]
}

/** Map a 0..1 scroll progress to a clamped integer slide index. */
export function activeIndexFromProgress(progress: number, count: number): number {
  if (count <= 0) return 0
  const idx = Math.floor(progress * count)
  if (idx < 0) return 0
  if (idx > count - 1) return count - 1
  return idx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/home/story-data.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: zero errors.

- [ ] **Step 6: Commit** [git-commit skill]

```bash
git add src/features/home/lib/story-data.ts src/__tests__/features/home/story-data.test.ts
git commit -m "feat(home): add scroll-story slide model and scroll math"
```

---

### Task 2: Proof mock visuals (`proof-mocks.tsx`)

**Files:**
- Create: `src/features/home/lib/proof-mocks.tsx`

**Interfaces:**
- Consumes: `MockKind` from `./story-data`.
- Produces: `const MOCKS: Record<MockKind, () => JSX.Element>` — one dark/teal visual per kind. Each fills its container (`h-full w-full`), centred, no external assets.

- [ ] **Step 1: Implement the mocks**

```tsx
// src/features/home/lib/proof-mocks.tsx
"use client"
// On-brand proof visuals for the scroll-story right panel. Pure presentational,
// dark/teal, no external assets. Keyed by MockKind via the MOCKS map so the
// section can render MOCKS[slide.mock] without a switch/ternary chain.
import type { MockKind } from './story-data'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/70 p-5 shadow-2xl shadow-black/40 backdrop-blur-md">
        {children}
      </div>
    </div>
  )
}

function CommitMock() {
  const cells = Array.from({ length: 35 }, (_, i) => i)
  return (
    <Frame>
      <div className="font-mono text-[11px] text-zinc-400">platform-eks · this month</div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {cells.map((i) => (
          <span
            key={i}
            className="aspect-square rounded-sm"
            style={{ background: `rgba(45,212,191,${0.12 + ((i * 7) % 9) * 0.09})` }}
          />
        ))}
      </div>
      <div className="mt-4 text-2xl font-bold text-white">47 commits</div>
      <div className="mt-1 text-[11px] text-zinc-500">Kubernetes autoscaling · zero-trust</div>
    </Frame>
  )
}

function ArchitectureMock() {
  const nodes = ['ingest', 'queue', 'worker', 'store']
  return (
    <Frame>
      <div className="font-mono text-[11px] text-zinc-400">event-driven migration · ADR-007</div>
      <div className="mt-4 flex items-center justify-between">
        {nodes.map((n, i) => (
          <div key={n} className="flex items-center">
            <div className="grid h-12 w-12 place-items-center rounded-lg border border-teal-500/30 bg-teal-500/10 font-mono text-[10px] text-teal-200">
              {n}
            </div>
            {i < nodes.length - 1 && <span className="mx-1 h-px w-4 bg-teal-400/40" />}
          </div>
        ))}
      </div>
      <div className="mt-4 text-2xl font-bold text-white">83 PRs · 99.95%</div>
      <div className="mt-1 text-[11px] text-zinc-500">6 months, legacy → event-sourced</div>
    </Frame>
  )
}

function SkimMock() {
  const lines = [80, 60, 70, 45, 65, 50]
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] text-zinc-500">resume.pdf</div>
        <div className="rounded-full bg-red-400/15 px-2 py-0.5 font-mono text-[10px] text-red-300">6s scan</div>
      </div>
      <div className="mt-4 space-y-2 opacity-40">
        {lines.map((w, i) => (
          <div key={i} className="h-2 rounded bg-zinc-600" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="mt-4 text-[11px] text-zinc-500">Skimmed in seconds — your real work never read.</div>
    </Frame>
  )
}

const SAMPLE_REPOS = [
  { name: 'platform-eks', lang: 'YAML', color: '#2dd4bf' },
  { name: 'cost-optimiser', lang: 'Go', color: '#34d399' },
  { name: 'kafka-migration', lang: 'Rust', color: '#22d3ee' },
]

function ReposMock() {
  return (
    <Frame>
      <div className="font-mono text-[11px] text-zinc-400">Tucaken is reading…</div>
      <div className="mt-3 space-y-2">
        {SAMPLE_REPOS.map((r) => (
          <div key={r.name} className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2">
            <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
            <span className="font-mono text-[11px] text-zinc-300">{r.name}</span>
            <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300">{r.lang}</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

function JdMock() {
  const reqs = [
    { t: 'Scale Kubernetes in production', hit: true },
    { t: 'Event-driven architecture', hit: true },
    { t: 'Strong communication', hit: false },
    { t: 'Cost optimisation', hit: true },
  ]
  return (
    <Frame>
      <div className="font-mono text-[11px] text-zinc-400">Job description · matched</div>
      <div className="mt-3 space-y-2">
        {reqs.map((r) => (
          <div
            key={r.t}
            className={[
              'rounded-lg border px-3 py-2 text-[12px]',
              r.hit ? 'border-teal-500/40 bg-teal-500/10 text-teal-100' : 'border-white/10 bg-white/[0.02] text-zinc-500',
            ].join(' ')}
          >
            {r.hit ? '✓ ' : '· '}{r.t}
          </div>
        ))}
      </div>
    </Frame>
  )
}

function ResumeMock() {
  const bullets = [
    'Scaled EKS to 99.95% uptime',
    'Migrated to event-driven · 83 PRs',
    'Cut spot-fleet cost −38%',
  ]
  return (
    <Frame>
      <div className="font-mono text-[11px] text-zinc-400">resume.pdf · verifiable</div>
      <div className="mt-3 space-y-2">
        {bullets.map((b) => (
          <div key={b} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <span className="mt-0.5 text-teal-400">✓</span>
            <span className="text-[12px] text-zinc-200">{b}</span>
            <span className="ml-auto font-mono text-[9px] text-teal-300/80 underline">evidence</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

export const MOCKS: Record<MockKind, () => React.JSX.Element> = {
  commit: CommitMock,
  architecture: ArchitectureMock,
  skim: SkimMock,
  repos: ReposMock,
  jd: JdMock,
  resume: ResumeMock,
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: zero errors. (`React.JSX.Element` is available without importing React under the new JSX transform; if typecheck complains about `React`, add `import type * as React from 'react'` at the top.)

- [ ] **Step 3: Commit** [git-commit skill]

```bash
git add src/features/home/lib/proof-mocks.tsx
git commit -m "feat(home): add on-brand proof mock visuals for scroll-story"
```

---

### Task 3: `ScrollStorySection` (pinned + stacked)

**Files:**
- Create: `src/features/home/sections/ScrollStorySection.tsx`

**Interfaces:**
- Consumes: `buildStorySlides`, `activeIndexFromProgress`, `StorySlide` (Task 1); `MOCKS` (Task 2); `MagneticButton` (`../lib/MagneticButton`); `useNavigate` (`@tanstack/react-router`); `motion`, `useScroll`, `useMotionValueEvent`, `useReducedMotion` from `motion/react`.
- Produces: `export function ScrollStorySection(): JSX.Element` — id `how`.

- [ ] **Step 1: Implement the component**

```tsx
// src/features/home/sections/ScrollStorySection.tsx
"use client"
// Page-scroll-driven sticky scroll-story for Problem -> HowItWorks. The outer
// section is slides*100vh tall; an inner panel pins (sticky top-0). useScroll on
// the section maps progress -> active slide. Mobile + reduced-motion fall back
// to a plain stacked layout (no pin/scrub).
import { useRef, useState } from 'react'
import { motion, useScroll, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { MagneticButton } from '../lib/MagneticButton'
import { MOCKS } from '../lib/proof-mocks'
import { buildStorySlides, activeIndexFromProgress, type StorySlide } from '../lib/story-data'

const GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
  backgroundSize: '3.5rem 3.5rem',
}

function Pagination({
  slides,
  active,
  onJump,
}: {
  slides: StorySlide[]
  active: number
  onJump: (i: number) => void
}) {
  return (
    <div className="flex gap-2">
      {slides.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onJump(i)}
          aria-label={`Go to slide ${i + 1}`}
          className={[
            'h-1 rounded-full transition-all duration-500',
            i === active ? 'w-10 bg-teal-400' : 'w-5 bg-white/20 hover:bg-white/40',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

function PinnedStory({ slides }: { slides: StorySlide[] }) {
  const navigate = useNavigate()
  const sectionRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    setActive(activeIndexFromProgress(p, slides.length))
  })

  const jump = (i: number) => {
    const el = sectionRef.current
    if (!el) return
    const top = el.offsetTop + ((i + 0.5) / slides.length) * (el.offsetHeight - window.innerHeight)
    window.scrollTo({ top, behavior: 'smooth' })
  }

  const slide = slides[active]

  return (
    <div ref={sectionRef} className="relative hidden md:block" style={{ height: `${slides.length * 100}vh` }}>
      <div className="sticky top-0 grid h-screen grid-cols-2 overflow-hidden">
        {/* Left: text + pagination + CTA */}
        <div className="relative flex flex-col justify-center border-r border-white/5 px-12 lg:px-20">
          <div className="absolute left-12 top-16 lg:left-20">
            <Pagination slides={slides} active={active} onJump={jump} />
          </div>
          <div aria-live="polite" className="max-w-md">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-teal-400">{slide.eyebrow}</div>
            <motion.h2
              key={`${slide.id}-t`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{ willChange: 'transform, opacity' }}
              className="text-balance text-3xl font-bold tracking-tight text-white lg:text-4xl"
            >
              {slide.title}
            </motion.h2>
            <motion.p
              key={`${slide.id}-b`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              style={{ willChange: 'transform, opacity' }}
              className={[
                'mt-5 text-lg leading-relaxed',
                slide.phase === 'problem' ? 'text-zinc-400 line-through decoration-zinc-600' : 'text-zinc-300',
              ].join(' ')}
            >
              {slide.body}
            </motion.p>
          </div>
          <div className="absolute bottom-16 left-12 lg:left-20">
            <MagneticButton primary onClick={() => navigate({ to: '/sign-in' })}>
              Try it free with your GitHub
            </MagneticButton>
          </div>
        </div>

        {/* Right: grid bg + vertical mock stack translated by active index */}
        <div className="relative flex items-center justify-center" style={GRID_STYLE}>
          <div className="relative h-[78vh] w-full max-w-md overflow-hidden">
            <div
              className="h-full w-full transition-transform duration-700 ease-in-out"
              style={{ transform: `translateY(-${active * 100}%)`, willChange: 'transform' }}
            >
              {slides.map((s) => {
                const SlideMock = MOCKS[s.mock]
                return (
                  <div key={s.id} className="h-full w-full">
                    <SlideMock />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StackedStory({ slides }: { slides: StorySlide[] }) {
  return (
    <div className="space-y-16 px-6 py-20 md:hidden">
      {slides.map((s) => {
        const Mock = MOCKS[s.mock]
        return (
          <div key={s.id}>
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-teal-400">{s.eyebrow}</div>
            <h2 className="text-balance text-2xl font-bold tracking-tight text-white">{s.title}</h2>
            <p
              className={[
                'mt-3 text-base leading-relaxed',
                s.phase === 'problem' ? 'text-zinc-400 line-through decoration-zinc-600' : 'text-zinc-300',
              ].join(' ')}
            >
              {s.body}
            </p>
            <div className="mt-6 h-72">
              <Mock />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ScrollStorySection() {
  const reduce = useReducedMotion() ?? false
  const slides = buildStorySlides()

  return (
    <section id="how" className="relative border-t border-white/5 bg-zinc-950">
      {/* Reduced motion: stacked at all sizes. Otherwise: stacked < md, pinned >= md. */}
      {reduce ? (
        <div className="space-y-16 px-6 py-20">
          {slides.map((s) => {
            const Mock = MOCKS[s.mock]
            return (
              <div key={s.id}>
                <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-teal-400">{s.eyebrow}</div>
                <h2 className="text-balance text-2xl font-bold tracking-tight text-white md:text-3xl">{s.title}</h2>
                <p className={['mt-3 text-base leading-relaxed', s.phase === 'problem' ? 'text-zinc-400 line-through decoration-zinc-600' : 'text-zinc-300'].join(' ')}>
                  {s.body}
                </p>
                <div className="mt-6 h-72 max-w-md">
                  <Mock />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <StackedStory slides={slides} />
          <PinnedStory slides={slides} />
        </>
      )}
    </section>
  )
}
```

Note on complexity: keep `Pagination`, `PinnedStory`, `StackedStory` as separate functions (each well under complexity 10). The `reduce` branch duplicates the stacked markup deliberately so the reduced-motion path renders at all sizes without a `md:` class; if a reviewer flags the duplication, extracting a shared `<SlideBlock slide={s} />` is acceptable — do it in the same task.

- [ ] **Step 2: Verify typecheck + lint + test**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: zero errors; all tests pass. (If `React.CSSProperties` errors, add `import type * as React from 'react'`.)

- [ ] **Step 3: Commit** [git-commit skill]

```bash
git add src/features/home/sections/ScrollStorySection.tsx
git commit -m "feat(home): add pinned scroll-story section (Problem -> HowItWorks)"
```

---

### Task 4: Wire into `HomePage`, remove old sections

**Files:**
- Modify: `src/features/home/HomePage.tsx`
- Modify: `src/features/home/sections/Sections.tsx`

**Interfaces:**
- Consumes: `ScrollStorySection` (Task 3).

- [ ] **Step 1: Remove `ProblemSection` and `HowItWorksSection` from `Sections.tsx`**

Delete the two exported functions `export function ProblemSection() {...}` and `export function HowItWorksSection() {...}` entirely. If, after deletion, `KineticText` is no longer referenced anywhere in `Sections.tsx`, remove its import too (check with `grep -n KineticText src/features/home/sections/Sections.tsx`); likewise re-check `problems`/`steps` in the content import line and drop any now-unused names from `import { problems, steps, comparison, founder, faq } from '../content'` (only drop the ones no longer used in the file).

- [ ] **Step 2: Update `HomePage.tsx`**

Change the imports: remove `ProblemSection` and `HowItWorksSection` from the `./sections/Sections` import, and add `import { ScrollStorySection } from './sections/ScrollStorySection'`.

```tsx
import {
  ComparisonSection,
  FounderSection,
  PricingSection,
  FAQSection,
  FooterSection,
} from './sections/Sections'
import { ScrollStorySection } from './sections/ScrollStorySection'
```

In the rendered tree, replace the two lines:

```tsx
        <HeroSection />
        <HowItWorksSection />
        <ProblemSection />
        <ComparisonSection />
```

with:

```tsx
        <HeroSection />
        <ScrollStorySection />
        <ComparisonSection />
```

- [ ] **Step 3: Verify typecheck + lint + test**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: zero errors; all tests pass. (Confirms no dangling references to the removed sections.)

- [ ] **Step 4: Manual QA**

Run: `yarn dev` → http://localhost:5001. Scroll the home page down to the story section:
- The panel pins; scrolling advances slide-by-slide (3 problems → 3 steps); the right mock-stack slides up; pagination bar widens on the active slide; clicking a bar smooth-scrolls to that slide.
- The header nav "How it works" anchor (`#how`) still jumps to the section.
- Resize to < md (375px): the section becomes a normal vertical stack (eyebrow + title + body + mock per slide), no pinning, scrolls normally.
- DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: stacked layout shows at all sizes, fully usable.

- [ ] **Step 5: Commit** [git-commit skill]

```bash
git add src/features/home/HomePage.tsx src/features/home/sections/Sections.tsx
git commit -m "feat(home): replace Problem + HowItWorks with ScrollStorySection"
```

---

## Self-Review notes

- **Spec coverage:** slide model + scroll math (Task 1), proof mocks (Task 2), pinned + stacked section with left text/pagination/CTA and right mock-stack (Task 3), wiring + removal of old sections (Task 4). Page-scroll-driven (no nested overflow) — `useScroll({ target, offset })` in Task 3. Reduced-motion + mobile stacked fallback — Task 3. Dark teal palette, copy from `content.ts` — Tasks 1–3.
- **Placeholder scan:** none — every component/mock has full code.
- **Type consistency:** `StorySlide`/`MockKind`/`buildStorySlides`/`activeIndexFromProgress`/`MOCKS` are used with identical signatures across tasks.
- **Known deferral:** the reduced-motion branch duplicates the stacked markup (Task 3 Step 1 note) — acceptable, with an extraction option called out.
- **Anchor:** the new section keeps `id="how"` so the existing header nav link still works.
