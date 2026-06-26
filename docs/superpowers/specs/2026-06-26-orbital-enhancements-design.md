# Orbital enhancements — design

Date: 2026-06-26
Branch: `feat/orbital-enhancements`
Worktree: `../tucaken-app-wt-orbital-fx`

## Goal

Enhance the existing home `OrbitalComparison` with four additions:
1. the orbit-path **outline ring** the real nodes sit on (was in the original
   21st.dev source, dropped in our re-skin);
2. a **second concentric ring** of decorative dots to balance the composition;
3. an **infinity symbol** at the hub that continuously traces itself;
4. a **scroll-linked expansion** — the whole orbital scales up as the section
   scrolls through the viewport.

All four live in the `lg:`-only orbital branch. The mobile + reduced-motion
fallback list is untouched.

## Current state

`src/features/home/lib/OrbitalComparison.tsx`:
- `OrbitalComparison` renders a static list under `useReducedMotion()`/`< lg`,
  else a desktop orbital: a `.orbit-spin-anim` ring of `OrbitalNode` buttons
  (4 real items at `RADIUS = 200`), a central teal-gradient hub with a white
  inner dot, and an `AnimatePresence` expand card.
- Spin pauses on hover (`group-hover/orbit`) and on expand (`data-paused`).
- `src/features/home/lib/orbital-geometry.ts`: `nodeAngles(total)` (evenly
  spaced, first at -90), `nodeTransform(angle, radius)` (ring placement +
  counter-rotation).
- `src/styles.css`: `@keyframes orbit-spin` / `orbit-counter-spin`,
  `.orbit-spin-anim` / `.orbit-counter-spin-anim` (48s), both in the
  `prefers-reduced-motion` kill-switch.
- `motion` (`motion/react`) installed; `lucide-react` present.

## Decisions

- **No new dependencies.** Infinity trace uses core `motion` `<motion.path>` +
  `pathLength`; scroll uses core `useScroll` + `useTransform`. The `motion-plus`
  package (token-gated) is NOT added — MotionPlus was consulted for the pattern
  only.
- Decorative second ring + dots carry no data (honesty rule untouched; only the
  4 real q/o/t nodes are interactive).
- All additions are inside the orbital-only branch, so reduced-motion / mobile
  users (the list) are unaffected, and SSR hydration is unchanged.

## Components / changes

### Constants (in `OrbitalComparison.tsx`)
- Keep `RADIUS = 200` (rename to `OUTER_RADIUS` for clarity; update the one
  usage).
- `INNER_RADIUS = 120`, `INNER_DOTS = 6`.
- `SCROLL_SCALE_RANGE = [0.82, 1.06]`.

### 1. `OrbitRing` (outline)
A presentational, `aria-hidden`, centred `rounded-full border border-teal-400/15`
circle sized `2 * OUTER_RADIUS` (400px) via inline `width`/`height`, absolutely
positioned and `-translate-x-1/2 -translate-y-1/2`. This is the track the real
nodes sit on. A second, fainter instance (`border-white/5`, `2 * INNER_RADIUS`)
is the inner ring's outline.

### 2. `InnerRing` (decorative dots)
`aria-hidden` group spinning via a new `.orbit-spin-slow-anim` (different speed,
~72s, also pauses on `group-hover/orbit`). Renders `INNER_DOTS` small dots
(`h-2 w-2 rounded-full bg-teal-400/50`) placed with
`nodeTransform(angle, INNER_RADIUS)` for each `nodeAngles(INNER_DOTS)`. Keys are
the angle value (stable, deterministic — not array index). No counter-spin
needed (dots are radially symmetric).

### 3. `InfinityHub`
Replaces the hub's inner white dot. An `<svg viewBox="0 0 100 50">` with a
lemniscate `<motion.path>` (a fixed `d` describing the ∞), `fill="none"`,
teal stroke, `strokeLinecap="round"`, soft glow via
`style={{ filter: 'drop-shadow(0 0 6px rgba(45,212,191,0.6))' }}`. Animate
`pathLength` `[0, 1]` (with a trailing fade) on a repeating loop
(`transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}`),
`style={{ willChange: 'opacity' }}` (pathLength animates stroke-dash, not a
transform). Keep the existing teal-gradient hub circle as the backing halo, or
replace it with a faint teal radial glow — keep the circle, drop only the white
dot. `aria-hidden`.

### 4. Scroll expansion
- Add `const orbitRef = useRef<HTMLDivElement>(null)`.
- `const { scrollYProgress } = useScroll({ target: orbitRef, offset: ['start end', 'end start'] })`.
- `const scale = useTransform(scrollYProgress, [0, 1], SCROLL_SCALE_RANGE)`.
- Wrap the orbital content in `<motion.div ref={orbitRef} style={{ scale, willChange: 'transform' }}>`.
- **Hook order:** `useReducedMotion`, `useState`, `useRef`, `useScroll`,
  `useTransform` ALL run before the `if (reduce) return <ComparisonList/>`
  guard (hooks must be unconditional). The `scale` value is simply unused on the
  list path.
- Never read `scale.get()` in render — only bind it via `style`.

### styles.css
Add:
```css
@keyframes orbit-spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.orbit-spin-slow-anim { animation: orbit-spin-slow 72s linear infinite; will-change: transform; }
.orbit-spin-slow-anim[data-paused='true'] { animation-play-state: paused; }
```
and append `.orbit-spin-slow-anim` to the existing
`@media (prefers-reduced-motion: reduce)` kill-switch selector list.

## Constraints
- `motion/react` only; teal/zinc palette; `willChange` limited to
  transform/opacity/clipPath/filter; no nested ternaries; complexity <= 10
  (sub-components keep functions small); stable keys (angle, not index); UK
  English; no `console.*`; no `as any`/redundant `!`.
- Keep the existing hover-pause, expand-pause, expand card, node buttons, and
  the list fallback exactly as they are.

## Testing (Vitest, happy-dom; extend `OrbitalComparison.test.tsx`)
- Outer outline ring is rendered (query a decorative ring element by a stable
  marker — e.g. `data-testid="orbit-ring-outer"`).
- Inner ring renders exactly `INNER_DOTS` decorative dots
  (`data-testid="orbit-inner-dot"`).
- The infinity hub renders an `<svg>` containing a `<path>`.
- The orbital still renders one `<button>` per real item (4) — node behaviour
  unchanged.
- Reduced-motion path still returns the static list (existing test stays green).

## Out of scope
- No change to `content.ts`, the list fallback, the expand card, or other
  sections. No new dependencies. No `motion-plus`.

## Verification
- `yarn typecheck && yarn lint && yarn test` green.
- `yarn dev` (5001): outline rings visible; inner dots orbit at a different
  speed; hub traces an ∞ on a loop; scrolling the section scales the orbital
  ~0.82 -> 1.06; hover/expand pause still work; mobile + reduced-motion still
  show the list.
