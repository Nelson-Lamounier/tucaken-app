# Pricing reveal redesign — design

Date: 2026-06-25
Branch: `feat/pricing-reveal-redesign`
Worktree: `../tucaken-app-wt-pricing-reveal`

## Goal

Redesign the home/landing "Pricing reveal" section (`PricingSection`) into a
"spectacle reveal": animated price counters, a light motion sparkle backdrop,
and a sliding motion toggle — re-skinned to the repo teal/zinc palette and kept
wired to the live, admin-editable tier config.

Origin: a pasted 21st.dev component (`PricingSection6`, blue/indigo, hardcoded
plans, `framer-motion`, `tsparticles`, `NumberFlow`, `VerticalCutReveal`).
That component is **not** dropped in raw — repo rules require teal/zinc (no
blue/indigo), `motion/react` (never `framer-motion`), no duplicate primitives,
and live data wiring. The redesign refactors the existing section, borrowing the
good ideas only.

## Current state

- Section lives in `src/features/home/sections/Sections.tsx` (`PricingSection`,
  ~lines 105-254). Rendered on `/` (HomePage scroll sequence) and standalone on
  `/pricing`.
- Data: React Query `['public-tier-config']` -> `getPublicTierConfigFn` ->
  `tiersFromPublic(publicConfig)`; falls back to the static `TIERS` catalog in
  `src/features/billing/catalog.ts` while loading or if the endpoint is
  unreachable. Admin-editable prices/features without redeploy.
- Animation: `motion/react` card reveals (`whileInView`, `whileHover`), CSS-only
  monthly/annual price swap via `:has()` radio selectors (no JS state),
  `.gradient-sweep-anim` Recommended badge.
- Palette: teal/zinc dark. Tokens in `src/styles.css` `@theme` (`--accent`
  teal-600 light / teal-400 dark). Home page wraps in
  `<MotionConfig reducedMotion="user">`.
- Primitives reused: `KineticText` (the repo's own staggered char reveal — used
  in place of `VerticalCutReveal`), `MagneticButton` (CTAs), `Section`/`Eyebrow`
  helpers.

## Decisions

- **Backdrop = light motion sparkles** (not `tsparticles`, not CSS-only). ~36
  small teal dots twinkling via `motion/react`. Chosen over the full particle
  engine to avoid two heavy deps + canvas cost, and over pure CSS to keep the
  "reveal" feel.
- **Retire the zero-JS CSS toggle.** `NumberFlow` needs a real numeric prop, so
  the section gains an `isYearly` React state. This is an accepted tradeoff
  (loses the no-state elegance) that also unlocks the sliding `layoutId` pill.
- **Keep `KineticText`** for the heading — do not add `VerticalCutReveal`
  (would be a duplicate primitive).
- **One new dependency:** `@number-flow/react`. MIT, actively maintained.
  `tsparticles` and `framer-motion` are explicitly NOT added.

## Components / changes

### 1. New `SparkleField` (`src/features/home/lib/SparkleField.tsx`)
- ~36 teal dots. Positions, sizes, twinkle delays **deterministically seeded**
  (fixed seed array or index-derived math) — **no `Math.random`** (SonarLint
  S2245 Security Hotspot fails the gate). Stable React keys from the seed index.
- Twinkle animates `opacity`/`scale` only, `willChange: 'opacity, transform'`.
- `useReducedMotion()` -> static faint dots (no animation) when reduced.
- Absolutely positioned, radial-mask edge fade, `z-0` behind cards. Includes one
  re-skinned radial **teal** glow (pasted blue `radial-gradient` recoloured; no
  arbitrary blue hex).
- Presentational only — no props beyond optional `className`/count.

### 2. `PricingSection` refactor (`Sections.tsx`)
- Add `const [isYearly, setIsYearly] = useState(false)`.
- Toggle: two buttons (Monthly / Annually) in a pill; sliding indicator is a
  `motion.span` with `layoutId` + spring, teal fill. Sets `isYearly`.
- Prices: `<NumberFlow value={isYearly ? t.priceAnnual : t.priceMonthly} />`
  with a `€` prefix span and `/month`·`/year` suffix. Free tier renders "Free".
- Mount `<SparkleField />` + glow inside the `<Section>`; cards stay `z-10`.
- Unchanged: live tiers query + fallback, `KineticText` heading, `MagneticButton`
  CTAs and navigate logic (`free -> /sign-in`, paid -> `/checkout/$tier`),
  per-card motion reveal, Recommended badge.
- Watch cyclomatic complexity (lint cap 10): extract a price-display helper /
  the toggle into small components rather than nesting conditionals; no nested
  ternaries (S3358).

### 3. Dependency
- `yarn add @number-flow/react` (root). Verify exact API + SSR hydration via
  **context7 MCP** before writing — TanStack Start is SSR and `NumberFlow` wraps
  a custom element. **Risk:** SSR/hydration mismatch; confirm clean render
  server-side and fall back gracefully (plain number) if needed.

### 4. Reduced motion / responsive
- No new props to `PricingSection`; data flow identical.
- Sparkles static under reduced motion; `NumberFlow` respects
  `prefers-reduced-motion` natively; pill still toggles (no slide).
- Responsive: keep 1-col -> 3-col grid; sparkles scale to container.

## Animation tooling
- **MotionPlus MCP (`motion`) is available** and should be used for spring
  tuning and saved-transition/example lookup — specifically the pill `layoutId`
  spring and the sparkle twinkle curve. Use `css-spring` / `see-transition`
  skills as needed. `motion` skill for any animation work.

## Testing (Vitest, colocated)
- Toggle flips the value handed to the price (monthly <-> annual).
- Free tier CTA navigates to `/sign-in`; paid tier to `/checkout/$tier`.
- `SparkleField` renders under reduced motion without crashing.

## Out of scope
- No change to tier data, billing catalog, checkout flow, or admin config.
- No new routes; both `/` and `/pricing` pick up the redesign automatically.
- No retrofit of other sections.

## Verification
- `yarn typecheck && yarn lint && yarn test` green.
- `yarn dev` (port 5001): exercise toggle (counter animates), reduced-motion,
  free vs paid CTA, mobile + desktop layout, light + dark.
