# Resume Analysis One-Screen Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the two-step resume-analysis wizard into a single screen where the resume defaults to the active version and is switchable inline, so the user pastes a job description and clicks Start.

**Architecture:** A new `ResumeMenuSelect` (Headless UI `Listbox`) replaces the full-screen `ResumeSelect` step. `NewAnalysisPanel` becomes controlled on `resumeId` and embeds the selector in its header. The route file drops `step`/`FullWidthBar` state and resolves the default resume once via a `null` sentinel.

**Tech Stack:** TanStack Start/Router, TanStack Query, TanStack Form, React 19, Headless UI, Tailwind v4, Vitest + Testing Library (happy-dom).

---

## Reference facts (read before starting)

- **Resume data hook:** `src/features/applications/hooks/use-resume-versions.ts` exports `useResumeVersions()` returning `useQuery<AdminResume[]>` and the type:
  ```ts
  export interface AdminResume {
    readonly resumeId: string
    readonly label: string
    readonly isActive: boolean
    readonly createdAt: string
    readonly updatedAt: string
  }
  ```
- **Server contract is unchanged.** `analyseTriggerSchema` (`src/server/pipelines.ts:84`) takes `resumeId?: string`; empty string `''` means "build from scratch".
- **Styling reference:** `src/components/ui/CustomDropDown.tsx` — Headless UI `Listbox` styled for this app (light/dark). Match its button/options class strings.
- **Test convention:** component tests live in `src/__tests__/features/<domain>/`, start with the docblock `/** @vitest-environment happy-dom */`, use `@testing-library/react`, wrap hooks-using components in a `QueryClientProvider`, and `vi.mock` data hooks. See `src/__tests__/features/applications/stage-components.test.tsx`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer (project rule).
- **Sentinel:** `''` = build from scratch (a real, submittable value). `null` = "default not yet resolved" (route-level only, never sent to the server).

## File Structure

| File | Responsibility |
|---|---|
| `src/features/applications/components/ResumeMenuSelect.tsx` *(new)* | Inline resume picker. Fetches versions, resolves the default once, renders the `Listbox` (versions + "build from scratch" + "create resume" link), reports selection up. |
| `src/features/applications/components/NewAnalysisPanel.tsx` *(modify)* | Controlled on `resumeId`; renders `ResumeMenuSelect` in header; submits selected `resumeId`. |
| `src/app/_dashboard/applications/new.tsx` *(modify)* | Single-screen route; owns `resumeId` state (`string | null`); no wizard. |
| `src/features/applications/components/ResumeSelect.tsx` *(delete)* | Obsolete full-screen step. |
| `src/__tests__/features/applications/ResumeMenuSelect.test.tsx` *(new)* | Unit tests for default resolution + selection. |
| `src/__tests__/features/applications/NewAnalysisPanel.payload.test.tsx` *(new)* | Regression: submitted payload carries selected `resumeId`. |

---

## Task 1: `ResumeMenuSelect` component (TDD)

**Files:**
- Create: `src/features/applications/components/ResumeMenuSelect.tsx`
- Test: `src/__tests__/features/applications/ResumeMenuSelect.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/applications/ResumeMenuSelect.test.tsx`:

```tsx
/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { AdminResume } from '@/features/applications/hooks/use-resume-versions'
import { ResumeMenuSelect } from '@/features/applications/components/ResumeMenuSelect'

// Router Link -> plain anchor
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...(rest as Record<string, string>)}>{children}</a>
  ),
}))

const useResumeVersionsMock = vi.fn()
vi.mock('@/features/applications/hooks/use-resume-versions', () => ({
  useResumeVersions: () => useResumeVersionsMock(),
}))

function makeResume(over: Partial<AdminResume>): AdminResume {
  return {
    resumeId: 'r1',
    label: 'Resume 1',
    isActive: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('ResumeMenuSelect', () => {
  beforeEach(() => {
    useResumeVersionsMock.mockReset()
  })

  it('resolves the active resume as the default when resumeId is null', () => {
    const resumes = [
      makeResume({ resumeId: 'old', label: 'Old', updatedAt: '2026-02-01T00:00:00.000Z' }),
      makeResume({ resumeId: 'active', label: 'Active One', isActive: true, updatedAt: '2026-01-01T00:00:00.000Z' }),
    ]
    useResumeVersionsMock.mockReturnValue({ data: resumes, isLoading: false })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId={null} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledWith('active')
  })

  it('defaults to most-recent when no resume is active', () => {
    const resumes = [
      makeResume({ resumeId: 'older', updatedAt: '2026-01-01T00:00:00.000Z' }),
      makeResume({ resumeId: 'newer', updatedAt: '2026-03-01T00:00:00.000Z' }),
    ]
    useResumeVersionsMock.mockReturnValue({ data: resumes, isLoading: false })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId={null} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledWith('newer')
  })

  it('defaults to build-from-scratch ("") when there are no resumes', () => {
    useResumeVersionsMock.mockReturnValue({ data: [], isLoading: false })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId={null} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('does not re-resolve the default once resumeId is set', () => {
    useResumeVersionsMock.mockReturnValue({
      data: [makeResume({ resumeId: 'active', isActive: true })],
      isLoading: false,
    })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId="" onChange={onChange} />)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('lets the user pick build-from-scratch from the menu', () => {
    useResumeVersionsMock.mockReturnValue({
      data: [makeResume({ resumeId: 'active', label: 'Active One', isActive: true })],
      isLoading: false,
    })
    const onChange = vi.fn()
    render(<ResumeMenuSelect resumeId="active" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Build from scratch with agent'))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/__tests__/features/applications/ResumeMenuSelect.test.tsx`
Expected: FAIL — cannot resolve module `ResumeMenuSelect`.

- [ ] **Step 3: Write the component**

Create `src/features/applications/components/ResumeMenuSelect.tsx`:

```tsx
import { useEffect } from 'react'
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { ChevronUpDownIcon } from '@heroicons/react/16/solid'
import { CheckIcon } from '@heroicons/react/20/solid'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { Wand2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useResumeVersions, type AdminResume } from '../hooks/use-resume-versions'

/** Empty string is a real, submittable value meaning "let the agent build a resume". */
const BUILD_FROM_SCRATCH = ''

export interface ResumeMenuSelectProps {
  /** `null` = default not yet resolved; `''` = build from scratch; otherwise a resume id. */
  readonly resumeId: string | null
  readonly onChange: (resumeId: string) => void
}

/** Active resume first, then most-recently-updated. */
function sortResumes(resumes: readonly AdminResume[]): AdminResume[] {
  return [...resumes].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1
    if (!a.isActive && b.isActive) return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

export function ResumeMenuSelect({ resumeId, onChange }: ResumeMenuSelectProps) {
  const { data: resumes, isLoading } = useResumeVersions()
  const sorted = resumes ? sortResumes(resumes) : []

  // Resolve the default exactly once: only while resumeId is still unresolved (null).
  useEffect(() => {
    if (resumeId !== null || isLoading) return
    onChange(sorted.length > 0 ? sorted[0].resumeId : BUILD_FROM_SCRATCH)
  }, [resumeId, isLoading, sorted, onChange])

  if (isLoading || resumeId === null) {
    return (
      <div
        className="h-8 w-44 animate-pulse rounded-md bg-zinc-200 dark:bg-white/10"
        aria-label="Loading resumes"
      />
    )
  }

  const selected = sorted.find((r) => r.resumeId === resumeId)
  const buttonLabel = selected ? selected.label : 'Build from scratch with agent'

  return (
    <Listbox value={resumeId} onChange={onChange} as="div" className="relative">
      <ListboxButton className="inline-flex items-center gap-2 rounded-md bg-zinc-100 dark:bg-white/5 px-3 py-1.5 text-sm text-zinc-900 dark:text-white outline-1 -outline-offset-1 outline-zinc-300 dark:outline-white/10 hover:bg-zinc-200 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-500 transition-colors">
        {selected ? <DocumentTextIcon className="size-4 text-zinc-500" /> : <Wand2 className="size-4 text-violet-500" />}
        <span className="max-w-[12rem] truncate">{buttonLabel}</span>
        <ChevronUpDownIcon aria-hidden="true" className="size-4 text-zinc-400" />
      </ListboxButton>

      <ListboxOptions
        transition
        className="absolute right-0 z-20 mt-1 max-h-72 w-72 overflow-auto rounded-md bg-white dark:bg-zinc-800 py-1 text-sm shadow-lg ring-1 ring-zinc-200 dark:ring-white/10 data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0"
      >
        {sorted.map((resume) => (
          <ListboxOption
            key={resume.resumeId}
            value={resume.resumeId}
            className="group flex cursor-pointer items-center justify-between gap-2 px-3 py-2 data-focus:bg-zinc-100 dark:data-focus:bg-white/5"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate text-zinc-900 dark:text-white">{resume.label}</span>
                {resume.isActive && (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20 px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset">
                    Active
                  </span>
                )}
              </span>
              <span className="block text-xs text-zinc-500">
                Updated {new Date(resume.updatedAt).toLocaleDateString()}
              </span>
            </span>
            <CheckIcon className="size-4 text-teal-600 opacity-0 group-data-selected:opacity-100" />
          </ListboxOption>
        ))}

        <ListboxOption
          value={BUILD_FROM_SCRATCH}
          className="group flex cursor-pointer items-center justify-between gap-2 border-t border-zinc-200 dark:border-white/10 px-3 py-2 data-focus:bg-zinc-100 dark:data-focus:bg-white/5"
        >
          <span className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
            <Wand2 className="size-4" />
            Build from scratch with agent
          </span>
          <CheckIcon className="size-4 text-teal-600 opacity-0 group-data-selected:opacity-100" />
        </ListboxOption>

        <div className="border-t border-zinc-200 dark:border-white/10 px-3 py-2">
          <Link
            to="/resumes/new"
            className="inline-flex items-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
          >
            Create new resume
            <span aria-hidden="true" className="ml-1">&rarr;</span>
          </Link>
        </div>
      </ListboxOptions>
    </Listbox>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/__tests__/features/applications/ResumeMenuSelect.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `yarn typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/applications/components/ResumeMenuSelect.tsx src/__tests__/features/applications/ResumeMenuSelect.test.tsx
git commit -m "feat(applications): inline resume picker for one-screen analysis"
```

---

## Task 2: Make `NewAnalysisPanel` controlled on `resumeId` + embed the selector

**Files:**
- Modify: `src/features/applications/components/NewAnalysisPanel.tsx`
- Test: `src/__tests__/features/applications/NewAnalysisPanel.payload.test.tsx` (create)

- [ ] **Step 1: Write the failing payload test**

Create `src/__tests__/features/applications/NewAnalysisPanel.payload.test.tsx`:

```tsx
/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewAnalysisPanel } from '@/features/applications/components/NewAnalysisPanel'

const mutateMock = vi.fn()
vi.mock('@/features/applications/hooks/use-applications-trigger', () => ({
  useApplicationsTrigger: () => ({ mutate: mutateMock, isPending: false, error: null }),
}))

// Render the selector as a no-op so this test focuses on payload wiring.
vi.mock('@/features/applications/components/ResumeMenuSelect', () => ({
  ResumeMenuSelect: () => <div data-testid="resume-menu" />,
}))

vi.mock('@/lib/stores/pipeline-notifications-store', () => ({
  usePipelineNotificationsStore: (selector: (s: unknown) => unknown) =>
    selector({ addNotification: vi.fn() }),
}))

describe('NewAnalysisPanel payload', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    localStorage.clear()
  })

  it('submits the selected resumeId in the trigger payload', () => {
    render(<NewAnalysisPanel resumeId="resume-xyz" onResumeChange={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('e.g. Revolut'), {
      target: { value: 'Revolut' },
    })
    fireEvent.change(screen.getByPlaceholderText('e.g. Senior DevOps Engineer'), {
      target: { value: 'Senior DevOps Engineer' },
    })
    fireEvent.change(
      screen.getByPlaceholderText(/Paste the full job description/i),
      { target: { value: 'x'.repeat(60) } },
    )

    fireEvent.click(screen.getByRole('button', { name: /Start Analysis/i }))

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(mutateMock.mock.calls[0][0]).toMatchObject({
      resumeId: 'resume-xyz',
      targetCompany: 'Revolut',
      targetRole: 'Senior DevOps Engineer',
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test src/__tests__/features/applications/NewAnalysisPanel.payload.test.tsx`
Expected: FAIL — `NewAnalysisPanel` does not accept `resumeId`/`onResumeChange` (type/prop error) or `mutate` not called because the old prop name is used.

- [ ] **Step 3: Update the component props and submit handler**

In `src/features/applications/components/NewAnalysisPanel.tsx`:

1. Add the import near the other feature imports:

```tsx
import { ResumeMenuSelect } from './ResumeMenuSelect'
```

2. Replace the props interface and signature (lines ~26–31):

```tsx
export interface NewAnalysisPanelProps {
  /** `null` = default not yet resolved; `''` = build from scratch; otherwise a resume id. */
  readonly resumeId: string | null
  readonly onResumeChange: (resumeId: string) => void
  readonly onSuccess?: () => void
}

export function NewAnalysisPanel({ resumeId, onResumeChange, onSuccess: _onSuccess }: NewAnalysisPanelProps) {
```

3. In the submit handler, replace the `resumeId: preselectedResumeId` line (~line 74) with the resolved value (`null` is never reached here because Start is gated behind a valid form, but coerce defensively):

```tsx
        resumeId: resumeId ?? '',
```

4. In the success-notification block and anywhere else, no change needed.

- [ ] **Step 4: Swap the static header badge for the selector**

Replace the header right-hand block (`<div className="flex-none"> … </div>`, lines ~136–148) with:

```tsx
        <div className="flex-none">
          <ResumeMenuSelect resumeId={resumeId} onChange={onResumeChange} />
        </div>
```

Then update the header subtitle conditional (lines ~129–134) to key off the resolved value — treat `null` as the selected (loading) state:

```tsx
            <p className="text-xs text-zinc-500">
              {resumeId === ''
                ? 'Paste a job description — the agent will build your resume from scratch'
                : 'Paste a job description to analyse against your selected resume'}
            </p>
```

- [ ] **Step 5: Remove the dead hidden resume block**

Delete the empty hidden `<div className="hidden"> … </div>` block (lines ~217–219, the comment "the resume version selection has been moved to a previous pipeline step"). The grid that held it now has a single child; change its wrapper from a 2-column grid to a single column:

```tsx
          {/* Interview Stage */}
          <div className="mt-4">
            <div>
              <label htmlFor="interview-stage" className="mb-1.5 block text-sm/6 font-medium text-zinc-900 dark:text-white">
                Interview Stage
              </label>
              {/* …existing form.Field select unchanged… */}
            </div>
          </div>
```

- [ ] **Step 6: Run the payload test to verify it passes**

Run: `yarn test src/__tests__/features/applications/NewAnalysisPanel.payload.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `yarn typecheck`
Expected: errors only in `new.tsx` (still passing the old `preselectedResumeId` prop) — that is fixed in Task 3. If any other file errors, fix it before continuing.

- [ ] **Step 8: Commit**

```bash
git add src/features/applications/components/NewAnalysisPanel.tsx src/__tests__/features/applications/NewAnalysisPanel.payload.test.tsx
git commit -m "feat(applications): control resume selection inside analysis panel"
```

---

## Task 3: Single-screen route + delete the obsolete step

**Files:**
- Modify: `src/app/_dashboard/applications/new.tsx`
- Delete: `src/features/applications/components/ResumeSelect.tsx`

- [ ] **Step 1: Rewrite the route file**

Replace the entire contents of `src/app/_dashboard/applications/new.tsx` with:

```tsx
import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { NewAnalysisPanel } from '@/features/applications/components/NewAnalysisPanel'
import { DashboardPage } from '@/components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/applications/new')({
  component: ApplicationsNewRoute,
})

function ApplicationsNewRoute() {
  const navigate = useNavigate()
  // `null` until ResumeMenuSelect resolves the default (active resume / most recent / scratch).
  const [resumeId, setResumeId] = useState<string | null>(null)

  return (
    <DashboardPage
      title="Resume Analysis"
      description="Create a new resume analysis."
    >
      <NewAnalysisPanel
        resumeId={resumeId}
        onResumeChange={setResumeId}
        onSuccess={() => {
          navigate({ to: '/applications/list' })
        }}
      />
    </DashboardPage>
  )
}
```

- [ ] **Step 2: Delete the obsolete component**

Run: `git rm src/features/applications/components/ResumeSelect.tsx`

- [ ] **Step 3: Confirm no remaining imports of the deleted file**

Run: `rg -n "ResumeSelect\b|FullWidthBar" src/app/_dashboard/applications src/features/applications`
Expected: no references to `ResumeSelect` in `new.tsx`; `FullWidthBar` no longer imported in `new.tsx`. (Other unrelated `FullWidthBar` usages elsewhere are fine.)

- [ ] **Step 4: Typecheck**

Run: `yarn typecheck`
Expected: no errors.

- [ ] **Step 5: Run the full applications test set**

Run: `yarn test src/__tests__/features/applications`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/_dashboard/applications/new.tsx
git commit -m "feat(applications): single-screen resume analysis flow"
```

---

## Task 4: Full verification

- [ ] **Step 1: Typecheck + lint + tests**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all green.

- [ ] **Step 2: Manual UI pass**

Run: `yarn dev` (port 5001). Open `/applications/new` and verify:
- The page is a single screen — no "Step 1 / Step 2" bar.
- The resume chip shows the active resume by default; the subtitle reads "…against your selected resume".
- Opening the chip lists all versions (Active badge on the active one), plus "Build from scratch with agent" and a "Create new resume" link.
- Selecting "Build from scratch" flips the subtitle to the from-scratch copy and the header badge to "Building from scratch".
- Golden path: paste a 50+ char JD, fill company + role, click **Start Analysis** → `ProgressBars` takes over.
- Toggle dark mode — the chip, dropdown, and badges render correctly in both.
- Edge: with a fresh/no-resume account, the chip defaults to "Build from scratch" and the dropdown still surfaces "Create new resume".

- [ ] **Step 3: Final commit (if manual pass required tweaks)**

```bash
git add -A
git commit -m "fix(applications): polish one-screen analysis after manual QA"
```

---

## Self-Review notes

- **Spec coverage:** one-screen route (Task 3), inline resume default+switch (Task 1), company/role kept required inline (untouched in `NewAnalysisPanel`), compact dropdown (Task 1), delete `ResumeSelect` + migrate empty-state link (Task 1 footer link + Task 3 delete), draft-save & `ProgressBars` preserved (untouched paths in Task 2). All covered.
- **Sentinel consistency:** `null` (unresolved, route-only) vs `''` (build from scratch, submittable) used identically across Tasks 1–3.
- **Prop rename:** `preselectedResumeId` → `resumeId` + new `onResumeChange` applied in Task 2 and consumed in Task 3; no stale references remain after Task 3 Step 3 grep.
