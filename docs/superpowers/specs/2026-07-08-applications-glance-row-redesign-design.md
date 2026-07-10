# Applications glance row redesign — ATS left, compact Assessment + Skill coverage right

**Date:** 2026-07-08
**Status:** Approved (design), pending implementation
**Scope:** `ResearchGlance` (Applied/default stage) inside
`src/features/applications/components/StageGlancePanel.tsx` and the components it
composes. No other stage layout changes.

## Problem

On the application detail page (`/applications/$slug`, Applied stage), the
at-a-glance dashboard renders a slim left column (Assessment fit tile above the
Skill-coverage donut) and a wide right column (ATS check above "What we
understood from the JD"). The Assessment tile and Skill-coverage donut are
sized for a tall slim column and dominate vertical space, while the ATS check —
the densest, most actionable block — is squeezed above the JD panel.

## Goal

Rework the top row of the Applied-stage glance dashboard into a mirrored split:

```text
┌───────────────────────────────────────┬──────────────────────┐
│ ATS check · Tailored resume    ✓ chip │ Assessment (compact)  │
│ fact rows (2-col grid)                │ meter + fit verdict   │
│ Sections detected: chips              ├──────────────────────┤
│ JD keyword coverage: chips            │ Skill coverage        │
│ legend / issues                       │ (compact donut +      │
│ (wide, col-span-2)                    │  legend, fills rest)  │
└───────────────────────────────────────┴──────────────────────┘
│ What we understood from the JD (full width)                   │
│ Role emphasis (full width, unchanged)                         │
```

1. **ATS check ("Tailored resume") moves to the wide left slot** (`col-span-2`
   of the existing `@2xl:grid-cols-3` container grid).
2. **Assessment and Skill coverage stack in the slim right slot**
   (`col-span-1`), Assessment on top.
3. **Combined height of the right stack equals the ATS panel's height.** The
   right slot is a flex column: Assessment keeps its natural compact height;
   Skill coverage takes the remaining space (`flex-1`). No white-space gap
   below the stack.
4. **Both right-hand panels shrink proportionally without changing style** —
   same surface, colours, typography hierarchy, icons, and animations; only
   scale and spacing come down.
5. **`JdUnderstandingPanel` moves to a full-width row** directly below the
   split row (it loses its right-column seat). `RoleEmphasisPanel` stays
   full-width at the bottom, unchanged.

## Component changes

### `StageGlancePanel.tsx` — `ResearchGlance`

- Swap the two columns: `AtsPanel` renders in the `@2xl:col-span-2` motion
  wrapper (left/first); the fit tile + coverage stack renders in the
  `@2xl:col-span-1` wrapper (right/second) as `flex flex-col gap-4`.
- The Skill-coverage child gets `flex-1 min-h-0` so the stack stretches to the
  grid row height set by the ATS panel.
- `JdUnderstandingPanel` moves out of the right column into its own
  `@2xl:col-span-3` motion row between the split row and `RoleEmphasisPanel`.
- Stagger animation (`GRID`/`TILE` variants) and the `@container` breakpoint
  behaviour are preserved: below `@2xl` everything stacks single-column in DOM
  order — ATS, Assessment, Skill coverage, JD, Role emphasis.

### Responsiveness (requirement, not nice-to-have)

- The split row responds to the **panel's own width** via `@container`
  queries (the dashboard has a sidebar), never the viewport.
- Below the `@2xl` container breakpoint: single column, full-width cards, in
  DOM order (ATS, Assessment, Skill coverage, JD, Role emphasis). The
  equal-height coupling applies only when the columns sit side by side.
- No horizontal overflow at any width: keyword/section chips wrap
  (`flex-wrap`), the donut scales via `max-w-*` + `aspect-square`, and the
  ATS fact grid collapses `sm:grid-cols-2` → one column as it does today.
- The compact right-stack panels must remain legible at the narrowest
  supported container (~320px content width): donut centre label and legend
  rows must not truncate below readability.

### `GlanceTile` (Assessment) — compact variant

Add an opt-in `compact` prop (default off; all other call sites unchanged):

- Padding/gap tightened (e.g. `p-4`, `gap-2` instead of `p-5`, `gap-3`).
- `LevelMeter` minimum height reduced (`min-h-16` → about `min-h-10`).
- Fit verdict text one step smaller (`text-lg` → `text-base`); hero values
  (`text-3xl`/`text-4xl`) step down equivalently for non-meter tiles.
- Icon, uppercase label, tone colours, and mount animations unchanged.

### `ResearchCompareGraphic` (Skill coverage) — compact variant

Add an opt-in `compact` prop (default off):

- Donut capped smaller (`max-w-44` → about `max-w-28`).
- Legend spacing tightened (`space-y-3` → `space-y-1.5`, `text-sm` →
  `text-xs`), inner vertical gaps reduced (`gap-6` → about `gap-3`).
- Emerald/amber/red scheme, count-up centre label, arc fill springs, and
  reduced-motion handling unchanged.

### Unchanged

- `AtsPanel` internals — content already suits the wide slot; only its grid
  position changes.
- Free tier: when `evidenceFit` is present and the matcher produced no
  verdicts, `FitScorePanel` still replaces the Skill-coverage donut in the
  same right-stack slot, unmodified.
- Empty states: fit tile shows "Awaiting analysis". The ATS panel renders only
  when `detail.analysis.atsCheck` exists; when it is absent,
  `JdUnderstandingPanel` takes the wide left slot instead (keeping the row
  balanced, as the pre-change layout did) and only moves to its own full-width
  row once ATS data exists.
- All other stages (phone-screen, technical, system-design, behavioural,
  bar-raiser, final) — no layout or sizing changes.

## Data

No data-shape, API, or loader changes. All blocks keep reading
`detail.research`, `detail.analysis.atsCheck`, and `detail.analysis.evidenceFit`.

## Testing

- Existing coverage: `src/__tests__/features/applications/workspaces/technical.test.tsx`
  exercises `StageGlancePanel` for the technical stage — must stay green
  (guards the "no other stage changes" constraint).
- Add/extend a render test for the Applied stage asserting: ATS panel present,
  Assessment tile and Skill-coverage donut present, JD panel rendered, and the
  compact variants applied (e.g. via class or size assertions on the donut
  wrapper).
- Manual verification on `/applications/2579abec-f3d2-4a60-b100-a1823fa59161`
  against live cluster data: wide viewport (split row, equal heights), narrow
  viewport (single-column stacking), dark mode, and `prefers-reduced-motion`.
- `yarn typecheck && yarn lint && yarn test` before completion.

## Non-goals

- No adoption of the Knowledge Base panel surface/shell for these cards
  (explicitly rejected in review — style stays as-is, only scale changes).
- No changes to `AtsPanel` content or to the JD/Role-emphasis panel internals.
- No new shared layout primitives; the split lives in `ResearchGlance`.
