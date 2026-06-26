# KB Health Panel — refine-in-place restyle

Date: 2026-06-26
Branch: `feat/kb-health-panel-restyle`
Scope: single file — `src/components/kb/KnowledgeBaseHealthPanel.tsx`

## Problem

The Knowledge Base health pane ("Your AI agent's data health at a glance")
reads as flat and plain, is hard to scan (no at-a-glance verdict on the full
panel), and feels cramped (tight padding and gaps). Both render modes are
affected: the full panel (dashboard, via `KbHealthPanel`) and the `compact`
retrieval-only card (Applied workspace).

## Goal

Refine in place — keep the existing layout and structure; sharpen hierarchy,
spacing, and contrast so status is obvious and the surface feels intentional.
No copy changes, no data-shape changes, no new dependencies.

## Changes

### 1. At-a-glance status pill (header, both modes)

A colour-coded pill top-right of the header, reusing the existing verdict
dot+tone visual pattern (`size-2 rounded-full` dot + tinted text).

- Full panel — simple presence logic:
  - `kb` absent → "No data" (zinc tone).
  - `kb` present → "Indexed" (emerald tone) with repo count appended
    (e.g. "Indexed - 3 repos").
- Compact panel — driven by the already-computed `retrievalVerdict(stats)`
  (reuses its label/tone/dot); when no `retrieval`, no pill.

Implemented as a small `StatusPill` sub-component plus a `kbStatus(kb)` helper
that returns `{ label, tone, dot }` via early returns (no nested ternary;
cyclomatic complexity well under 10).

### 2. Stat tiles (`StatTile`) — fix flat/plain

- Icon moves into a `rounded-md` accent-tinted chip (`bg-accent/10`, accent
  icon colour) instead of a bare glyph.
- Slightly stronger border and a subtle `shadow-sm` for depth.
- Value stays `tabular-nums`; label unchanged. Still `rounded-md`.

### 3. Spacing and rhythm — fix cramped

- Shell padding `p-5` -> `p-6`.
- Section stacks `space-y-5` -> `space-y-6`.
- Stat grids `gap-2` -> `gap-3`; tile padding `p-3` -> `p-3.5`.

### 4. Section headers — consistent scan anchors

The tiny grey uppercase labels ("Indexed repositories", "Top technologies",
"Retrieved from", "Top sources") get one shared treatment: `text-zinc-500`
(up from `zinc-400`), a small leading Lucide icon where it aids scanning
(GitBranch / Tag), and a consistent bottom margin. Extract a `SectionLabel`
helper so the styling lives in one place.

### 5. Bars and chips

No structural change. Keep existing Motion spring animations and accent fills;
only align radius/contrast with the rest of the panel.

## Constraints honoured

- Teal accent tokens only (`--accent`); no arbitrary hex.
- `rounded-md` default; `rounded-full` only for the pill dot and pill body.
- Renders correctly in light and dark mode.
- Motion imports stay `motion/react`; animations unchanged.
- English (UK) copy; no new user-facing strings beyond pill labels.
- SonarLint: early returns, no nested ternaries, `Set` for any membership,
  stable keys (already content-keyed).

## Out of scope

- Health-tier thresholds (chunk/repo cutoffs) — explicitly deferred.
- Layout restructure, health ring/score, new data viz.
- Changes to `KbHealth` / `KbRetrievalStats` types or their producers.

## Verification

`yarn typecheck && yarn lint && yarn test`, then `yarn dev` and eyeball both
modes (dashboard full panel + Applied workspace compact card) in light and
dark, including the empty / no-passages states.
