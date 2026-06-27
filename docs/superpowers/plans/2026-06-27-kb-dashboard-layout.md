# KB Dashboard Layout — Standardised Auto-fit Reflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rigid grid tracks in the Knowledge Base dashboard with a single auto-fit layout primitive so panels reflow into correct positions and no white-space gaps appear for users with sparse data.

**Architecture:** A new pure-layout wrapper, `PanelFlow`, renders a CSS Grid using `repeat(auto-fit, minmax(min(100%, --panel-min), 1fr))` with `align-items: start`, plus an `@supports (grid-template-rows: masonry)` progressive-enhancement layer. `UserDashboard.tsx` wraps its three zones in `PanelFlow` instead of fixed `grid-cols-*` / `1fr_340px` tracks. No panel internals change.

**Tech Stack:** React 19, TanStack Start, Tailwind CSS v4 (`@theme` in `src/styles.css`, no `tailwind.config`), Vitest + `@testing-library/react` (happy-dom per file).

**Reference spec:** `docs/superpowers/specs/2026-06-27-kb-dashboard-layout-design.md`

## Global Constraints

- **Package manager: Yarn 4 only.** `yarn typecheck`, `yarn lint`, `yarn test` — never npm/npx.
- **Before "done": `yarn typecheck && yarn lint && yarn test` must all pass.**
- **No panel internals change.** Only `PanelFlow.tsx` (new), `styles.css`, and `UserDashboard.tsx` are touched.
- **No new runtime dependency.** No JS masonry library.
- **Prose/comments in English (UK), ASCII only.** No `Co-Authored-By` trailer in commits.
- **SonarQube rules:** no nested ternaries (`S3358`); guard clauses over nesting; no redundant casts (`S4325`) — but keep load-bearing casts the compiler needs; no `console.*` (use Pino if logging needed — not needed here); stable React keys; `Number.*` over globals.
- **ESLint complexity cap 10.** `PanelFlow` is trivial; keep it so.
- **Default corner radius `rounded-md`** — N/A here (no panel chrome added).
- **Spacing: `gap-6` (1.5rem)** between panels, matching the current dashboard.

---

## File Structure

- **Create** `src/features/user-home/components/PanelFlow.tsx` — the layout primitive. One responsibility: render an auto-fit grid container around its children, exposing a `min` column-width and `className` passthrough.
- **Modify** `src/styles.css` — append the `.panel-flow` class (+ `> *` min-width guard + `@supports` masonry block), following the existing `.marquee-anim` CSS-var convention.
- **Create** `src/__tests__/features/user-home/PanelFlow.test.tsx` — unit test for the primitive's contract (class, custom property, children passthrough).
- **Modify** `src/features/user-home/components/UserDashboard.tsx` — wrap the three zones in `PanelFlow` (Task 2: Zone 1; Task 3: Zone 2).

---

## Task 1: `PanelFlow` layout primitive

**Files:**
- Create: `src/features/user-home/components/PanelFlow.tsx`
- Modify: `src/styles.css` (append after line 138)
- Test: `src/__tests__/features/user-home/PanelFlow.test.tsx`

**Interfaces:**
- Produces: `PanelFlow({ children, min?: number, className?: string }): JSX.Element`.
  - Renders a single `<div className="panel-flow …">` whose inline style sets the
    `--panel-min` custom property to `` `${min}px` `` (default `min = 320`).
  - Later tasks consume `<PanelFlow min={300}>…</PanelFlow>` and `<PanelFlow min={340}>…</PanelFlow>`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/user-home/PanelFlow.test.tsx`:

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PanelFlow } from '@/features/user-home/components/PanelFlow'

describe('PanelFlow', () => {
  it('defaults --panel-min to 320px and applies the panel-flow class', () => {
    const { container } = render(
      <PanelFlow>
        <div>child a</div>
      </PanelFlow>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('panel-flow')
    expect(el.style.getPropertyValue('--panel-min')).toBe('320px')
    expect(container.textContent).toContain('child a')
  })

  it('applies a custom min, extra className, and renders all children', () => {
    const { container } = render(
      <PanelFlow min={340} className="mt-4">
        <div>child a</div>
        <span>child b</span>
      </PanelFlow>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.getPropertyValue('--panel-min')).toBe('340px')
    expect(el.className).toContain('panel-flow')
    expect(el.className).toContain('mt-4')
    expect(container.textContent).toContain('child a')
    expect(container.textContent).toContain('child b')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/__tests__/features/user-home/PanelFlow.test.tsx`
Expected: FAIL — cannot resolve module `@/features/user-home/components/PanelFlow`.

- [ ] **Step 3: Create the component**

Create `src/features/user-home/components/PanelFlow.tsx`:

```tsx
import type { ReactNode, CSSProperties } from 'react'

interface PanelFlowProps {
  readonly children: ReactNode
  /** Column min width in px; drives `minmax(min(100%, <min>), 1fr)`. */
  readonly min?: number
  readonly className?: string
}

/**
 * Auto-fit panel grid. Panels reflow to fill the row — `auto-fit` collapses
 * empty tracks so short/absent panels never strand a column — and native
 * masonry tightens vertical packing where supported (see `.panel-flow` in
 * styles.css). Pure layout: renders no panel chrome.
 */
export function PanelFlow({ children, min = 320, className }: PanelFlowProps) {
  // Cast is load-bearing: CSSProperties has no index signature for `--*` vars.
  const style = { '--panel-min': `${min}px` } as CSSProperties
  return (
    <div className={className ? `panel-flow ${className}` : 'panel-flow'} style={style}>
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Append the CSS**

Add to the end of `src/styles.css` (after line 138):

```css
/* Knowledge Base dashboard — auto-fit panel flow. Panels reflow to fill the row:
   auto-fit collapses empty tracks so an absent/short panel never strands a column,
   and min(100%, --panel-min) stops the track overflowing on narrow screens.
   Native masonry (CSS Grid Lanes) tightens vertical packing where supported —
   Safari today, Chromium/Firefox as they ship — as progressive enhancement, no JS. */
.panel-flow {
  display: grid;
  gap: 1.5rem; /* = gap-6 */
  align-items: start;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--panel-min, 320px)), 1fr));
}
.panel-flow > * {
  min-width: 0; /* let truncating children shrink instead of blowing out the track */
}
@supports (grid-template-rows: masonry) {
  .panel-flow {
    grid-template-rows: masonry;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/__tests__/features/user-home/PanelFlow.test.tsx`
Expected: PASS (2 tests). (CSS/`@supports` is not exercised by jsdom — verified manually in Task 3's dev pass.)

- [ ] **Step 6: Typecheck and lint**

Run: `yarn typecheck && yarn lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/user-home/components/PanelFlow.tsx src/styles.css src/__tests__/features/user-home/PanelFlow.test.tsx
git commit -m "feat(user-home): add PanelFlow auto-fit layout primitive

Auto-fit grid wrapper with min(100%, --panel-min) overflow guard,
items-start, and @supports masonry progressive enhancement. Pure layout,
no panel chrome. Basis for standardising the KB dashboard layout."
```

---

## Task 2: Apply `PanelFlow` to Zone 1 (overview hero band)

**Files:**
- Modify: `src/features/user-home/components/UserDashboard.tsx`

**Interfaces:**
- Consumes: `PanelFlow` from Task 1.

- [ ] **Step 1: Import `PanelFlow`**

In `src/features/user-home/components/UserDashboard.tsx`, add to the import block (after the `KbQuickActions` import, line 24):

```tsx
import { PanelFlow } from './PanelFlow'
```

- [ ] **Step 2: Replace the admin hero band**

Find (lines 63-67):

```tsx
        {isAdmin ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr] xl:items-stretch">
            <KbScorePanel diagnostic={profileSummary?.diagnostic ?? null} isLoading={isLoading} />
            <KbStatsPanel tiles={heroTiles} />
          </div>
        ) : (
```

Replace with:

```tsx
        {isAdmin ? (
          <PanelFlow min={300}>
            <KbScorePanel diagnostic={profileSummary?.diagnostic ?? null} isLoading={isLoading} />
            <KbStatsPanel tiles={heroTiles} />
          </PanelFlow>
        ) : (
```

- [ ] **Step 3: Replace the non-admin hero band**

Find (lines 68-81):

```tsx
        ) : (
          <div className="space-y-6">
            <ActivityPanel />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 md:items-start">
              <KbOverviewPanel stats={stats} />
              <RepoBreakdownPanel />
              <CareerDataBreakdown
                entries={entries}
                latestImport={latestImport}
                isLoading={loadingEntries || loadingImports}
              />
            </div>
          </div>
        )}
```

Replace with:

```tsx
        ) : (
          <div className="space-y-6">
            <ActivityPanel />
            <PanelFlow min={300}>
              <KbOverviewPanel stats={stats} />
              <RepoBreakdownPanel />
              <CareerDataBreakdown
                entries={entries}
                latestImport={latestImport}
                isLoading={loadingEntries || loadingImports}
              />
            </PanelFlow>
          </div>
        )}
```

- [ ] **Step 4: Typecheck, lint, test**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: no errors; PanelFlow tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/user-home/components/UserDashboard.tsx
git commit -m "refactor(user-home): flow KB hero band through PanelFlow

Replace fixed 360px/1fr (admin) and 2/3-col (non-admin) hero grids with
the auto-fit PanelFlow so the overview cards reflow uniformly and short
panels stop stranding tracks."
```

---

## Task 3: Flatten Zone 2 (main + sidebar) into one `PanelFlow`

**Files:**
- Modify: `src/features/user-home/components/UserDashboard.tsx`

**Interfaces:**
- Consumes: `PanelFlow` from Task 1.

This task drops the `1fr_340px` main/sidebar split — the biggest white-space
source — so all working panels join one auto-fit flow. When `profileSummary` is
absent, the remaining panels reflow to fill rather than leaving a stranded band.

- [ ] **Step 1: Replace the main + aside block**

Find (lines 83-125):

```tsx
        {/* Main column + health rail */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px] xl:items-start">
          <main className="flex min-w-0 flex-col gap-8">
            {profileSummary && (
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Profile Intelligence</h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    What your data says about you — expand any panel for the full read
                  </p>
                </div>
                <AnimatedTabs
                  items={[
                    {
                      id: 'mirror',
                      title: 'Profile mirror',
                      content: <MirrorPanel summary={profileSummary} />,
                    },
                    {
                      id: 'direction',
                      title: 'Career direction',
                      content: <DirectionPanel summary={profileSummary} />,
                    },
                    {
                      id: 'reconciliation',
                      title: 'Résumé reconciliation',
                      content: (
                        <ReconciliationPanel summary={profileSummary} hasResume={entries.length > 0} />
                      ),
                    },
                  ]}
                />
              </section>
            )}
            <RepoProfileCards repos={repos} isLoading={loadingRepos} />
          </main>

          <aside className="flex flex-col gap-6">
            <KbSetupChecklist stats={stats} />
            <ResumeFilesList imports={imports} isLoading={loadingImports} />
            <KbActivityFeed imports={imports} repos={repos} />
          </aside>
        </div>
```

Replace with:

```tsx
        {/* Working panels — one auto-fit flow so an absent panel reflows the rest
            instead of stranding a tall column for users with sparse data. */}
        <PanelFlow min={340}>
          {profileSummary && (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Profile Intelligence</h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  What your data says about you — expand any panel for the full read
                </p>
              </div>
              <AnimatedTabs
                items={[
                  {
                    id: 'mirror',
                    title: 'Profile mirror',
                    content: <MirrorPanel summary={profileSummary} />,
                  },
                  {
                    id: 'direction',
                    title: 'Career direction',
                    content: <DirectionPanel summary={profileSummary} />,
                  },
                  {
                    id: 'reconciliation',
                    title: 'Résumé reconciliation',
                    content: (
                      <ReconciliationPanel summary={profileSummary} hasResume={entries.length > 0} />
                    ),
                  },
                ]}
              />
            </section>
          )}
          <RepoProfileCards repos={repos} isLoading={loadingRepos} />
          <KbSetupChecklist stats={stats} />
          <ResumeFilesList imports={imports} isLoading={loadingImports} />
          <KbActivityFeed imports={imports} repos={repos} />
        </PanelFlow>
```

> Note: the `Résumé reconciliation` string is **existing internal tab copy** — leave it byte-for-byte as-is (do not "fix" the diacritic); the UK-English/ASCII rule applies to new prose only.

- [ ] **Step 2: Typecheck, lint, test**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: no errors; all tests pass.

- [ ] **Step 3: Manual dev verification (the important one)**

Run: `yarn dev` (port 5001) and open the Knowledge Base dashboard. Verify the
matrix:

- Narrow (~375px): single column, **no horizontal scroll**, panels stacked in
  priority order.
- Medium (~768px): panels wrap into 2 columns with no half-row holes.
- Wide (~1440px): overview cards fill the row (no trailing empty track); working
  panels flow with no stranded sidebar band.
- Non-admin user **without** `profileSummary`: Profile Intelligence is absent and
  the remaining working panels reflow to fill — no tall gap.
- Admin path: score + stats hero flows through `PanelFlow` cleanly.

If any panel looks too narrow now that the wide-reading column is gone, note it
for the per-panel follow-up (out of scope here) — do not alter panel internals
in this task.

- [ ] **Step 4: Commit**

```bash
git add src/features/user-home/components/UserDashboard.tsx
git commit -m "refactor(user-home): flatten KB working panels into one PanelFlow

Drop the 1fr/340px main+sidebar split so Profile Intelligence,
RepoProfileCards, and the rail panels share one auto-fit flow. Absent
panels reflow the rest instead of stranding a column — the dashboard
layout is now standard across all user data states."
```

---

## Task 4: Final verification and branch finish

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all green.

- [ ] **Step 2: Production build sanity (catches Tailwind/CSS issues the dev server may mask)**

Run: `yarn build`
Expected: build completes with no CSS/type errors.

- [ ] **Step 3: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to choose merge / PR /
cleanup. The branch is the worktree branch `worktree-refactor+knowledge-base-card`.

---

## Self-Review

**Spec coverage:**
- "PanelFlow auto-fit primitive (auto-fit, min(100%) guard, items-start)" → Task 1. ✓
- "@supports masonry progressive enhancement, no JS" → Task 1 Step 4 CSS. ✓
- "Zone 1 overview cards via PanelFlow min=300 (admin + non-admin)" → Task 2. ✓
- "Zone 2 flattened, drop 1fr/340 split, PanelFlow min=340" → Task 3. ✓
- "Zone 3 KbQuickActions unchanged" → not touched (correct; no task needed). ✓
- "No panel internals change" → Global Constraints + Task 3 Step 3 note. ✓
- "Verification: typecheck/lint/test + dev matrix (narrow/med/wide, rich/empty, admin/non-admin)" → Task 3 Step 3 + Task 4. ✓
- "Pagination/height-capping out of scope, per-panel follow-up" → noted as out of scope, not planned. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; exact paths and commands given. ✓

**Type consistency:** `PanelFlow({ children, min?, className? })` is defined in Task 1 and consumed verbatim (`min={300}`, `min={340}`, no `className` at call sites) in Tasks 2-3. `--panel-min` custom property name matches between component (`PanelFlow.tsx`) and CSS (`styles.css`). ✓
