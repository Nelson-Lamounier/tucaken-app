# Comparison orbital + Founder motion refresh — design

Date: 2026-06-25
Branch: `feat/comparison-founder-orbital`
Worktree: `../tucaken-app-wt-orbital`

## Goal

Redesign the home page `ComparisonSection` into an interactive radial **orbital**
(nodes orbiting a central Tucaken hub, click-to-expand), re-skinned to teal/zinc
and ported to `motion/react` + CSS transforms. Give `FounderSection` a light
motion refresh in the same PR. Both stay driven by the real `content.ts` data.

Origin: a pasted 21st.dev `RadialOrbitalTimeline` (purple/blue, vanilla CSS
`animate-ping`/`pulse`, shadcn `Badge`/`Button`/`Card`, `setInterval`-driven
rotation, invented per-node `energy`/`status`/`date`). It is NOT dropped in raw —
it is re-skinned and re-implemented to repo rules.

## Honesty constraint

The demo's `energy`, `status`, and `date` fields are fabricated. This repo's rule
is *verify every claim — no fabricated content*. The orbital keeps ONLY the real
`comparison` data (`q` / `o` / `t`). No energy bars, no fake statuses, no dates,
no invented "connected nodes".

## Current state

- `ComparisonSection` (`src/features/home/sections/Sections.tsx`, ~lines 109-143):
  a 4-row table — columns "You ask" (`q`) / "Other tools" (`o`) / "Tucaken" (`t`)
  — with `motion.div` staggered slide-in per row. Wrapped in `Section` with an
  `Eyebrow` + `KineticText` heading.
- `FounderSection` (~lines 145-178): quote card, pulsing teal avatar "N",
  `useReducedMotion()`-gated.
- Data in `src/features/home/content.ts`: `comparison` = 4 `{ q, o, t }` objects;
  `founder` = `{ name, role, quote }`.
- Rendered in `HomePage.tsx`: ... ScrollStory -> Comparison -> Founder -> Pricing.
  Whole page wrapped in `<MotionConfig reducedMotion="user">`.
- Palette teal/zinc; tokens in `styles.css` `@theme`; `.gradient-sweep-anim`
  keyframe + a `prefers-reduced-motion` kill-switch already established.
- `cn` helper at `src/lib/utils.ts`; `lucide-react@^0.545.0` present; NO shadcn
  (`components.json` absent; `src/components/ui/` holds custom components).

## Decisions

- **Orbital applies to the Comparison section only.** Founder gets a light motion
  refresh, not an orbital.
- **Rotation approach A (chosen):** CSS `@keyframes orbit-spin` on the ring
  container (GPU `transform: rotate` only) with each node counter-spun to stay
  upright. No `setInterval`, no per-frame React re-render (the pasted version
  re-renders all nodes ~20fps — violates the `motion/react` + `willChange`
  perf rules). Pause via `animation-play-state` on hover/expand. Rejected:
  (B) `useAnimationFrame` MotionValue (heavier, unneeded); (C) no auto-rotate.
- **No new dependencies.** `lucide-react` already present. Do NOT port shadcn
  `Badge`/`Button`/`Card` or add `class-variance-authority`/`@radix-ui/react-slot`.
- Keep `KineticText`, `Section`, `Eyebrow`, the live data flow.

## Components / changes

### 1. Data — `src/features/home/content.ts`
Extend each `comparison` row with a short `label` (node caption) and an `icon`
(lucide icon name string), keeping `q`/`o`/`t`. Labels are UI captions for
existing points, not new claims. Proposed:
```ts
export const comparison = [
  { label: 'Evidence',        icon: 'FileSearch', q: 'What is your evidence for this claim?', o: '…', t: '…' },
  { label: 'Tailoring',       icon: 'Target',     q: 'Can you tailor for a Kubernetes role?', o: '…', t: '…' },
  { label: 'Thin docs',       icon: 'FileWarning',q: 'What if my repos have thin docs?',      o: '…', t: '…' },
  { label: 'Sounds like you', icon: 'Fingerprint',q: 'Will this resume sound like me?',       o: '…', t: '…' },
] as const
```
(`o`/`t` text unchanged from current content.) Export a `ComparisonItem` type.
Icon is stored as a string key; the component maps it to a lucide component via a
small `Set`/record allow-list (no dynamic `lucide[name]` lookup).

### 2. New `OrbitalComparison` (`src/features/home/lib/OrbitalComparison.tsx`)
- Props: `{ items: readonly ComparisonItem[] }`. Presentational.
- **Desktop (lg+):** N nodes positioned on a ring via static
  `rotate(iθ) translate(radius) rotate(-iθ)` transforms; the ring container spins
  via `.orbit-spin-anim`; each node carries `.orbit-counter-spin-anim` to stay
  upright. Central hub = teal gradient (`from-teal-400 to-emerald-600`) with a
  soft pulse (reuse existing pulse idiom). Nodes are `<button>` elements with the
  lucide icon + `label`; `aria-expanded` reflects state.
- **Expand:** clicking a node sets `activeId` (single open at a time), pauses the
  spin (`data-paused` toggling `animation-play-state`), and reveals a card with
  the question (`q`), an "Other tools" line (`o`) and a "Tucaken" line (`t`,
  teal ✓). `AnimatePresence` + a `motion.div` spring for the card. Click the
  backdrop (not a node) collapses and resumes.
- **Fallback (mobile `< lg` AND `prefers-reduced-motion`):** render an accessible
  static list of the same `q`/`o`/`t` (no spin, no absolute positioning). Driven
  by the same `items`. Use `useReducedMotion()` + a CSS `lg:` breakpoint so the
  orbital is `hidden lg:block` and the list is `lg:hidden` — keyboard/SR users and
  small screens always get the honest content.
- Keys: stable `item.label` (never array index).
- `willChange` limited to `transform`/`opacity`.
- MotionPlus MCP (`motion`) for tuning the expand spring + spin speed.

### 3. `ComparisonSection` (Sections.tsx)
Keep `Section` + `Eyebrow` + `KineticText` heading; replace the table body with
`<OrbitalComparison items={comparison} />`. Remove the old table markup.

### 4. `FounderSection` motion refresh (Sections.tsx)
Keep the card, avatar, name/role, links. Add a tasteful quote reveal — wrap the
`blockquote` body in a `motion.div` with a short fade/slide `whileInView`
(viewport once), and a small hover lift/colour on the links. `useReducedMotion()`
gates the motion (static fallback). No structural change.

### 5. CSS — `styles.css`
Add `@keyframes orbit-spin` (0->360deg) and its reverse for the counter-spin;
`.orbit-spin-anim` / `.orbit-counter-spin-anim` (slow, e.g. 40s linear infinite,
`will-change: transform`). Add both to the existing
`@media (prefers-reduced-motion: reduce)` kill-switch list.

## Accessibility / responsive
- Orbital is `hidden lg:block`; static list is `block lg:hidden`. Reduced-motion
  forces the list regardless of width.
- Nodes are focusable buttons with `aria-expanded`; expanded card content is real
  text. Hub is decorative (`aria-hidden`).
- No keyboard trap; backdrop-collapse is mouse-only convenience, not the only way
  to close (re-clicking a node toggles it).

## Testing (Vitest, happy-dom, colocated under `src/__tests__/features/home/`)
- `OrbitalComparison` renders one node button per item (desktop tree).
- Clicking a node reveals that item's `q`, `o`, and `t` text; clicking again or
  another node toggles correctly (single-open).
- The fallback static list renders every item's `q`/`o`/`t`.
- Reduced-motion path renders without crashing (mock `useReducedMotion`/matchMedia
  per existing home-test pattern).
- `FounderSection`: founder quote + name render (extend/confirm).

## Out of scope
- No change to other sections, routes, or the `founder`/`comparison` text content
  (only additive `label`/`icon` fields on comparison).
- No new dependencies. No shadcn adoption.

## Verification
- `yarn typecheck && yarn lint && yarn test` green.
- `yarn dev` (5001): desktop orbital spins, pauses on hover, node expands with
  q/o/t; resize below lg shows the list; reduced-motion shows the list; Founder
  quote reveals; light + dark.
