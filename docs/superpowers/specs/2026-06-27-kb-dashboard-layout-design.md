# Knowledge Base dashboard layout — standardised auto-fit reflow

**Date:** 2026-06-27
**Status:** Approved (design)
**Surface:** `src/features/user-home/components/UserDashboard.tsx` (the "Knowledge Base — Your AI agent's data health at a glance" page)

## Problem

The Knowledge Base dashboard does not present a standard layout across users.
Users with sparse data (no profile summary, few repos, no resume imports) see
white-space gaps between components, and the overall shape of the page changes
per user. Three independent container mechanisms cause this:

1. **Fixed column counts** (`md:grid-cols-2 xl:grid-cols-3`) always reserve N
   cells. Every cell in a grid row inherits the height of the tallest cell, so a
   user with one rich panel and two sparse ones gets tall holes. On `md` the 3rd
   panel wraps alone, leaving a half-row gap beside it.
2. **The `1fr_340px` main/sidebar split** strands a tall vertical band of white
   space when `<main>` is short (e.g. `profileSummary` is null, which is the
   common non-admin case) while the `<aside>` rail stacks three panels.
3. **Conditional panels that vanish entirely** (`{profileSummary && …}`) collapse
   their slot, changing the page shape per user instead of keeping it standard.

These are container problems, not styling bugs inside any panel.

## Goal

One standard, responsive layout that holds for every user. Panels reflow into
correct positions; no white-space gaps open up when a user lacks data.

## Non-goals (explicit)

- **No changes to any panel's internal design.** Each panel keeps its current
  markup, empty states, and styling. Panel-level changes are reviewed
  individually in separate passes.
- **No panel is hidden.** Every panel always renders; the container reflows to
  accommodate short/absent content. (Decision: "keep all panels, reflow to fill".)
- **No new runtime dependency.** No JavaScript masonry library.

## Approach

Replace rigid grid tracks with content-aware flow via a single reusable layout
primitive, applied consistently across the dashboard.

### Layout primitive — `PanelFlow`

A thin, pure-layout wrapper component in
`src/features/user-home/components/PanelFlow.tsx`. It is **not** a panel and
renders no panel chrome — only a grid container around its children.

Base (all browsers):

```
display: grid;
gap: 1.5rem;            /* gap-6, matches current spacing */
align-items: start;     /* short panels keep natural height; no internal hollow */
grid-template-columns: repeat(auto-fit, minmax(min(100%, <MIN>), 1fr));
```

Progressive enhancement (Safari 26 today; Chrome/Firefox as they ship):

```
@supports (grid-template-rows: masonry) {
  grid-template-rows: masonry;
}
```

Props:

- `min` — column min width in px (e.g. `300`, `340`); drives the `minmax`.
- `className` — pass-through for spacing/overrides.
- `children` — the panels.

Implementation uses Tailwind v4 arbitrary-value utilities and the
`supports-[…]` variant (no `tailwind.config`, consistent with this repo's
`@theme`-in-`styles.css` convention). The exact utility syntax is verified
against Tailwind v4 docs (context7) at implementation time before writing it.

### Key technical decisions (and why)

- **`auto-fit`, not `auto-fill`.** With only 2–4 dashboard panels, `auto-fill`
  leaves empty phantom tracks on the right (trailing white space — the exact
  bug). `auto-fit` collapses empty tracks so present panels stretch to fill the
  row. For few items they behave oppositely; for galleries of hundreds they are
  identical. We want `auto-fit`.
- **`min(100%, <MIN>)` guard**, not a bare `<MIN>px`. Without the `min()` guard,
  `auto-fit` overflows the viewport (horizontal scroll) below the min width on
  narrow phones. The guard caps the track at 100% of available width.
- **`align-items: start`**, not the default `stretch`. Stretch pads short panels
  to match the tallest in their row (hollow space *inside* panels). `start`
  keeps natural heights and lets siblings expand into a missing panel's track.
- **`@supports` masonry, no JS lib.** Native CSS masonry ("CSS Grid Lanes")
  ships in Safari 26; Chrome/Firefox are behind experimental flags in 2026.
  Progressive enhancement gives every browser the robust auto-fit baseline and
  Safari users tighter vertical packing for free, with zero dependency and zero
  breakage risk.

### Zones in `UserDashboard.tsx`

Source order = priority order, identical for every user.

- **Zone 1 — overview cards** (`PanelFlow min=300`). The hero band. Both the
  admin pair (`KbScorePanel`, `KbStatsPanel`) and the non-admin trio
  (`KbOverviewPanel`, `RepoBreakdownPanel`, `CareerDataBreakdown`) flow through
  the same primitive. Replaces `xl:grid-cols-[360px_1fr]`,
  `md:grid-cols-2 xl:grid-cols-3`.
- **Zone 2 — working panels, flattened** (`PanelFlow min=340`). Drop the
  `1fr_340px` main/sidebar split. `Profile Intelligence` (the `AnimatedTabs`
  section, when present), `RepoProfileCards`, `KbSetupChecklist`,
  `ResumeFilesList`, `KbActivityFeed` all become panels in one `PanelFlow`. When
  `profileSummary` is absent, the rest reflow to fill — no stranded column, no
  tall band.
- **Zone 3 — `KbQuickActions`.** Unchanged; already full-width.

## Trade-offs accepted

- **Flattening Zone 2 loses the deliberate "wide reading column + narrow rail"
  hierarchy.** Chosen deliberately in favour of a uniform, gap-free layout that
  is standard per user.
- **A small ragged bottom remains on non-Safari browsers** (panels in the same
  row ending at different heights). Full removal needs masonry (Safari gets it
  via `@supports`) or the height-capping follow-up below. Auto-fit removes the
  large gaps: wrapped half-rows, the stranded sidebar column, and per-user shape
  changes.

## Out of scope — follow-up (separate, per-panel, reviewed individually)

Add "Show more"/pagination/internal-scroll to list-heavy panels
(`RepoProfileCards`, `ResumeFilesList`, `KbActivityFeed`, repo-bar lists) to cap
their heights. Predictable panel heights erase the residual ragged bottom and
keep the layout standard regardless of data volume. This changes panel internals
and is therefore handled one panel at a time, not in this container refactor.

## Verification

- `yarn typecheck && yarn lint && yarn test` all green.
- `yarn dev`, exercise the Knowledge Base dashboard at narrow / medium / wide
  widths, for:
  - a data-rich user and a near-empty user;
  - both the admin path (score + stats hero) and the non-admin path (activity +
    overview hero).
- Confirm: no horizontal scroll on narrow; no trailing empty tracks on wide; no
  stranded sidebar band when `profileSummary` is absent; reading order preserved.
