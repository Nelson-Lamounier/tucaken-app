# Applications Workspace Master–Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all six stage workspaces from long vertical scrolls into a master–detail layout — a scannable left summary column plus a unified right rail (Detail · Notes · Timeline) — built once at the shell level.

**Architecture:** A new `WorkspaceShell` owns a 2-column grid and a selection context. Workspaces emit `SummaryGroup` → `SummaryRow` rows; each row carries a `detail` React node. Clicking a row publishes it to the `DetailRail`, which switches to its Detail tab and animates the node in. Notes and Timeline (lifted from the existing `NotesAndTimelinePanel`) become the rail's other two tabs. Selection mirrors to a `?focus=` search param. Hooks, server fns, and types are untouched — only the JSX presentation layer is reshaped.

**Tech Stack:** React 19, TanStack Router (file routes, `validateSearch`), `motion/react` (`layoutId`, `AnimatePresence`, `MotionConfig`), Tailwind v4 `@theme` tokens, Headless UI `Dialog` (mobile sheet), Vitest + `@testing-library/react` (happy-dom).

---

## Conventions for this plan

- **Test location:** Vitest only picks up `src/__tests__/**/*.test.ts(x)` (see `vitest.config.ts`). All new tests go under `src/__tests__/features/applications/`.
- **Component-test header:** every test file starts with `/** @vitest-environment happy-dom */` (default env is `node`).
- **Assertions:** this repo has **no** `jest-dom` matchers. Use `screen.getByText(...)` / `.toBeTruthy()` / `container.querySelectorAll(...).length`, and `@testing-library/user-event` for clicks. Do **not** use `.toBeInTheDocument()`.
- **Run a single test file:** `yarn test src/__tests__/features/applications/<file>` (Vitest matches by path substring).
- **SonarQube:** no nested ternaries (split JSX / extract helpers), `Set` allow-lists with `.has()`, stable keys from row ids, no `as any`, no `console.*`.
- **Commit style:** Conventional Commits, **no** `Co-Authored-By` trailer (repo rule).
- All new shared files live in `src/features/applications/stages/components/workspace-shell/`.

---

## File Structure

**Create:**
- `src/features/applications/stages/components/workspace-shell/selection.ts` — selection types + context + `useDetailRail` hook.
- `src/features/applications/stages/components/workspace-shell/SummaryRow.tsx` — one scannable row.
- `src/features/applications/stages/components/workspace-shell/SummaryGroup.tsx` — collapsible group of rows.
- `src/features/applications/stages/components/workspace-shell/rail-tabs/NotesTab.tsx` — notes UI lifted from `NotesAndTimelinePanel`.
- `src/features/applications/stages/components/workspace-shell/rail-tabs/TimelineTab.tsx` — timeline UI lifted from `NotesAndTimelinePanel`.
- `src/features/applications/stages/components/workspace-shell/DetailRail.tsx` — tabbed right rail (Detail · Notes · Timeline) + mobile sheet.
- `src/features/applications/stages/components/workspace-shell/WorkspaceShell.tsx` — 2-col layout + provider.
- `src/features/applications/stages/components/workspace-shell/index.ts` — barrel re-export.
- Tests under `src/__tests__/features/applications/workspace-shell/`.

**Modify:**
- `src/app/_dashboard/applications/$slug.tsx` — add `focus` search param.
- `src/features/applications/components/ApplicationDetailContainer.tsx` — render `WorkspaceShell`, wire `focus` ↔ router, drop the standalone `NotesAndTimelinePanel` placement.
- All six workspaces under `src/features/applications/stages/workspaces/`.
- `src/features/applications/stages/components/StageWorkspaceSkeleton.tsx` — 2-column silhouette.

**Delete (after Task 4 lifts its content):**
- `src/features/applications/stages/components/NotesAndTimelinePanel.tsx` — only once no import remains (`rg "NotesAndTimelinePanel" src/` is empty). Verified in Task 14.

---

## Task 1: Route — add `focus` search param

**Files:**
- Modify: `src/app/_dashboard/applications/$slug.tsx:6-23`

- [ ] **Step 1: Add `focus` to the search schema and thread it to the container**

Replace the schema and route component in `$slug.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ApplicationDetailContainer } from '@/features/applications/components/ApplicationDetailContainer'
import { STAGE_ORDER } from '@/features/applications/stages/types/stage'

const stageSearchSchema = z.object({
  /** Active Stage. Omitted → shell falls back to the application's Current Stage. */
  stage: z.enum(STAGE_ORDER).optional(),
  /** Selected summary-row id within the active workspace (master–detail focus). */
  focus: z.string().optional(),
})

export const Route = createFileRoute('/_dashboard/applications/$slug')({
  validateSearch: stageSearchSchema,
  component: ApplicationDetailRoute,
})

function ApplicationDetailRoute() {
  const { slug } = Route.useParams()
  const { stage, focus } = Route.useSearch()

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <ApplicationDetailContainer slug={slug} activeStage={stage} focus={focus} />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `yarn typecheck`
Expected: PASS. (`ApplicationDetailContainer` gets the new `focus` prop in Task 7; until then TS will flag an unknown prop — if you run tasks in order, do Step 2 of this task after Task 7. To keep this task self-contained, you may temporarily mark `focus` optional in the container now via Task 7. Recommended: run Tasks 1 and 7 back-to-back, commit together.)

- [ ] **Step 3: Commit**

```bash
git add src/app/_dashboard/applications/\$slug.tsx
git commit -m "feat(applications): add focus search param for master-detail selection"
```

---

## Task 2: Selection context (`selection.ts`)

**Files:**
- Create: `src/features/applications/stages/components/workspace-shell/selection.ts`
- Test: `src/__tests__/features/applications/workspace-shell/selection.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  DetailRailProvider,
  useDetailRail,
} from '@/features/applications/stages/components/workspace-shell/selection'

function wrapper({ children }: { children: ReactNode }) {
  return <DetailRailProvider initialFocus={undefined}>{children}</DetailRailProvider>
}

describe('useDetailRail', () => {
  it('defaults to the detail tab with no selection', () => {
    const { result } = renderHook(() => useDetailRail(), { wrapper })
    expect(result.current.tab).toBe('detail')
    expect(result.current.selected).toBeNull()
  })

  it('selecting a row stores it and forces the detail tab', () => {
    const { result } = renderHook(() => useDetailRail(), { wrapper })
    act(() => result.current.setTab('notes'))
    expect(result.current.tab).toBe('notes')
    act(() =>
      result.current.select({ id: 'caching', label: 'Caching', node: <p>Full text</p> }),
    )
    expect(result.current.tab).toBe('detail')
    expect(result.current.selected?.id).toBe('caching')
  })

  it('honours initialFocus by exposing it as the pending focus id', () => {
    function fwrapper({ children }: { children: ReactNode }) {
      return <DetailRailProvider initialFocus="sharding">{children}</DetailRailProvider>
    }
    const { result } = renderHook(() => useDetailRail(), { wrapper: fwrapper })
    expect(result.current.pendingFocus).toBe('sharding')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/workspace-shell/selection.test.tsx`
Expected: FAIL — module `selection` not found.

- [ ] **Step 3: Implement `selection.ts`**

```tsx
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type RailTab = 'detail' | 'notes' | 'timeline'

export interface RailSelection {
  /** Stable row id — matches the `?focus` param and the SummaryRow id. */
  readonly id: string
  /** Short label shown in the Detail tab header. */
  readonly label: string
  /** Full-text detail node rendered in the rail. */
  readonly node: ReactNode
}

export interface DetailRailValue {
  readonly tab: RailTab
  readonly selected: RailSelection | null
  /** Focus id read from the URL on first paint, consumed by SummaryRow auto-select. */
  readonly pendingFocus: string | undefined
  readonly setTab: (tab: RailTab) => void
  readonly select: (selection: RailSelection) => void
  readonly clear: () => void
}

const DetailRailContext = createContext<DetailRailValue | null>(null)

interface DetailRailProviderProps {
  readonly initialFocus: string | undefined
  /** Called whenever the selected row id changes (incl. null on clear). */
  readonly onFocusChange?: (id: string | null) => void
  readonly children: ReactNode
}

export function DetailRailProvider({
  initialFocus,
  onFocusChange,
  children,
}: DetailRailProviderProps) {
  const [tab, setTab] = useState<RailTab>('detail')
  const [selected, setSelected] = useState<RailSelection | null>(null)

  const select = useCallback(
    (selection: RailSelection) => {
      setSelected(selection)
      setTab('detail')
      onFocusChange?.(selection.id)
    },
    [onFocusChange],
  )

  const clear = useCallback(() => {
    setSelected(null)
    onFocusChange?.(null)
  }, [onFocusChange])

  const value = useMemo<DetailRailValue>(
    () => ({ tab, selected, pendingFocus: initialFocus, setTab, select, clear }),
    [tab, selected, initialFocus, select, clear],
  )

  return <DetailRailContext.Provider value={value}>{children}</DetailRailContext.Provider>
}

export function useDetailRail(): DetailRailValue {
  const ctx = useContext(DetailRailContext)
  if (!ctx) throw new Error('useDetailRail must be used within a DetailRailProvider')
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/applications/workspace-shell/selection.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/stages/components/workspace-shell/selection.ts src/__tests__/features/applications/workspace-shell/selection.test.tsx
git commit -m "feat(applications): detail-rail selection context"
```

---

## Task 3: SummaryRow + SummaryGroup

**Files:**
- Create: `src/features/applications/stages/components/workspace-shell/SummaryRow.tsx`
- Create: `src/features/applications/stages/components/workspace-shell/SummaryGroup.tsx`
- Test: `src/__tests__/features/applications/workspace-shell/summary.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DetailRailProvider, useDetailRail } from '@/features/applications/stages/components/workspace-shell/selection'
import { SummaryGroup } from '@/features/applications/stages/components/workspace-shell/SummaryGroup'
import { SummaryRow } from '@/features/applications/stages/components/workspace-shell/SummaryRow'

function Probe() {
  const { selected, tab } = useDetailRail()
  return <output data-testid="probe">{tab}:{selected?.id ?? 'none'}</output>
}

function Fixture() {
  return (
    <DetailRailProvider initialFocus={undefined}>
      <SummaryGroup id="topics" title="Topics likely to come up" count={2}>
        <SummaryRow id="caching" label="Caching" detail={<p>Caching full text</p>} />
        <SummaryRow id="sharding" label="Sharding" detail={<p>Sharding full text</p>} />
      </SummaryGroup>
      <Probe />
    </DetailRailProvider>
  )
}

describe('SummaryGroup / SummaryRow', () => {
  it('renders the group title, count and rows', () => {
    render(<Fixture />)
    expect(screen.getByText('Topics likely to come up')).toBeTruthy()
    expect(screen.getByText('Caching')).toBeTruthy()
    expect(screen.getByText('Sharding')).toBeTruthy()
  })

  it('clicking a row selects it in the rail context', async () => {
    const user = userEvent.setup()
    render(<Fixture />)
    await user.click(screen.getByRole('button', { name: /Caching/ }))
    expect(screen.getByTestId('probe').textContent).toBe('detail:caching')
  })

  it('collapsing a group hides its rows', async () => {
    const user = userEvent.setup()
    render(<Fixture />)
    await user.click(screen.getByRole('button', { name: /Topics likely to come up/ }))
    expect(screen.queryByText('Caching')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/workspace-shell/summary.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `SummaryRow.tsx`**

```tsx
'use client'

import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDetailRail } from './selection'

interface SummaryRowProps {
  readonly id: string
  readonly label: string
  /** Full-text content shown in the rail's Detail tab when this row is active. */
  readonly detail: ReactNode
  /** Optional strength/priority indicator (e.g. <EvidenceIndicator/>). */
  readonly indicator?: ReactNode
  /** Optional one-line preview under the label. */
  readonly preview?: string
}

/** One scannable line in a SummaryGroup. Click → publishes `detail` to the rail. */
export function SummaryRow({ id, label, detail, indicator, preview }: SummaryRowProps) {
  const { selected, select } = useDetailRail()
  const isActive = selected?.id === id

  return (
    <button
      type="button"
      onClick={() => select({ id, label, node: detail })}
      aria-expanded={isActive}
      aria-controls="detail-rail-panel"
      className={[
        'group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        isActive
          ? 'border-accent/40 bg-accent/8'
          : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-white/2 dark:hover:bg-white/5',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'h-8 w-0.5 shrink-0 rounded-full transition-colors',
          isActive ? 'bg-accent' : 'bg-transparent',
        ].join(' ')}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {label}
        </span>
        {preview && (
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{preview}</span>
        )}
      </span>
      {indicator}
      <ChevronRight className="size-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  )
}
```

- [ ] **Step 4: Implement `SummaryGroup.tsx`**

```tsx
'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

interface SummaryGroupProps {
  readonly id: string
  readonly title: string
  readonly count?: number
  readonly subtitle?: string
  readonly children: ReactNode
  readonly defaultOpen?: boolean
}

/** Collapsible labelled group of SummaryRows. */
export function SummaryGroup({
  id,
  title,
  count,
  subtitle,
  children,
  defaultOpen = true,
}: SummaryGroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  const regionId = `summary-group-${id}`

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex w-full items-center gap-2 text-left"
      >
        <ChevronDown
          className={`size-4 shrink-0 text-zinc-400 transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden
        />
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
        {typeof count === 'number' && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
            {count}
          </span>
        )}
      </button>
      {subtitle && <p className="pl-6 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={regionId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden', willChange: 'opacity' }}
            className="space-y-2 pl-6"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/applications/workspace-shell/summary.test.tsx`
Expected: PASS (3 tests). Note: `AnimatePresence` exit is async; the collapse assertion waits via `queryByText` returning null after the click resolves — if flaky, wrap the assertion in `await screen.find... ` is not needed because userEvent awaits the state flush. If exit animation keeps the node briefly, change the test to assert `getByText('Caching')` has `closest('[id^=summary-group]')` with `height` style; prefer the simpler `queryByText` null check first.

- [ ] **Step 6: Commit**

```bash
git add src/features/applications/stages/components/workspace-shell/SummaryRow.tsx src/features/applications/stages/components/workspace-shell/SummaryGroup.tsx src/__tests__/features/applications/workspace-shell/summary.test.tsx
git commit -m "feat(applications): SummaryGroup and SummaryRow primitives"
```

---

## Task 4: Lift Notes + Timeline into rail tabs

Move the **exact** logic from `NotesAndTimelinePanel.tsx` into two focused tab components. No behaviour change — same `useStageDraft`, same `deriveTimeline`, same `readAllNotes`, same localStorage keys.

**Files:**
- Create: `src/features/applications/stages/components/workspace-shell/rail-tabs/TimelineTab.tsx`
- Create: `src/features/applications/stages/components/workspace-shell/rail-tabs/NotesTab.tsx`
- Test: `src/__tests__/features/applications/workspace-shell/rail-tabs.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TimelineTab } from '@/features/applications/stages/components/workspace-shell/rail-tabs/TimelineTab'
import { NotesTab } from '@/features/applications/stages/components/workspace-shell/rail-tabs/NotesTab'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = {
  slug: 'acme-swe',
  targetCompany: 'Acme',
  targetRole: 'SWE',
  status: 'analysing',
  interviewStage: 'technical',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
} as unknown as ApplicationDetail

beforeEach(() => window.localStorage.clear())

describe('rail tabs', () => {
  it('TimelineTab renders the derived events', () => {
    render(<TimelineTab detail={detail} />)
    expect(screen.getByText('Application created')).toBeTruthy()
  })

  it('NotesTab renders the active-stage quick-add label', () => {
    render(<NotesTab detail={detail} activeStage="technical" />)
    expect(screen.getByText(/Note for/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/workspace-shell/rail-tabs.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `TimelineTab.tsx`** (timeline half of the old panel)

```tsx
'use client'

import { useMemo } from 'react'
import { Clock, GraduationCap, FileText } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { formatRelativeTime } from '@/features/projects/lib/format'
import { STAGE_LABELS } from '../../../components/ApplicationTypes'

interface TimelineEvent {
  readonly id: string
  readonly label: string
  readonly at: string
  readonly Icon: typeof Clock
}

function deriveTimeline(detail: ApplicationDetail): readonly TimelineEvent[] {
  return [
    { id: 'applied', label: 'Application created', at: detail.createdAt, Icon: FileText },
    {
      id: 'stage',
      label: `Current stage: ${STAGE_LABELS[detail.interviewStage]}`,
      at: detail.updatedAt,
      Icon: GraduationCap,
    },
  ]
}

interface TimelineTabProps {
  readonly detail: ApplicationDetail
}

export function TimelineTab({ detail }: TimelineTabProps) {
  const timeline = useMemo(() => deriveTimeline(detail), [detail])
  const now = new Date()
  return (
    <ol className="space-y-3">
      {timeline.map(event => {
        const { Icon } = event
        return (
          <li key={event.id} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{event.label}</p>
              <p className="text-[10px] text-zinc-500">{formatRelativeTime(event.at, now)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
```

- [ ] **Step 4: Implement `NotesTab.tsx`** (notes half of the old panel)

```tsx
'use client'

import { useMemo } from 'react'
import type { ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { STAGE_LABELS } from '../../../components/ApplicationTypes'
import { STAGE_ORDER } from '../../../types/stage'
import { useStageDraft } from '../../../hooks/useStageDraft'

/** Read every stage's saved notes straight from localStorage for the aggregate. */
function readAllNotes(slug: string): readonly { stage: InterviewStage; notes: string }[] {
  if (typeof window === 'undefined') return []
  const out: { stage: InterviewStage; notes: string }[] = []
  for (const stage of STAGE_ORDER) {
    const raw = window.localStorage.getItem(`appstage:${slug}:${stage}`)
    if (!raw) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) {
        const notes = (parsed as { notes?: unknown }).notes
        if (typeof notes === 'string' && notes.trim()) out.push({ stage, notes })
      }
    } catch {
      // skip malformed entry
    }
  }
  return out
}

interface NotesTabProps {
  readonly detail: ApplicationDetail
  readonly activeStage: InterviewStage
}

export function NotesTab({ detail, activeStage }: NotesTabProps) {
  const { draft, setNotes } = useStageDraft(detail.slug, activeStage)
  const allNotes = useMemo(() => readAllNotes(detail.slug), [detail.slug, draft.notes])

  return (
    <div className="space-y-4">
      {allNotes.length > 0 && (
        <div className="space-y-2">
          {allNotes.map(n => (
            <div key={n.stage}>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{STAGE_LABELS[n.stage]}</p>
              <p className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">{n.notes}</p>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-zinc-200 pt-4 dark:border-white/10">
        <label htmlFor="quick-note" className="mb-1.5 block text-[11px] font-medium text-zinc-500">
          Note for {STAGE_LABELS[activeStage]}
        </label>
        <textarea
          id="quick-note"
          value={draft.notes}
          onChange={e => setNotes(e.target.value)}
          rows={5}
          placeholder="Auto-saves as you type…"
          className="block w-full rounded-md border-0 bg-zinc-50 p-2 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/applications/workspace-shell/rail-tabs.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/applications/stages/components/workspace-shell/rail-tabs/ src/__tests__/features/applications/workspace-shell/rail-tabs.test.tsx
git commit -m "feat(applications): lift notes and timeline into rail tabs"
```

---

## Task 5: DetailRail (tabbed right rail)

**Files:**
- Create: `src/features/applications/stages/components/workspace-shell/DetailRail.tsx`
- Test: `src/__tests__/features/applications/workspace-shell/detail-rail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DetailRailProvider, useDetailRail } from '@/features/applications/stages/components/workspace-shell/selection'
import { DetailRail } from '@/features/applications/stages/components/workspace-shell/DetailRail'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = {
  slug: 'acme-swe', targetCompany: 'Acme', targetRole: 'SWE', status: 'analysing',
  interviewStage: 'technical', createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-02T10:00:00.000Z',
} as unknown as ApplicationDetail

function Selector() {
  const { select } = useDetailRail()
  return <button type="button" onClick={() => select({ id: 'x', label: 'Caching', node: <p>Caching body</p> })}>pick</button>
}

beforeEach(() => window.localStorage.clear())

describe('DetailRail', () => {
  it('shows the empty placeholder when nothing is selected', () => {
    render(
      <DetailRailProvider initialFocus={undefined}>
        <DetailRail detail={detail} activeStage="technical" />
      </DetailRailProvider>,
    )
    expect(screen.getByText(/Select an item/i)).toBeTruthy()
  })

  it('renders selected detail and switches tabs', async () => {
    const user = userEvent.setup()
    render(
      <DetailRailProvider initialFocus={undefined}>
        <Selector />
        <DetailRail detail={detail} activeStage="technical" />
      </DetailRailProvider>,
    )
    await user.click(screen.getByText('pick'))
    expect(screen.getByText('Caching body')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Timeline' }))
    expect(screen.getByText('Application created')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/workspace-shell/detail-rail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DetailRail.tsx`**

```tsx
'use client'

import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import type { InterviewStage, ApplicationDetail } from '@/lib/types/applications.types'
import { useDetailRail, type RailTab } from './selection'
import { NotesTab } from './rail-tabs/NotesTab'
import { TimelineTab } from './rail-tabs/TimelineTab'

const TABS: readonly { id: RailTab; label: string }[] = [
  { id: 'detail', label: 'Detail' },
  { id: 'notes', label: 'Notes' },
  { id: 'timeline', label: 'Timeline' },
]

interface DetailRailProps {
  readonly detail: ApplicationDetail
  readonly activeStage: InterviewStage
}

function DetailPane({ detail, activeStage }: DetailRailProps) {
  const { tab, selected } = useDetailRail()
  if (tab === 'notes') return <NotesTab detail={detail} activeStage={activeStage} />
  if (tab === 'timeline') return <TimelineTab detail={detail} />
  if (!selected) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Select an item on the left to see its full prep here.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selected.label}</h3>
      <div className="text-sm text-zinc-600 dark:text-zinc-400">{selected.node}</div>
    </div>
  )
}

/** Unified right rail: Detail · Notes · Timeline. */
export function DetailRail({ detail, activeStage }: DetailRailProps) {
  const { tab, setTab } = useDetailRail()
  return (
    <MotionConfig transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      <aside
        id="detail-rail-panel"
        className="flex w-full flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/2 lg:w-96"
      >
        <div role="tablist" aria-label="Detail rail" className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-white/5">
          {TABS.map(t => {
            const isActive = t.id === tab
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                className={`relative flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="rail-tab"
                    className="absolute inset-0 rounded-md bg-white shadow-sm dark:bg-white/10"
                    style={{ willChange: 'transform' }}
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            )
          })}
        </div>
        <div className="min-h-40">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab === 'detail' ? `detail` : tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{ willChange: 'opacity' }}
            >
              <DetailPane detail={detail} activeStage={activeStage} />
            </motion.div>
          </AnimatePresence>
        </div>
      </aside>
    </MotionConfig>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/__tests__/features/applications/workspace-shell/detail-rail.test.tsx`
Expected: PASS (2 tests). If `AnimatePresence mode="wait"` defers the new node, the `findByText` variant resolves it — switch `getByText('Application created')` to `await screen.findByText('Application created')` if needed.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/stages/components/workspace-shell/DetailRail.tsx src/__tests__/features/applications/workspace-shell/detail-rail.test.tsx
git commit -m "feat(applications): tabbed DetailRail with motion tab indicator"
```

---

## Task 6: WorkspaceShell + barrel

**Files:**
- Create: `src/features/applications/stages/components/workspace-shell/WorkspaceShell.tsx`
- Create: `src/features/applications/stages/components/workspace-shell/index.ts`
- Test: `src/__tests__/features/applications/workspace-shell/workspace-shell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkspaceShell, SummaryGroup, SummaryRow } from '@/features/applications/stages/components/workspace-shell'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = {
  slug: 'acme-swe', targetCompany: 'Acme', targetRole: 'SWE', status: 'analysing',
  interviewStage: 'technical', createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-02T10:00:00.000Z',
} as unknown as ApplicationDetail

beforeEach(() => window.localStorage.clear())

describe('WorkspaceShell', () => {
  it('renders summary children beside the rail and wires selection end-to-end', async () => {
    const user = userEvent.setup()
    render(
      <WorkspaceShell detail={detail} activeStage="technical">
        <SummaryGroup id="topics" title="Topics" count={1}>
          <SummaryRow id="caching" label="Caching" detail={<p>Caching body</p>} />
        </SummaryGroup>
      </WorkspaceShell>,
    )
    expect(screen.getByText('Topics')).toBeTruthy()
    expect(screen.getByText(/Select an item/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Caching/ }))
    expect(screen.getByText('Caching body')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/__tests__/features/applications/workspace-shell/workspace-shell.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `WorkspaceShell.tsx`**

```tsx
'use client'

import type { ReactNode } from 'react'
import type { ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { DetailRailProvider } from './selection'
import { DetailRail } from './DetailRail'

interface WorkspaceShellProps {
  readonly detail: ApplicationDetail
  readonly activeStage: InterviewStage
  /** Initial selected row id from the `?focus` param. */
  readonly focus?: string
  /** Mirror selection back to the URL. */
  readonly onFocusChange?: (id: string | null) => void
  /** Summary groups for the active workspace. */
  readonly children: ReactNode
}

/**
 * Master–detail layout for a stage workspace: a scannable left summary column
 * and a sticky, tabbed right rail (Detail · Notes · Timeline).
 * See docs/superpowers/specs/2026-06-04-applications-workspace-master-detail-design.md
 */
export function WorkspaceShell({ detail, activeStage, focus, onFocusChange, children }: WorkspaceShellProps) {
  return (
    <DetailRailProvider initialFocus={focus} onFocusChange={onFocusChange}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-6">{children}</div>
        <div className="w-full lg:sticky lg:top-6 lg:w-auto">
          <DetailRail detail={detail} activeStage={activeStage} />
        </div>
      </div>
    </DetailRailProvider>
  )
}
```

- [ ] **Step 4: Implement `index.ts`**

```ts
export { WorkspaceShell } from './WorkspaceShell'
export { SummaryGroup } from './SummaryGroup'
export { SummaryRow } from './SummaryRow'
export { useDetailRail } from './selection'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test src/__tests__/features/applications/workspace-shell/workspace-shell.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/features/applications/stages/components/workspace-shell/WorkspaceShell.tsx src/features/applications/stages/components/workspace-shell/index.ts src/__tests__/features/applications/workspace-shell/workspace-shell.test.tsx
git commit -m "feat(applications): WorkspaceShell master-detail layout"
```

---

## Task 7: Wire ApplicationDetailContainer to the shell

Render `WorkspaceShell` (with router-bound `focus`) instead of the flex row + standalone `NotesAndTimelinePanel`. The workspace node becomes the shell's children. Until each workspace is converted (Tasks 8–13) it still renders its old `space-y-8` body — that is fine; it sits in the left column and the rail shows Notes/Timeline. Mobile sheet behaviour is handled inside `DetailRail` styling.

**Files:**
- Modify: `src/features/applications/components/ApplicationDetailContainer.tsx` (imports `:17-21`, signature `:56-63`, body `:257-292`)

- [ ] **Step 1: Add the `focus` prop and a focus-change handler**

In `ApplicationDetailContainer.tsx`, update the imports — remove `NotesAndTimelinePanel`, add the shell:

```tsx
// remove: import { NotesAndTimelinePanel } from '../stages/components/NotesAndTimelinePanel'
import { WorkspaceShell } from '../stages/components/workspace-shell'
```

Update the props interface:

```tsx
interface ApplicationDetailContainerProps {
  readonly slug: string
  readonly activeStage?: InterviewStage
  /** Selected summary-row id from the `?focus` search param. */
  readonly focus?: string
}

export function ApplicationDetailContainer({ slug, activeStage, focus }: ApplicationDetailContainerProps) {
```

Add a focus-change handler next to `handleStageSelect`:

```tsx
const handleFocusChange = useCallback(
  (id: string | null) => {
    void navigate({
      to: '/applications/$slug',
      params: { slug },
      search: prev => ({ ...prev, focus: id ?? undefined }),
    })
  },
  [slug, navigate],
)
```

- [ ] **Step 2: Replace the workspace + panel block**

Replace the `{/* Active stage workspace + persistent notes/timeline panel */}` block (lines ~257–292) with:

```tsx
{/* Active stage workspace — master–detail shell (left summary + right rail) */}
<div className="mt-8">
  <WorkspaceShell
    detail={detail}
    activeStage={resolvedStage}
    focus={focus}
    onFocusChange={handleFocusChange}
  >
    {resolvedStage === 'applied' ? (
      stageWorkspaceNode('applied', detail)
    ) : (
      <StagePrepGate
        stage={resolvedStage}
        state={detail.stages?.[resolvedStage]}
        stageLabel={STAGE_LABELS[resolvedStage]}
        onSchedule={() => handleSchedule(resolvedStage)}
        onAdvance={() => handleAdvance(resolvedStage, detail.status)}
        onGenerate={() => handleGeneratePrep(resolvedStage, true)}
      >
        {stageWorkspaceNode(resolvedStage, detail)}
      </StagePrepGate>
    )}

    {stageIndex(resolvedStage) < STAGE_ORDER.length - 1 && (
      <div className="flex justify-end border-t border-zinc-200 pt-6 dark:border-white/10">
        <Button
          variant="primary"
          disabled={statusMutation.isPending}
          onClick={() => handleAdvance(resolvedStage, detail.status)}
        >
          Mark complete and advance
        </Button>
      </div>
    )}
  </WorkspaceShell>
</div>
```

- [ ] **Step 3: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: PASS. `NotesAndTimelinePanel` is now unused but still on disk (deleted in Task 14) — ensure no remaining import references it: `rg "NotesAndTimelinePanel" src/features/applications/components`.

- [ ] **Step 4: Smoke test the route in the browser**

Run: `yarn dev`, open an application detail page. Expected: left column shows the current workspace; right rail shows Detail (placeholder) · Notes · Timeline tabs; adding a note still persists.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/components/ApplicationDetailContainer.tsx src/app/_dashboard/applications/\$slug.tsx
git commit -m "feat(applications): render workspaces in master-detail shell"
```

---

## Tasks 8–13: Convert each workspace (shared recipe)

**Each workspace conversion follows the identical mechanical recipe below.** Do them one per task, one commit each. Logic/hooks/`useMemo` derivations at the top of each file stay **unchanged** — only the returned JSX is reshaped.

### Conversion recipe

1. Read the current workspace file top-to-bottom; keep every hook and derived value.
2. Replace the outer `return (<div className="space-y-8"> … </div>)` with:
   ```tsx
   return (
     <WorkspaceShell detail={detail} activeStage="<stage>">
       {/* groups */}
     </WorkspaceShell>
   )
   ```
   **Exception:** the workspace is already rendered *inside* a `WorkspaceShell` by the container (Task 7). To avoid a nested shell, the workspace must **not** wrap itself again. Instead, each workspace returns a **fragment of `SummaryGroup`s** and the container's shell provides the layout. So the real replacement is:
   ```tsx
   return (
     <>
       <SummaryGroup id="schedule" title="Schedule & format">…</SummaryGroup>
       <SummaryGroup id="topics" title="Topics likely to come up" count={topics.length}>…</SummaryGroup>
       {/* … */}
     </>
   )
   ```
   Import from the barrel: `import { SummaryGroup, SummaryRow } from '../components/workspace-shell'`.
3. For each former `<section>`:
   - The section heading/subtitle → `SummaryGroup` `title`/`subtitle`/`count`.
   - Each card/list item → one `SummaryRow` with:
     - `id` = a stable id from the item (DB id / canonical name / question text slug — **never** the array index),
     - `label` = the card's headline,
     - `indicator` = the existing badge/`EvidenceIndicator` if any,
     - `preview` = an optional one-line summary,
     - `detail` = the **existing card body JSX** (rationale, evidence lines, links, forms) moved verbatim into the rail.
4. Controls that are primary actions and not "detail" (e.g. `ScheduleCard` editing, story Add button, offer form, checklist ticks) may stay **inline in the left column** inside their `SummaryGroup` rather than becoming rows — use judgement per the per-task notes.
5. Empty states (the existing `<Card>…No analysis yet…</Card>`) stay as-is, rendered directly inside the `SummaryGroup` when the list is empty.
6. Keep all honesty banners / caveats. For section-level banners (e.g. DSA honesty `Card`s), render them inline at the top of the group (they are context, not per-row detail).
7. No nested ternaries in the new JSX (SonarQube S3358) — split into helper render functions or separate `{cond && …}` blocks.

### Per-workspace smoke test (template)

For each workspace, add a smoke test at `src/__tests__/features/applications/workspaces/<name>.test.tsx`:

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspaceShell } from '@/features/applications/stages/components/workspace-shell'
import { <Name>Workspace } from '@/features/applications/stages/workspaces/<Name>Workspace'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = { /* minimal valid ApplicationDetail for this stage — see note */ } as unknown as ApplicationDetail

beforeEach(() => window.localStorage.clear())

describe('<Name>Workspace', () => {
  it('renders its summary groups inside the shell without crashing', () => {
    render(
      <WorkspaceShell detail={detail} activeStage="<stage>">
        <<Name>Workspace detail={detail} />
      </WorkspaceShell>,
    )
    expect(screen.getByText('<a stable group title>')).toBeTruthy()
  })
})
```

> **Note on the fixture:** build the smallest `ApplicationDetail` that exercises at least one non-empty group for that stage (e.g. Technical needs `research` with one topic; Behavioural needs no stories — its groups still render headings). Cast via `as unknown as ApplicationDetail` to avoid reconstructing the full type. Assert on a group **title** that always renders (e.g. "Schedule & format"), so the test is robust to empty data.

---

### Task 8: TechnicalWorkspace

**Files:**
- Modify: `src/features/applications/stages/workspaces/TechnicalWorkspace.tsx:105-498`
- Test: `src/__tests__/features/applications/workspaces/technical.test.tsx`

Group mapping (in order):
- `role-focus` — keep the Role-focus `Card` inline (single banner, not rows).
- `schedule` — `ScheduleCard` inline (primary control).
- `topics` — `count={topics.length}`; one `SummaryRow` per topic. `label`=topic title, `indicator`=existing priority/relevance badge, `detail`=the `TopicCard` body. (Reuse `TopicCard` as the `detail` node: `detail={<TopicCard topic={topic} />}` and a short `label`.) `id`=`topic.id`.
- `dsa` — render the two honesty banner `Card`s inline at the top of the group, then one `SummaryRow` per `dsaCalibration.likelyTopics` item (`id`=`topic.canonicalName`, `label`=`topic.displayName`, `indicator`=relevance badge, `detail`=the existing green/red card body). Keep the "Other real-work DSA signals" sub-list and honesty footnote inline below the rows. Gate on `showDsaSection`.
- `projects` — keep the placeholder `Card` inline (no rows yet).
- `prep-checklist` — `count` = `prep.technicalPrepChecklist.length`; one `SummaryRow` per item (`id`=`item.topic`, `label`=`item.topic`, `indicator`=priority badge, `detail`=rationale + resources). Empty-state card inline when none.
- `difficult-questions` — one `SummaryRow` per question (`id`=`q.question`, `label`=`q.question`, `detail`=answerFramework + bridge). Render group only when `prep.difficultQuestions.length > 0`.
- `devops` — render only when `detail.devopsEvidence?.length`; banner inline; one `SummaryRow` per topic (`id`=`topic.canonicalTopicName`, `label`=`topic.displayName`, `indicator`=`topicGroup` badge, `detail`=the declared-artifact line).
- `practice` — keep the two external link buttons inline.

- [ ] **Step 1: Write the smoke test** (use the template; `activeStage="technical"`, fixture `research: { /* one topic via researchToTopics shape */ }` or simply assert the always-present "Schedule & format" group).
- [ ] **Step 2: Run it — expect FAIL** (`yarn test .../workspaces/technical.test.tsx`).
- [ ] **Step 3: Apply the recipe** to `TechnicalWorkspace.tsx` — return a `<>`-fragment of the groups above; move card bodies into `SummaryRow` `detail` props. Replace the `priorityBadge`/`confidenceBadge` inline usages by passing those badge elements as `indicator`.
- [ ] **Step 4: Run the smoke test — expect PASS.**
- [ ] **Step 5:** `yarn typecheck && yarn lint`.
- [ ] **Step 6: Commit** — `feat(applications): technical workspace master-detail layout`.

---

### Task 9: PhoneScreenWorkspace

**Files:**
- Modify: `src/features/applications/stages/workspaces/PhoneScreenWorkspace.tsx`
- Test: `src/__tests__/features/applications/workspaces/phone-screen.test.tsx`

Group mapping: `schedule` (ScheduleCard inline) · `career-arc` (summary text → one `SummaryRow` whose detail is the full arc) · `what-to-expect` (one row per bullet, or a single row with the list as detail) · `talking-points` (one row per point) · `questions-to-ask` (checklist stays inline — it's an action surface).

- [ ] Steps 1–6 per the recipe + template (`activeStage="phone-screen"`). Commit: `feat(applications): phone-screen workspace master-detail layout`.

---

### Task 10: SystemDesignWorkspace

**Files:**
- Modify: `src/features/applications/stages/workspaces/SystemDesignWorkspace.tsx`
- Test: `src/__tests__/features/applications/workspaces/system-design.test.tsx`

Group mapping: `schedule` · `question-patterns` (one row per pattern) · `system-tours` (one `SummaryRow` per `detail.systemTours` item, `id`=tour id, `label`=tour title, `detail`=the existing `SystemTourCard` body) · `framework` (the existing `CollapsibleSection` framework content becomes a single row whose detail is the six-step framework, **or** keep it as an inline `SummaryGroup` since it is already collapsible — prefer one row → rail for consistency).

- [ ] Steps 1–6 (`activeStage="system-design"`). Commit: `feat(applications): system-design workspace master-detail layout`.

---

### Task 11: BehaviouralWorkspace

**Files:**
- Modify: `src/features/applications/stages/workspaces/BehaviouralWorkspace.tsx`
- Test: `src/__tests__/features/applications/workspaces/behavioural.test.tsx`

Group mapping: `schedule` · `story-bank` (keep the filter chips + Add button inline at the group top; one `SummaryRow` per filtered story — `id`=story id, `label`=story title, `indicator`=theme chips, `detail`=the `StoryCard` STAR body with edit/delete/practice actions) · `typical-questions` (one row per question; `detail`=the best-match story or "no match" guidance). Keep `StoryForm` / `PracticeModal` modals mounted at the fragment root (they overlay, unaffected by the shell).

- [ ] Steps 1–6 (`activeStage="behavioural"`). Commit: `feat(applications): behavioural workspace master-detail layout`.

---

### Task 12: BarRaiserWorkspace

**Files:**
- Modify: `src/features/applications/stages/workspaces/BarRaiserWorkspace.tsx`
- Test: `src/__tests__/features/applications/workspaces/bar-raiser.test.tsx`

Group mapping: `schedule` · `values-matrix` (one `SummaryRow` per leadership principle — `id`=principle key, `label`=principle name, `indicator`=story count + `EvidenceIndicator` coverage strength, `detail`=the principle's stories, or the "draft a story" CTA when uncovered). The current "selected principle's stories" + "uncovered principles grid" both collapse into the rail detail of each row. Keep `StoryForm` modal at the root.

- [ ] Steps 1–6 (`activeStage="bar-raiser"`). Commit: `feat(applications): bar-raiser workspace master-detail layout`.

---

### Task 13: FinalWorkspace

**Files:**
- Modify: `src/features/applications/stages/workspaces/FinalWorkspace.tsx`
- Test: `src/__tests__/features/applications/workspaces/final.test.tsx`

Group mapping: `offer` (the editable offer form is the primary control — keep it **inline** in the left column inside the `offer` group) · `market-context` (one row, detail=full context) · `negotiation-leverage` (one row per leverage point) · `suggested-counter` (one row, detail=the counter rationale) · `decision-factors` (one row per weighted factor, `indicator`=weight, `detail`=factor explanation).

- [ ] Steps 1–6 (`activeStage="final"`). Commit: `feat(applications): final workspace master-detail layout`.

---

## Task 14: Update skeleton + delete dead panel

**Files:**
- Modify: `src/features/applications/stages/components/StageWorkspaceSkeleton.tsx`
- Delete: `src/features/applications/stages/components/NotesAndTimelinePanel.tsx`

- [ ] **Step 1: Confirm the old panel is unreferenced**

Run: `rg -l "NotesAndTimelinePanel" src/`
Expected: no output. If anything prints, fix that import first.

- [ ] **Step 2: Update the skeleton to a 2-column silhouette**

Replace the skeleton body so it mirrors `WorkspaceShell`: a wide left column of stacked row-shaped blocks and a narrower right rail block. Example:

```tsx
export function StageWorkspaceSkeleton() {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 h-8 w-64 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
      <div className="mb-6 h-10 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-3">
          {Array.from({ length: 6 }, (_, i) => `row-${i}`).map(key => (
            <div key={key} className="h-14 w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-white/10" />
          ))}
        </div>
        <div className="h-72 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10 lg:w-96" />
      </div>
    </div>
  )
}
```

(Stable keys via `row-${i}` strings, not bare index — SonarQube S6479.)

- [ ] **Step 3: Delete the dead panel**

```bash
git rm src/features/applications/stages/components/NotesAndTimelinePanel.tsx
```

- [ ] **Step 4: Typecheck + lint + full test run**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/stages/components/StageWorkspaceSkeleton.tsx
git commit -m "refactor(applications): 2-column skeleton, drop standalone notes panel"
```

---

## Task 15: Full verification + manual QA

- [ ] **Step 1: Gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all green.

- [ ] **Step 2: Manual QA (`yarn dev`)** — for each stage tab:
  - Left column scans as rows; clicking a row fills the Detail tab and animates in.
  - Rail tab indicator slides between Detail · Notes · Timeline.
  - Adding a note persists (reload).
  - `?focus=<id>` survives reload and browser back/forward.
  - Resize < `lg`: rail stacks full-width below the summary (sheet behaviour).
  - Dark mode renders correctly on every surface.
  - `prefers-reduced-motion`: no broken layout.

- [ ] **Step 3: Finish the branch**

Use `superpowers:finishing-a-development-branch` to open the PR (base `main`). PR body summarises the master–detail redesign and links the spec.

---

## Self-Review (completed by plan author)

**Spec coverage:** master–detail (Tasks 6–13) ✓ · unified right rail with Detail/Notes/Timeline tabs (Tasks 4–5) ✓ · resume-style full-text-on-click (Task 3 SummaryRow → Task 5 rail) ✓ · `?focus` URL sync (Tasks 1, 2, 7) ✓ · motion matching existing `layoutId` pattern (Tasks 3, 5) ✓ · responsive sheet + empty/loading states (Tasks 5, 6, 14) ✓ · tokens/a11y/SonarQube (recipe step 7, conventions) ✓ · all six workspaces (Tasks 8–13) ✓ · NotesAndTimelinePanel folded then deleted (Tasks 4, 14) ✓.

**Type consistency:** `RailSelection { id, label, node }` used identically in `selection.ts`, `SummaryRow.select(...)`, and `DetailRail` consumer ✓. `useDetailRail` / `DetailRailProvider` names consistent ✓. Barrel exports (`WorkspaceShell`, `SummaryGroup`, `SummaryRow`, `useDetailRail`) match imports in Tasks 7–13 ✓.

**Placeholder scan:** shared primitives (Tasks 2–7, 14) carry complete code. Tasks 8–13 are deliberately recipe-driven (mechanical reshaping of already-verified JSX); each names exact files, group ids, row id sources, and `detail` bodies — no "TBD". The recipe + per-task group mapping is the implementable spec for those files.
