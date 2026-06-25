# HowItWorks + Problem — Sticky Scroll-Story Redesign

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan
**Branch / worktree:** `feat/home-howitworks-problem-motion` (`.worktrees/howitworks-problem`)
**Scope:** Replace the home page's `ProblemSection` + `HowItWorksSection` with one page-scroll-driven sticky scroll-story. Motion/layout only; copy unchanged.

## Goal

Turn the two card-grid sections (Problem, HowItWorks) into a single cinematic,
**page-scroll-driven** sticky "story": a panel pins to the viewport while the
user scrolls the page down through a tall section, advancing through 6 slides —
the 3 problems (the pain), then the 3 steps (the fix). Left column shows the
slide's text + pagination + CTA; right column shows an on-brand "proof mock"
that slides vertically. Dark teal/zinc palette kept.

## Non-goals

- No copy rewrite — slides read from the existing `problems` and `steps` arrays
  in `src/features/home/content.ts`.
- No palette change — teal accent + zinc dark only (NOT the reference's yellow
  `#fff100`).
- **No nested `overflow-y-auto` scroll container.** The reference component uses
  one; on a single-page site it fights the page's own scroll. We use the proper
  in-page pattern: a tall section with a `position: sticky` inner panel driven
  by Motion `useScroll` on the section, so the carousel advances with the page
  scroll (an explicit requirement).
- No external image assets — the right-side visuals are built from on-brand mock
  primitives (reusing the `RepoCard` look).

## Context (current state)

- `src/features/home/HomePage.tsx` renders, in order: Hero, HowItWorks, Problem,
  Comparison, Founder, Pricing, FAQ, Footer.
- `src/features/home/sections/Sections.tsx` holds `ProblemSection`,
  `HowItWorksSection` (3-col card grids with `KineticText` headings + Motion
  card reveals), plus Comparison/Founder/Pricing/FAQ/Footer.
- Content (`src/features/home/content.ts`):
  - `problems`: 3 × `{ real, deflated }`.
  - `steps`: 3 × `{ n, t, d, emp? }` (step 3 has `emp: true`).
- Motion is `motion/react`; the home already uses `useScroll`/`whileInView`.
  `RepoCard` (`src/features/home/lib/RepoCard.tsx`, shape
  `{ name, desc, meta, lang, color }`) exists and is the visual baseline for the
  mocks.

## Architecture

### New files (`src/features/home/`)

1. **`lib/story-data.ts`** — pure slide model.
   - `export type StorySlide = { id: string; phase: 'problem' | 'how'; eyebrow: string; title: string; body: string; mock: MockKind }`
     where `MockKind = 'commit' | 'architecture' | 'skim' | 'repos' | 'jd' | 'resume'`.
   - `export function buildStorySlides(): StorySlide[]` — maps `problems` →
     3 problem slides and `steps` → 3 how slides, assigning eyebrow
     ("The problem" / "How it works"), title, body, and a `mock` kind per slide.
     Deterministic, no side effects.
   - `export function activeIndexFromProgress(progress: number, count: number): number`
     — maps a 0..1 scroll progress to an integer slide index
     `clamp(floor(progress * count), 0, count - 1)`. (Unit-tested.)

2. **`lib/proof-mocks.tsx`** — the six on-brand visuals, one component each, all
   dark/teal, no external assets:
   - `commit` — a repo + commit-graph card ("47 commits") beside a faded,
     struck-through resume line.
   - `architecture` — a PR / event-driven migration card vs a faded line.
   - `skim` — a resume page being skimmed with a "6s" timer overlay, greyed.
   - `repos` — a small stack of `RepoCard`s (Connect GitHub).
   - `jd` — a job-description card with matched-requirement tags highlighted.
   - `resume` — a resume card whose bullets carry verified `✓` evidence links.
   - Exported as `MOCKS: Record<MockKind, () => JSX.Element>` so the section
     renders `MOCKS[slide.mock]`.

3. **`sections/ScrollStorySection.tsx`** — the orchestrator.
   - A tall outer `<section ref>` of height `slides.length * 100vh` containing a
     `position: sticky top-0 h-screen` inner panel.
   - `const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })`.
   - Derive `activeIndex` via `useMotionValueEvent(scrollYProgress, 'change', …)`
     + `activeIndexFromProgress` into local state (the index drives discrete UI;
     never read the MotionValue during render).
   - Layout (desktop, `md:grid md:grid-cols-2`):
     - **Left**: phase `Eyebrow` (flips problem/how), the active slide's title +
       body (cross-fade/translate keyed on `activeIndex`), **pagination bars**
       (6; the active one widens; click scrolls the page to that slide via
       `sectionRef` offset + `window.scrollTo({ behavior: 'smooth' })`), and the
       primary CTA (existing `MagneticButton` → `/sign-in`) anchored bottom.
     - **Right** (`hidden md:flex`, grid-pattern background): a framed panel
       holding a vertical stack of `MOCKS[...]`, translated `-activeIndex * 100%`
       via an independent `y`/`translateY` transform (`willChange: 'transform'`).
   - Motion rules: animate transform/opacity only; matching `willChange`; never
     read a `MotionValue` in render.

### Modified files

- **`sections/Sections.tsx`** — remove `ProblemSection` and `HowItWorksSection`
  (replaced; deleting avoids dead code). Their exports are dropped.
- **`HomePage.tsx`** — replace `<HowItWorksSection/>` + `<ProblemSection/>` with
  a single `<ScrollStorySection/>` at the same position in the flow (after Hero,
  before Comparison). Update imports.

### Data flow

`content.ts` (`problems`, `steps`) → `buildStorySlides()` → `ScrollStorySection`
maps `scrollYProgress` → `activeIndex` → renders the left text + drives the
right mock-stack translate. `MOCKS[slide.mock]` supplies each visual.

## Responsive behaviour

- **≥ md**: pinned scroll-story as above.
- **< md**: NO pinning. Render the 6 slides as a normal vertical stack — each
  slide's eyebrow + title + body + its mock — so mobile scrolls naturally with
  no sticky/scroll-scrub. (The section detects this via a `md:` class split:
  the sticky/tall structure is `hidden md:block`; a stacked list is `md:hidden`.)

## Accessibility & motion

- **Reduced motion** (`useReducedMotion`): disable the pin/scrub; fall back to
  the stacked layout (same as mobile) so all content is reachable without
  scroll-scrubbing. Pagination bars still navigate.
- Animate only `transform`/`opacity`; set matching `willChange`; never read a
  `MotionValue` during render; independent transforms.
- Pagination bars are real `<button>`s with `aria-label`; the active slide's
  text region uses `aria-live="polite"` so the change is announced.
- Keyboard: pagination buttons are focusable and scroll to their slide.

## Code constraints (CLAUDE.md)

- `motion/react` only. Teal + zinc palette; `cn` from `@/lib/utils`.
- Sonar/ESLint: no nested ternaries (guard clauses / lookup maps), stable React
  keys (slide `id`), `Set`/lookup over `includes`, complexity ≤ 10 (extract the
  left panel, pagination, and right panel into small subcomponents), no
  `console.*`, no `Math.random`.
- New chrome `rounded-md`; mock cards may keep `rounded-xl/2xl` to match
  `RepoCard`. UK English; product "Tucaken"; `resume` (no diacritics).

## Testing & verification

- `yarn typecheck && yarn lint && yarn test` green.
- Unit tests (`src/__tests__/features/home/`):
  - `buildStorySlides()` returns 6 slides with the right phases (3 problem, 3
    how), ids unique, mock kinds assigned.
  - `activeIndexFromProgress()` — boundaries: 0 → 0, 1 → count-1, mid values map
    correctly, clamps out-of-range.
- Manual QA (`yarn dev`, port 5001): scroll the page down — the panel pins and
  the carousel advances slide-by-slide with the scroll; pagination click jumps
  to a slide; right-side mock stack slides; at < md the slides stack and scroll
  normally; with `prefers-reduced-motion` the stacked fallback shows and is
  fully usable.

## Build order (high level — detailed plan follows in writing-plans)

1. `story-data.ts` (+ unit tests for `buildStorySlides`, `activeIndexFromProgress`).
2. `proof-mocks.tsx` (the six visuals).
3. `ScrollStorySection.tsx` — sticky/scroll mechanics, left panel (text +
   pagination + CTA), right mock-stack; desktop pinned + mobile/reduced-motion
   stacked fallback.
4. Wire into `HomePage.tsx`; remove old `ProblemSection`/`HowItWorksSection`.
5. Reduced-motion + a11y + responsive pass; typecheck/lint/test; manual QA.
