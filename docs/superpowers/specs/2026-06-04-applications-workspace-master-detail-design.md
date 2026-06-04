# Applications Workspace — Master–Detail Redesign

**Date:** 2026-06-04
**Status:** Approved (design), pending implementation plan
**Area:** `src/features/applications/`

## Problem

Every stage workspace (Technical, System Design, Behavioural, Bar Raiser, Phone
Screen, Final) renders as a long vertical scroll of fully-expanded sections.
Each section is a flat list/grid of cards with all prose visible at once.

Weaknesses:

- Cognitive overload — no weighting between "core" and "reference"; everything
  is equal and everything is expanded.
- No detail-expansion pattern — cards show summaries but tapping does nothing;
  full evidence/project-refs/STAR breakdowns force long scrolling.
- Notes/Timeline live in a separate togglable side panel disconnected from the
  content the user is reading.
- Repetitive `space-y-8` + `.map()` card lists across all six workspaces.

## Goals

- Clear, scannable workflow that takes full advantage of the viewport width.
- 2026 data-review dashboard pattern: scan on the left, depth on demand on the
  right.
- Keep users engaged with subtle, consistent motion (no new motion vocabulary —
  reuse the existing `motion/react` + `layoutId` patterns).
- Add the "toggle full text from the right" interaction the resume editor
  established.
- Preserve the existing visual language, tokens, and dark-mode behaviour.

## Non-goals

- No change to data fetching, hooks, server functions, or stage lifecycle logic.
  Only the JSX presentation layer is reshaped.
- No new design tokens or arbitrary hex. Use the existing `@theme` palette.
- No rewrite of leaf widgets (`EvidenceIndicator`, `TradeoffBadge`, theme chips,
  `StoryForm`, modals) — they are reused as-is.

## Approach (approved)

**Master–detail with a unified right rail.** Build the pattern once at the
**shell** level so all six workspaces inherit it, then convert all six bodies in
the same pass.

### New shared primitives

```
src/features/applications/stages/components/workspace-shell/
  WorkspaceShell.tsx       # 2-col grid: left summary | right rail. Owns selection state + ?focus URL sync
  SummaryGroup.tsx         # collapsible group header ("Topics likely  [3]") + rows
  SummaryRow.tsx           # one scannable line: dot + label + EvidenceIndicator + chevron
  DetailRail.tsx           # right rail with tabs (Detail · Notes · Timeline), sticky, animated
  DetailRail.context.tsx   # selection context so workspaces register detail content without prop-drilling
```

### WorkspaceShell

- Replaces the bare `space-y-8` content column **and** the separately-placed
  `NotesAndTimelinePanel` in `ApplicationDetailContainer`.
- Renders a 2-column layout: left = `children` (the summary groups supplied by
  each workspace), right = `DetailRail`.
- Owns selection state `{ groupId, rowId }`, synced to a `?focus=` search param
  (mirrors the existing `?stage=` pattern) so refresh and browser back/forward
  restore the open detail.
- On `lg+` the rail is `lg:sticky lg:top-6`. Below `lg` the rail collapses into a
  bottom slide-up sheet.

### DetailRail

- Three tabs: **Detail · Notes · Timeline**.
- **Notes** and **Timeline** tabs absorb the existing `NotesAndTimelinePanel`
  JSX and behaviour verbatim (draft notes, derived activity timeline,
  localStorage open-state) — moved, not rewritten.
- **Detail** tab renders the currently selected row's detail node. When no row
  is selected it shows a quiet placeholder: "Select an item to see full prep."
- Tab indicator uses `layoutId="rail-tab"` (same shared-layout trick as
  `StageProgressBar`).

### DetailRail context

- A React context exposes the active selection and a setter.
- `SummaryRow` calls the setter on click (and sets `?focus=`), which switches the
  rail to the **Detail** tab and animates the new content in.
- Avoids prop-drilling detail nodes through every workspace.

### Workspace conversion pattern

Each workspace body changes from "sections of expanded cards" to "groups of
summary rows, each carrying its detail node":

```tsx
<WorkspaceShell detail={detail} activeStage={stage}>
  <SummaryGroup id="topics" title="Topics likely to come up" count={topics.length}>
    {topics.map(t => (
      <SummaryRow
        key={t.id}
        id={t.id}
        label={t.title}
        indicator={<EvidenceIndicator strength={t.strength} />}
        detail={<TopicDetail topic={t} />}   // full text/evidence/project-refs, rendered in the rail
      />
    ))}
  </SummaryGroup>
  {/* further groups: DSA, project sheet, devops, practice links… */}
</WorkspaceShell>
```

Heavy content that currently lives inline (EvidenceCard body, STAR breakdown,
offer form, framework steps) moves into `*Detail` render components shown in the
rail. Stable React keys use row/DB ids, never array index.

### Per-workspace group mapping

- **Technical** — Topics · DSA/Coding · Project reference · Prep checklist ·
  Difficult questions · DevOps/Infra · Practice links.
- **System Design** — Schedule/format · Question patterns · Your system tours ·
  Framework (rail detail).
- **Behavioural** — Schedule · Story bank (rows, filter chips retained) ·
  Typical questions (row → best-match story in rail).
- **Bar Raiser** — Schedule · Values matrix (rows) · Uncovered principles ·
  selected principle stories in rail.
- **Phone Screen** — Schedule · Career arc · What to expect · Talking points ·
  Questions to ask.
- **Final** — Offer (rail detail form) · Market context · Negotiation leverage ·
  Suggested counter · Decision factors.

Checklist/inline-edit affordances (ScheduleCard editing, checklist ticks,
story add/edit/delete, offer fields) remain functional — surfaced in the rail
detail or kept as left-column controls where they are primary actions.

## Motion

- Rail tab indicator: `layoutId="rail-tab"` pill.
- Detail content swap: `AnimatePresence` fade + `y: 8 → 0`, ~0.2s, ease
  `[0.22, 1, 0.36, 1]`, wrapped in `MotionConfig`.
- `SummaryGroup` collapse: animated height/opacity.
- Selected `SummaryRow`: left accent bar + `bg-accent/8`, no layout shift.
- `willChange` limited to `transform` / `opacity`. No `MotionValue` reads during
  render.

## Responsive & states

- **Desktop (lg+):** side-by-side, rail sticky.
- **Mobile:** rail becomes a bottom slide-up sheet (Headless UI `Dialog`, reuse
  `DashboardDrawer` mechanics) opened on row tap; summary list full-width.
- **Empty detail:** rail defaults to Detail tab with placeholder; Notes/Timeline
  always reachable.
- **Loading:** `StageWorkspaceSkeleton` updated to the 2-column silhouette.

## Tokens & accessibility

- Only existing `@theme` tokens (`accent`, `zinc`, `emerald`/`amber`/`rose`,
  radii). No arbitrary hex outside the theme block. Every surface has a
  dark-mode pair.
- Rail tabs = `role="tablist"` / `role="tab"` with `aria-selected`.
- `SummaryRow` = `button` with `aria-expanded` / `aria-controls` pointing at the
  rail detail region. Full keyboard navigation.

## SonarQube compliance

- No nested ternaries — split JSX branches or extract render helpers.
- `Set`-based allow-lists with `.has()` for any membership checks.
- Stable keys from row/DB ids, never index.
- No redundant casts / non-null assertions; narrow via guards.
- No `console.*` — Pino logger if logging is needed.

## Scope of change

- **New:** 5 files under `stages/components/workspace-shell/`.
- **Refactor:** `ApplicationDetailContainer` (swap content column + panel for
  `WorkspaceShell`).
- **Rewrite (JSX only):** all 6 workspace bodies.
- **Fold:** `NotesAndTimelinePanel` content into `DetailRail` tabs.
- **Update:** `StageWorkspaceSkeleton` to the 2-column silhouette.
- Hooks, server fns, types, and stage lifecycle logic untouched.

## Verification

- `yarn typecheck && yarn lint && yarn test` green.
- `yarn dev`: exercise each stage — scan left, open a row, switch rail tabs, add
  a note, resize to mobile (sheet), reload (focus restored), dark mode.
