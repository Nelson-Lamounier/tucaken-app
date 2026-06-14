# Analysis Progress Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the post-submit `ProgressBars` from inline (replacing the form) into a centered, dismissible modal that auto-opens on submit, is re-openable via a "View progress" pill, and shows a "View results" CTA on completion instead of auto-redirecting.

**Architecture:** `NewAnalysisPanel` keeps the form always mounted and owns submission + modal-open state. A new `AnalysisProgressModal` (Headless UI `Dialog`) wraps the existing `ProgressBars`, which stays the single source of progress UI/polling. `ProgressBars` loses its auto-redirect and takes a `startedAt` timestamp so the elapsed timer survives modal open/close remounts.

**Tech Stack:** React 19, TanStack Router/Query/Form, Headless UI 2.2.10, Tailwind v4, lucide-react, Vitest + Testing Library (happy-dom).

---

## Reference facts (read before starting)

- **`ProgressBars` has exactly one caller:** `NewAnalysisPanel`. Confirmed via `rg`. Removing the auto-redirect is safe.
- **Elapsed must survive remounts.** The modal unmounts `ProgressBars` on close; React Query keeps the slug-keyed status cache warm, but the wall-clock timer must derive from a passed-in `startedAt` (ms epoch), not a `Date.now()` seeded on mount.
- **Sentinels / state in `NewAnalysisPanel`:** `submittedSlug: string | null` (set on submit), `submittedRunId: string | null`, plus NEW `submittedAt: number | null` and `isProgressOpen: boolean`.
- **Test convention:** component tests live in `src/__tests__/features/<domain>/`, start with `/** @vitest-environment happy-dom */`, use `@testing-library/react`, and `vi.mock` collaborators. This repo has **no** `@testing-library/jest-dom`, so use native assertions (`toBeTruthy()`, `toBeNull()`, `expect(el).toHaveProperty('disabled', true)`), not `toBeInTheDocument()`/`toBeDisabled()`.
- **Commits:** Conventional Commits. **Never** add a `Co-Authored-By` trailer.
- **SonarLint:** no `as any`, no non-null assertions, no nested ternaries, optional chaining, `Number.*` over globals, stable React keys, no `console.*`.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/applications/components/ProgressBars.tsx` *(modify)* | Progress UI + polling. Drop auto-redirect; add `startedAt` prop; relabel complete link. |
| `src/features/applications/components/AnalysisProgressModal.tsx` *(new)* | Centered Headless UI `Dialog` shell around `ProgressBars`. |
| `src/features/applications/components/NewAnalysisPanel.tsx` *(modify)* | Always render form; own submission + modal state; render pill + modal. |
| `src/__tests__/features/applications/NewAnalysisPanel.progress-modal.test.tsx` *(new)* | Toggle behaviour: auto-open → close → pill → reopen → dismiss. |

---

## Task 1: `ProgressBars` — drop auto-redirect, add `startedAt`, relabel link

**Files:**
- Modify: `src/features/applications/components/ProgressBars.tsx`

- [ ] **Step 1: Update the two import lines**

Replace:
```tsx
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
```
with:
```tsx
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
```

- [ ] **Step 2: Update the signature and remove the `navigate` binding**

Replace:
```tsx
export function ProgressBars({ slug, pipelineRunId }: { slug: string; pipelineRunId?: string }) {
  const navigate = useNavigate()
  const { data, timedOut } = useApplicationDetail(slug)
```
with:
```tsx
export function ProgressBars({
  slug,
  pipelineRunId,
  startedAt,
}: {
  slug: string
  pipelineRunId?: string
  startedAt: number
}) {
  const { data, timedOut } = useApplicationDetail(slug)
```

- [ ] **Step 3: Replace the elapsed-time block with a `startedAt`-derived timer**

Replace this block:
```tsx
  // ── Elapsed wall-clock ────────────────────────────────────────────────────
  const startEpochRef = useRef<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (isFinished || isFailed) return
    if (!startEpochRef.current) startEpochRef.current = Date.now()
    const iv = setInterval(() => setElapsedMs(Date.now() - startEpochRef.current!), 1_000)
    return () => clearInterval(iv)
  }, [isFinished, isFailed])
```
with:
```tsx
  // ── Elapsed wall-clock ────────────────────────────────────────────────────
  // Derived from the caller-supplied start time so the timer stays correct even
  // if this component unmounts (modal closed) and remounts (modal re-opened).
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt)

  useEffect(() => {
    if (isFinished || isFailed) return
    const iv = setInterval(() => setElapsedMs(Date.now() - startedAt), 1_000)
    return () => clearInterval(iv)
  }, [isFinished, isFailed, startedAt])
```

- [ ] **Step 4: Remove the auto-redirect effect entirely**

Delete this block:
```tsx
  // ── Auto-redirect on success ──────────────────────────────────────────────
  useEffect(() => {
    if (!isFinished || isFailed) return
    const t = setTimeout(() => {
      void navigate({ to: '/applications/$slug', params: { slug } })
    }, 800)
    return () => clearTimeout(t)
  }, [isFinished, isFailed, navigate, slug])
```

- [ ] **Step 5: Relabel the complete-state link**

Replace:
```tsx
          <Link
            to="/applications/$slug"
            params={{ slug }}
            className="flex-none text-xs text-zinc-500 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Go to overview →
          </Link>
```
with:
```tsx
          <Link
            to="/applications/$slug"
            params={{ slug }}
            className="flex-none text-xs text-zinc-500 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            View results →
          </Link>
```

- [ ] **Step 6: Typecheck**

Run: `yarn typecheck`
Expected: errors ONLY in `src/features/applications/components/NewAnalysisPanel.tsx` (it still renders `<ProgressBars>` without the new required `startedAt` prop). Fixed in Task 3. Report the error text to confirm it is only that. Any other file erroring must be fixed now.

- [ ] **Step 7: Commit**

```bash
git add src/features/applications/components/ProgressBars.tsx
git commit -m "refactor(applications): ProgressBars takes startedAt, drop auto-redirect"
```

---

## Task 2: `AnalysisProgressModal` — centered Dialog shell

**Files:**
- Create: `src/features/applications/components/AnalysisProgressModal.tsx`

- [ ] **Step 1: Create the component**

Create `src/features/applications/components/AnalysisProgressModal.tsx` with exactly:

```tsx
'use client'

import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { ProgressBars } from './ProgressBars'

export interface AnalysisProgressModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly slug: string
  readonly pipelineRunId?: string
  /** Submission start time (ms epoch) — keeps the elapsed timer stable across re-opens. */
  readonly startedAt: number
}

/**
 * Centered, dismissible modal that hosts the pipeline `ProgressBars`. Closing it
 * only hides the modal — the pipeline keeps running and the parent's "View
 * progress" pill re-opens it.
 */
export function AnalysisProgressModal({
  isOpen,
  onClose,
  slug,
  pipelineRunId,
  startedAt,
}: AnalysisProgressModalProps) {
  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-40">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="w-full max-w-lg overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900 data-closed:scale-95 data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
        >
          <ProgressBars slug={slug} pipelineRunId={pipelineRunId} startedAt={startedAt} />
        </DialogPanel>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `yarn typecheck`
Expected: still only the `NewAnalysisPanel.tsx` error from Task 1 (fixed in Task 3). No error in `AnalysisProgressModal.tsx`.

- [ ] **Step 3: Lint the new file**

Run: `yarn eslint src/features/applications/components/AnalysisProgressModal.tsx`
Expected: 0 problems.

- [ ] **Step 4: Commit**

```bash
git add src/features/applications/components/AnalysisProgressModal.tsx
git commit -m "feat(applications): centered modal shell for analysis progress"
```

---

## Task 3: `NewAnalysisPanel` — wire modal + pill (TDD)

**Files:**
- Modify: `src/features/applications/components/NewAnalysisPanel.tsx`
- Create test: `src/__tests__/features/applications/NewAnalysisPanel.progress-modal.test.tsx`

- [ ] **Step 1: Write the failing toggle test**

Create `src/__tests__/features/applications/NewAnalysisPanel.progress-modal.test.tsx` with exactly:

```tsx
/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewAnalysisPanel } from '@/features/applications/components/NewAnalysisPanel'

vi.mock('@/features/applications/hooks/use-applications-trigger', () => ({
  useApplicationsTrigger: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))

vi.mock('@/features/applications/components/ResumeMenuSelect', () => ({
  ResumeMenuSelect: () => <div data-testid="resume-menu" />,
}))

vi.mock('@/lib/stores/pipeline-notifications-store', () => ({
  usePipelineNotificationsStore: (selector: (s: unknown) => unknown) =>
    selector({ addNotification: vi.fn() }),
}))

// Stub the modal so we can observe open/close without the polling internals.
vi.mock('@/features/applications/components/AnalysisProgressModal', () => ({
  AnalysisProgressModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="progress-modal">
        <button type="button" onClick={onClose}>
          close-modal
        </button>
      </div>
    ) : null,
}))

function fillAndTestSubmit() {
  fireEvent.change(screen.getByPlaceholderText('e.g. Revolut'), {
    target: { value: 'Revolut' },
  })
  fireEvent.change(screen.getByPlaceholderText('e.g. Senior DevOps Engineer'), {
    target: { value: 'Senior DevOps Engineer' },
  })
  fireEvent.change(screen.getByPlaceholderText(/Paste the full job description/i), {
    target: { value: 'x'.repeat(60) },
  })
  fireEvent.click(screen.getByLabelText(/Run in Test Mode/i))
  fireEvent.click(screen.getByRole('button', { name: /Start Analysis/i }))
}

describe('NewAnalysisPanel progress modal', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('auto-opens the modal on submit, then toggles via close / pill / dismiss', async () => {
    render(<NewAnalysisPanel resumeId="resume-1" onResumeChange={vi.fn()} />)

    fillAndTestSubmit()

    // Auto-opens on submit.
    await waitFor(() => expect(screen.getByTestId('progress-modal')).toBeTruthy())

    // Close → modal hidden, pill visible.
    fireEvent.click(screen.getByRole('button', { name: 'close-modal' }))
    expect(screen.queryByTestId('progress-modal')).toBeNull()
    const pill = screen.getByRole('button', { name: /View progress/i })
    expect(pill).toBeTruthy()

    // Pill re-opens the modal.
    fireEvent.click(pill)
    expect(screen.getByTestId('progress-modal')).toBeTruthy()

    // Dismiss (×) clears everything.
    fireEvent.click(screen.getByRole('button', { name: /Dismiss analysis progress/i }))
    expect(screen.queryByTestId('progress-modal')).toBeNull()
    expect(screen.queryByRole('button', { name: /View progress/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test src/__tests__/features/applications/NewAnalysisPanel.progress-modal.test.tsx`
Expected: FAIL — `NewAnalysisPanel` still renders the inline `ProgressBars` (no `progress-modal` testid, no pill).

- [ ] **Step 3: Update imports**

In `src/features/applications/components/NewAnalysisPanel.tsx`:

Replace:
```tsx
import { AlertCircle, Loader2 } from 'lucide-react'
```
with:
```tsx
import { AlertCircle, Loader2, X } from 'lucide-react'
```

Replace:
```tsx
import { ProgressBars } from './ProgressBars'
```
with:
```tsx
import { AnalysisProgressModal } from './AnalysisProgressModal'
```

- [ ] **Step 4: Add modal + timestamp state**

Replace:
```tsx
  const [submittedSlug, setSubmittedSlug] = useState<string | null>(null)
  const [submittedRunId, setSubmittedRunId] = useState<string | null>(null)
```
with:
```tsx
  const [submittedSlug, setSubmittedSlug] = useState<string | null>(null)
  const [submittedRunId, setSubmittedRunId] = useState<string | null>(null)
  const [submittedAt, setSubmittedAt] = useState<number | null>(null)
  const [isProgressOpen, setIsProgressOpen] = useState(false)

  const clearSubmission = () => {
    setSubmittedSlug(null)
    setSubmittedRunId(null)
    setSubmittedAt(null)
    setIsProgressOpen(false)
  }
```

- [ ] **Step 5: Open the modal on the test-mode submit path**

Replace:
```tsx
      if (value.testMode) {
        localStorage.removeItem('application-form-draft')
        form.reset()
        setSubmittedSlug(`mock-${Date.now()}`)
        return
      }
```
with:
```tsx
      if (value.testMode) {
        localStorage.removeItem('application-form-draft')
        form.reset()
        setSubmittedSlug(`mock-${Date.now()}`)
        setSubmittedAt(Date.now())
        setIsProgressOpen(true)
        return
      }
```

- [ ] **Step 6: Open the modal on the real success path**

Replace:
```tsx
          onSuccess: (data) => {
            localStorage.removeItem('application-form-draft')
            form.reset()
            setSubmittedSlug(data.applicationId)
            setSubmittedRunId(data.pipelineRunId)
            addNotification({
```
with:
```tsx
          onSuccess: (data) => {
            localStorage.removeItem('application-form-draft')
            form.reset()
            setSubmittedSlug(data.applicationId)
            setSubmittedRunId(data.pipelineRunId)
            setSubmittedAt(Date.now())
            setIsProgressOpen(true)
            addNotification({
```

- [ ] **Step 7: Remove the inline early return**

Delete this block:
```tsx
  if (submittedSlug) {
    return (
      <div className="mb-8 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5 shadow-sm">
        <ProgressBars slug={submittedSlug} pipelineRunId={submittedRunId ?? undefined} />
      </div>
    )
  }
```

- [ ] **Step 8: Wrap the return in a fragment and add the pill + modal**

The component currently `return (<div className="mb-8 …"> … </div>)`. Change it to a fragment that also renders the pill and modal. Replace the opening:
```tsx
  return (
    <div className="mb-8 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5 shadow-sm">
```
with:
```tsx
  return (
    <>
    <div className="mb-8 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5 shadow-sm">
```

Then find the matching closing of that outer `<div>` — it is the LAST `</div>` before the final `)` of the component (immediately after the `</form>`). Replace:
```tsx
        </form>
    </div>
  )
}
```
with:
```tsx
        </form>
    </div>

    {submittedSlug && (
      <div className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 shadow-lg dark:border-white/10 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setIsProgressOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200"
        >
          <Loader2 className="size-4 animate-spin text-teal-600 dark:text-teal-400" />
          View progress
        </button>
        <button
          type="button"
          onClick={clearSubmission}
          aria-label="Dismiss analysis progress"
          className="rounded-full p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    )}

    {submittedSlug && submittedAt !== null && (
      <AnalysisProgressModal
        isOpen={isProgressOpen}
        onClose={() => setIsProgressOpen(false)}
        slug={submittedSlug}
        pipelineRunId={submittedRunId ?? undefined}
        startedAt={submittedAt}
      />
    )}
    </>
  )
}
```

- [ ] **Step 9: Run the toggle test to verify it passes**

Run: `yarn test src/__tests__/features/applications/NewAnalysisPanel.progress-modal.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 10: Typecheck + lint**

Run: `yarn typecheck`
Expected: 0 errors (the Task 1 `NewAnalysisPanel` error is now resolved).
Run: `yarn eslint src/features/applications/components/NewAnalysisPanel.tsx`
Expected: 0 problems.

- [ ] **Step 11: Run the existing payload test (regression)**

Run: `yarn test src/__tests__/features/applications/NewAnalysisPanel.payload.test.tsx`
Expected: PASS (its trigger mock never calls `onSuccess`, so no modal renders).

- [ ] **Step 12: Commit**

```bash
git add src/features/applications/components/NewAnalysisPanel.tsx src/__tests__/features/applications/NewAnalysisPanel.progress-modal.test.tsx
git commit -m "feat(applications): toggleable progress modal + view-progress pill"
```

---

## Task 4: Full verification

- [ ] **Step 1: Typecheck + lint + tests**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: typecheck 0 errors; lint 0 errors (pre-existing `no-console` warnings elsewhere are fine); all tests pass.

- [ ] **Step 2: Manual UI pass**

Run: `yarn dev` (port 5001). On `/applications/new`:
- Fill company/role/JD, tick **Run in Test Mode**, click **Start Analysis** → modal auto-opens centered with the progress steps.
- Press Escape or click the backdrop → modal closes; a **View progress** pill appears bottom-right.
- Click the pill → modal re-opens; the elapsed timer is continuous (not reset to 0s).
- Click the pill **×** → pill and modal both disappear.
- Toggle dark/light → modal panel and pill render correctly in both.
- (Real run, optional) submit a non-test analysis → on completion the modal shows "Analysis complete" + **View results →**, with NO auto-redirect.

---

## Self-Review notes

- **Spec coverage:** auto-open + dismiss + re-open pill (Task 3 Steps 5/6/8), `×` clears state (`clearSubmission`, Step 4/8), no auto-redirect + `startedAt` stable timer + "View results" relabel (Task 1), centered Dialog (Task 2), form always rendered (Step 7), test (Step 1). All covered.
- **Type consistency:** `startedAt: number` is required on `ProgressBars` (Task 1), `AnalysisProgressModal` (Task 2), and supplied from `submittedAt` (guarded non-null at the call site, Step 8). `clearSubmission` name used consistently.
- **No placeholders:** every step has exact old→new code and exact commands.
