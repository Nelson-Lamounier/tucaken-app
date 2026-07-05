# Standardise the Knowledge Base dashboard on the user-panel layout

**Date:** 2026-07-05
**Branch:** `feat/standardise-dashboard-panels`
**Component:** `src/features/user-home/components/UserDashboard.tsx`

## Problem

The Knowledge Base dashboard ("Your AI agent's data health at a glance") renders
two structurally different layouts depending on `isAdmin`:

- **Admin top band:** `PanelGrid` with a large Resume-Readiness panel + KB Stats
  hero tiles. Admins do **not** see the Welcome greeting, Activity chart, or the
  Repo-breakdown / Career-data grid.
- **Regular user top band:** `PanelStack` with the Welcome greeting + Activity
  chart, plus the Repo-breakdown / Career-data grid in the main column.

This divergence makes the two experiences inconsistent and harder to maintain.

## Goal

Every user sees the **same** user-style layout. The **only** admin difference is
a single extra panel — a **compact Resume-Readiness** — placed in the first
panel row, beside the Activity chart.

## Design

### 1. Unified layout in `UserDashboard`

`isAdmin` collapses to controlling one thing: whether the compact
Resume-Readiness panel appears in the first row.

- **Top band** — always render `WelcomeSummary` (chrome-less greeting), then:
  - Regular user: full-width `ActivityPanel`.
  - Admin: `SplitLayout` with `main={<ActivityPanel />}` and
    `aside={<KbScorePanel compact />}` (aside width ~380px). Collapses to a
    single column below `xl` (1280px), same as the primitive's default.
- **Main-column grid** — remove the `!isAdmin` gate so the Repo-breakdown +
  Career-data `PanelGrid` shows for all users.
- **Shared, unchanged:** Profile Intelligence tabs, Repo profile cards, the
  sidebar rail (Overview / Files / Checklist / Feed), and Quick actions.

### 2. `KbScorePanel` — new `compact` prop

Add `compact?: boolean` (default `false`). When `compact`, render the gauge +
tier pill + tier label only, dropping the embedded `KbReadinessPanel` signal
breakdown. Loading / null-diagnostic states are unchanged.

`UserRagSection` (admin user drill-down) keeps calling the full, non-compact
version — unaffected.

### 3. Drop the KB Stats hero tiles

The hero tiles are admin-only and not part of the user layout, so standardising
removes them. This orphans four files, which are deleted:

- `src/features/user-home/components/KbStatsPanel.tsx`
- `src/features/user-home/components/StatTile.tsx`
- `src/features/user-home/lib/hero-tiles.ts`
- `src/__tests__/features/user-home/hero-tiles.test.ts`

The identically-named local `StatTile` inside
`src/components/kb/KnowledgeBaseHealthPanel.tsx` is a separate function and is
untouched.

## Net result

Admin view = regular-user view **plus** exactly one panel: the compact
Resume-Readiness beside Activity in row one.

## Verification

`yarn typecheck && yarn lint && yarn test`, then `yarn dev` — check the dashboard
as both an admin and a non-admin (light + dark), confirming the first row renders
correctly and collapses on narrow screens.
