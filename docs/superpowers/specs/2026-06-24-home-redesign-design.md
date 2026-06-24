# Home Page Redesign — Kinetic / Bold

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan
**Scope:** Full marketing Home page (`src/features/home/`) — layout, motion, and effects only. Colour scheme and copy unchanged.

## Goal

Redesign the public marketing Home page with a **kinetic / bold** motion language:
oversized kinetic typography, marquee/conveyor motifs, gradient sweeps, and
scroll-driven motion. Keep the existing teal accent (`--accent`: teal-600 light /
teal-400 dark) and dark zinc-950 surface. Keep all marketing copy
(`src/features/home/content.ts`). Rework only presentation, layout, and animation.

## Non-goals

- No copy rewrite (`content.ts` stays as ground truth).
- No colour-system change (teal accent + zinc palette only; no new shadcn token set).
- No change to Pricing business logic (CSS billing-frequency toggle and
  `/checkout/$tier` wiring stay byte-for-byte; only visual motion is added).
- The pasted `pixel-perfect-hero.tsx` is **reference only**. Its shadcn tokens
  (`bg-background`, `text-foreground`, `text-primary`, `text-card`, `border-border`)
  do not exist in this repo, and its brand-logo marquee (Tailwind/Motion/Next/AWS)
  is wrong for Tucaken. Its particle-canvas is out of scope for the kinetic
  direction. Nothing from that file is dropped in.

## Context (current state)

- Entry: `src/app/index.tsx` → `HomePage` (`src/features/home/HomePage.tsx`).
  Forced `dark`, `bg-zinc-950 text-white`. Header + 8 sections.
- Sections (`src/features/home/sections/`): `HeroSection.tsx`, `Sections.tsx`
  (Problem, HowItWorks, Comparison, Founder, Pricing, FAQ, Footer).
- Reusable lib (`src/features/home/lib/`): `ConveyorBelt` (CSS marquee),
  `MagneticButton` (spring magnetic), `RepoCard` (pointer tilt), `MeshBg`
  (gradient + grid), `PipelineScene`, `Pipeline`, `pipeline-svg`.
- Keyframes in `src/styles.css`: `belt-scroll`, `scan-sweep`, `item-state`,
  `pipe-pulse`, `node-glow`, all frozen under `prefers-reduced-motion: reduce`.
- Deps present: `motion@^12` (import from `motion/react`), `lucide-react@^0.545`.
- `cn` helper at `@/lib/utils`.

## Architecture

### A. New reusable motion toolkit (`src/features/home/lib/`)

Each unit is self-contained, typed, reduced-motion safe, and independently usable.

1. **`Marquee.tsx`** — a horizontally scrolling band that renders any `children`
   duplicated for seamless loop. Props: `speed?` (seconds, default 32),
   `reverse?` (boolean), `className?`. Generalises the CSS approach already used
   by `ConveyorBelt` (reuses the `belt-scroll` keyframe). Compositor-only
   (`transform: translateX`), `willChange: 'transform'`. Frozen by the
   reduced-motion kill-switch.
   - What it does: infinite horizontal scroll of arbitrary content.
   - How to use: `<Marquee speed={28}><Item/>…</Marquee>`.
   - Depends on: `belt-scroll` keyframe, `cn`.

2. **`KineticText.tsx`** — reveals a heading word-by-word (or line-by-line) on
   scroll into view: each token animates `clipPath` inset + `y` with a stagger.
   Props: `text` or `children`, `as?` (element), `stagger?`, `className?`.
   Uses `motion`'s `whileInView` + `viewport={{ once: true }}`. Independent
   transforms only; `willChange: 'transform, opacity'`. Tokens split on spaces;
   stable keys = `` `${token}-${index}` ``.
   - What it does: kinetic on-view reveal for large headings.
   - How to use: `<KineticText text="Now your resume can." className="…"/>`.
   - Depends on: `motion/react`.

3. **`ScrollProgress.tsx`** — fixed thin teal bar at the very top, width driven by
   `useScroll().scrollYProgress` mapped to `scaleX` via a `MotionValue` (never
   read in render). `willChange: 'transform'`, `transformOrigin: 'left'`.
   - What it does: page scroll-progress indicator.
   - How to use: mounted once in `HomePage`.
   - Depends on: `motion/react`.

### B. styles.css additions

- Add `@keyframes gradient-sweep` (animates `background-position`) + a
  `.gradient-sweep-anim` class for the primary CTA and featured surfaces.
- Reuse `belt-scroll` for `Marquee`.
- Extend the `prefers-reduced-motion` rule to also freeze `.gradient-sweep-anim`
  (and any new band classes).

### C. Per-section redesign

All section content/copy is preserved; only structure/motion changes.

- **Header (`HomePage.tsx`)** — on scroll past a threshold, shrink padding and
  intensify backdrop blur via `useScroll` + a boolean state (or a `MotionValue`
  → style). Logo + magnetic "Try free" kept.
- **Hero (`HeroSection.tsx`)** — oversized headline rendered through
  `KineticText` (word clip-reveal stagger). Eyebrow pill kept. CTA row: existing
  `MagneticButton` pair; primary gains `.gradient-sweep-anim`. Right column swaps
  the static `PipelineScene` for a **kinetic RepoCard conveyor**: two stacked
  horizontal `Marquee` bands (opposing `reverse`) of `RepoCard`s (`RepoCard` is
  currently an unused orphan — this gives it a home). A new `repos` array is
  added to `content.ts` (none exists today) matching the `Repo` interface
  (`name`, `desc`, `meta`, `lang`, `color`). `MeshBg intense` behind.
- **HowItWorks** — 3 steps as a horizontal track; cards slide in from `x` with
  stagger on view; an animated connecting line reuses `pipe-pulse`.
- **Problem** — cards rise + slight tilt on view; the "deflated" line gets a
  strike-through draw animation (animate a pseudo line width / `scaleX`).
- **Comparison** — table rows stagger in sequentially; the teal "Tucaken" column
  gets a `gradient-sweep` highlight on view.
- **Founder** — large kinetic pull-quote via `KineticText` (word fade-in); avatar
  gradient ring pulse (opacity/filter, reduced-motion safe).
- **Pricing** — **logic untouched**: the `group/tiers` CSS toggle and
  `navigate({ to: '/checkout/$tier' })` wiring stay exactly as-is. Add only:
  reveal stagger on cards, hover lift (`y`/`scale` spring), featured-card
  `gradient-sweep`.
- **FAQ** — replace instant open/close with `AnimatePresence` height + opacity
  spring. The `+`/rotate indicator stays.
- **Footer** — a `Marquee` tagline band ("Resumes grounded in real code · Made in
  Dublin · …") above the existing subscribe row.
- **Section dividers** — replace the thin `border-t border-white/5` separators
  with bolder full-bleed marquee or gradient-sweep separators between major
  sections.

## Motion & code constraints (from CLAUDE.md / .claude/rules/motion-react.md)

- Import from `motion/react` only (never `framer-motion`).
- Animate `transform`/`opacity`/`clipPath`/`filter` only; add matching
  `willChange`. Use independent transforms (`x`, `scaleX`) when composing.
- Never read a `MotionValue` during render — only in effects / `useTransform` /
  style bindings.
- Every new animation has a reduced-motion path (kill-switch class or
  `useReducedMotion`).
- Tune springs with the Motion Studio MCP (`css-spring` / `visualise-spring`).
  Verify any unfamiliar `motion/react` API via context7 before writing.
- SonarQube/ESLint: cyclomatic complexity ≤ 10 (extract helpers), no nested
  ternaries (guard clauses / early returns), `Set.has()` for membership, stable
  React keys (never array index alone for dynamic lists — use content+index where
  content is stable), `crypto.randomUUID()` for any id, no `console.*`.
- UK English in all prose/comments. `resume` (no diacritics). Product = "Tucaken".

## Radius decision

New chrome (bars, badges, small controls) uses `rounded-md` per the repo default.
Existing large card/panel radii (`rounded-2xl` / `rounded-3xl`) are kept as
intentional marketing-surface design and are **not** flattened, since this
redesign is motion-focused, not a radius pass. `rounded-full` pills/dots/avatars
stay.

## Testing & verification

- `yarn typecheck && yarn lint && yarn test` green before done.
- New pure helpers (e.g. token-splitting in `KineticText`, marquee duplication)
  get colocated Vitest unit tests under `__tests__`.
- Manual: `yarn dev` (port 5001), exercise the Home page in both a normal browser
  and with `prefers-reduced-motion` forced — confirm all motion freezes and the
  page is fully usable. Verify Pricing toggle + checkout navigation still work.

## Build order (high level — detailed plan follows in writing-plans)

1. Toolkit + styles.css keyframes (`Marquee`, `KineticText`, `ScrollProgress`,
   `gradient-sweep`).
2. Hero redesign.
3. HowItWorks + Problem.
4. Comparison + Founder.
5. Pricing (motion-only) + FAQ (`AnimatePresence`).
6. Header scroll behaviour, Footer marquee, section dividers, `ScrollProgress`
   mount.
7. Reduced-motion + a11y pass, typecheck/lint/test, manual QA.
