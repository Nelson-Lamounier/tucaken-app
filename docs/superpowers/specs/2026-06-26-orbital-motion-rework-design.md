# Orbital motion rework — design

Date: 2026-06-26
Branch: `feat/orbital-enhancements`
Worktree: `../tucaken-app-wt-orbital-fx`

## Goal

Rework the desktop `OrbitalComparison` motion so that:
1. clicking a CTA node **rotates the ring** to bring that node to the **top** and
   opens its detail card **centred in the big circle** (same position for every
   node), pausing the spin;
2. the scroll effect brings the CTA nodes **in from outside** to settle on the
   ring (replacing the whole-orbital scale).

Both mirror the reference `RadialOrbitalTimeline` behaviour (`centerViewOnNode`,
`calculateNodePosition`), re-expressed with `motion/react` MotionValues.

## Why a rework

The current ring uses a **CSS-keyframe spin** (`.orbit-spin-anim`) with each node
counter-spun to stay upright. A CSS spin cannot rotate a *specific* node to a
*target* angle, so click-to-anchor is impossible with it. The fix is to drive
rotation with a `motion` MotionValue we can both loop continuously and animate to
a target on click.

## Current state (relevant)

- `OrbitalComparison` (desktop branch): nodes live in a `.orbit-spin-anim` group;
  each `OrbitalNode` is placed by `nodeTransform(angle, OUTER_RADIUS)` and
  counter-spun (`.orbit-counter-spin-anim`). Solid outer ring (`orbit-ring-outer`)
  rides the spin group. Centre = `InfinityHub` (svgEffect trace). Expand card is
  an `AnimatePresence` `motion.div` anchored bottom-centre. A scroll `scale`
  (`useScroll`/`useTransform`, 0.82->1.06) wraps the orbital. Mobile + reduced
  motion render `ComparisonList`.
- `orbital-geometry.ts`: `nodeAngles(total)`, `nodeTransform(angle, radius)`.
- `styles.css`: `.orbit-spin-anim` / `.orbit-counter-spin-anim` (48s) + their
  `prefers-reduced-motion` kill-switch entries.

## Decisions / behaviour

- **Rotation = `useMotionValue(0)` (degrees).** Auto-spin via
  `animate(rotation, rotation.get() + 360, { duration: 48, ease: 'linear', repeat: Infinity })`
  while no node is open. On click, `controls.stop()` then animate to the snap
  target; on close, resume from the current angle.
- **Node position from MotionValues.** Each node's `baseAngle = (i/total)*360 - 90`.
  `x = useTransform(() => radius.get() * cos(rad(baseAngle + rotation.get())))`,
  `y = useTransform(() => radius.get() * sin(...))`, bound to a `motion.div`
  `style={{ x, y }}`. Nodes translate and stay upright — **no counter-spin**.
- **Click snap to top.** `target = -(i/total)*360` puts node *i* at -90 (top).
  Normalise to the nearest equivalent of `rotation.get()` (add/subtract whole
  turns) for the shortest path. Snap with a spring
  (`{ type: 'spring', stiffness: 120, damping: 20 }`).
- **Centre detail card.** A single `AnimatePresence` `motion.div`, absolutely
  centred (`left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`), shows the active
  node's `q` / Other-tools (`o`) / Tucaken (`t`). Same spot for every node.
  **InfinityHub is hidden while a card is open** (card covers the centre).
- **Spin pause/resume.** `activeId !== null` => paused. Backdrop click clears
  `activeId` and resumes the loop.
- **Scroll fly-in.** `radius = useTransform(scrollYProgress, [0, 0.5], [FLY_IN_RADIUS, OUTER_RADIUS])`
  (clamped; `useScroll({ target: reduce ? undefined : orbitRef, offset: ['start end', 'end start'] })`).
  `FLY_IN_RADIUS = 520`. Nodes start outside and settle on the ring by the
  scroll midpoint. Replaces the old `scale` wrapper.
- **Static outer ring.** With nodes translated rather than group-rotated, the
  solid outer ring is a static centred circle (a solid circle spinning was
  invisible, so no visual regression). Keep `data-testid="orbit-ring-outer"`.
- **Reduced motion / mobile:** unchanged — still return `ComparisonList`. All
  new MotionValues/hooks run before the `if (reduce) return` guard; `animate`
  loop only starts when not reduced (guarded in the effect).

## Components / changes

### 1. `orbital-geometry.ts` (pure, tested)
- Keep `nodeAngles`/`nodeTransform` (still used by `nodeXY` callers / inner maths
  may reuse). Add:
  - `baseNodeAngle(i: number, total: number): number` => `(i/total)*360 - 90`.
  - `rotationToTop(i: number, total: number): number` => `-(i/total)*360`.
  - `nodeXY(baseAngleDeg: number, rotationDeg: number, radius: number): { x: number; y: number }`
    => `{ x: radius*cos(rad), y: radius*sin(rad) }` where `rad = (baseAngleDeg + rotationDeg) * PI/180`.
  - `shortestEquivalentAngle(target: number, current: number): number` =>
    `target + Math.round((current - target) / 360) * 360`.

### 2. `OrbitalComparison.tsx`
- Hooks (all before the `if (reduce)` guard): `useReducedMotion`, `useState`
  (`activeId`), `useRef` (`orbitRef`), `useMotionValue` (`rotation`), `useScroll`
  + `useTransform` (`radius`).
- Auto-spin/snapping `useEffect` keyed on `activeId` (and `reduce`): if reduced,
  do nothing; if `activeId` null, start the continuous spin loop and store its
  controls; on cleanup, stop it.
- Click handler `onToggle(i, label)`: if opening, stop the spin and
  `animate(rotation, shortestEquivalentAngle(rotationToTop(i,total), rotation.get()), spring)`,
  set `activeId`; if closing (same node) or backdrop, clear `activeId`.
- `OrbitalNode` rewritten: props `{ item, x, y, expanded, onToggle }` where `x`/`y`
  are MotionValues; renders a `motion.div style={{ x, y }}` containing the button
  (absolutely centred) + label. No counter-spin, no `data-paused`.
- Node `x`/`y` MotionValues are created in the parent per node via `useTransform`
  (stable node count = `items.length`; hooks-in-loop is safe because the list is
  fixed-length and never reorders — but to satisfy the rules-of-hooks lint, build
  a fixed-size array by mapping `items` once at the top, before the guard).
- Outer ring: static centred circle (`data-testid="orbit-ring-outer"`).
- Centre card replaces the bottom card; `InfinityHub` rendered only when
  `activeId === null`.
- Remove the `scale` `motion.div` wrapper; keep `orbitRef` on the layout-stable
  `relative hidden lg:block` wrapper.

### 3. `styles.css`
Remove `.orbit-spin-anim`, `.orbit-counter-spin-anim`, their keyframes, and their
`prefers-reduced-motion` kill-switch entries (now unused). Leave the rest.

## Constraints
- `motion/react` only; no new deps; teal/zinc; `willChange` transform/opacity only
  (none on the svgEffect path); no nested ternaries; complexity <= 10 (extract
  helpers / `OrbitalNode`); stable keys (`item.label`); never read a MotionValue
  in render except inside a `useTransform`/effect callback; UK English; no
  `console.*`; no `as any`.
- Hooks unconditional and before the `if (reduce) return <ComparisonList/>` guard;
  rules-of-hooks: node MotionValues built by mapping the fixed-length `items` once.
- Use MotionPlus MCP / `css-spring` to tune the snap spring + fly-in.

## Testing (Vitest, happy-dom; extend `OrbitalComparison.test.tsx` + geometry test)
- Geometry: `baseNodeAngle(0,4)===-90`, `rotationToTop` values, `nodeXY` for a
  known angle, `shortestEquivalentAngle` picks nearest turn.
- Orbital: 4 node buttons; clicking a node sets its `aria-expanded` true and shows
  that node's `q`/`o`/`t` in the centre card; clicking another switches; backdrop
  closes. Outer ring + infinity-hub present (infinity hidden when a card open —
  assert hub absent after a click). Reduced-motion renders the list (no buttons).

## Out of scope
- No data/content changes; no new routes/deps; mobile + reduced-motion list
  untouched; other sections untouched.

## Verification
- `yarn typecheck && yarn lint && yarn test` green.
- `yarn dev`: nodes fly in from outside on scroll and settle on the ring; auto-spin
  loops; clicking a node rotates it to the top, pauses the spin, opens the centre
  card (infinity hidden); backdrop closes and resumes; reduced-motion/mobile show
  the list.
