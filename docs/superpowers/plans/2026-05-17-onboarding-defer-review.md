# Defer Onboarding Review to a Terminal Step — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the resume Review/gap/enhance experience out of onboarding Step 3 and render it once as a new terminal `review` step after Step 5 (`processing`); Step 3 finishes the document ring then advances to Step 4.

**Architecture:** Add a `review` step to the wizard state machine. Lift `importId` from `ImportCareerStep` into onboarding state so the new `ReviewStep` can drive its queries after Step 3 unmounts. `ImportCareerStep` shrinks to upload+processing+complete; `ProcessingStep` advances via `onNext` instead of redirecting; `ReviewStep` owns the final `/overview` navigation.

**Tech Stack:** React 19, TanStack Router/Query, Vitest + @testing-library/react (happy-dom), Motion for React, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-05-17-onboarding-defer-review-design.md`

**Commit protocol:** Every commit step follows the git-commit skill — run `yarn test`, `yarn lint`, `yarn typecheck` first; commit only on green; Conventional Commits; no Co-Authored-By trailer.

---

### Task 1: Add `review` step + `resumeImportId` to onboarding state

**Files:**
- Modify: `src/features/onboarding/components/onboarding/types.ts`
- Modify: `src/features/onboarding/components/onboarding/useOnboardingState.ts`
- Test: `src/__tests__/features/onboarding/useOnboardingState.test.ts`

- [ ] **Step 1: Update existing test + add new tests**

In `src/__tests__/features/onboarding/useOnboardingState.test.ts`:

Replace the `clamps initialStepIndex to valid range` test body with:

```ts
  it('clamps initialStepIndex to valid range', () => {
    const { result } = renderHook(() => useOnboardingState(99))
    expect(result.current.stepIndex).toBe(6) // review is last
  })
```

Replace the `does not advance past the last step` test body with:

```ts
  it('does not advance past the last step', () => {
    const { result } = renderHook(() => useOnboardingState(6))
    act(() => result.current.next())
    expect(result.current.stepIndex).toBe(6)
  })
```

Append these tests inside the `describe` block:

```ts
  it('jumpTo navigates to the review step', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.jumpTo('review'))
    expect(result.current.stepId).toBe('review')
    expect(result.current.stepIndex).toBe(6)
  })

  it('reaches review as the terminal step via next()', () => {
    const { result } = renderHook(() => useOnboardingState(5))
    act(() => result.current.next())
    expect(result.current.stepId).toBe('review')
  })

  it('setResumeImportId updates data', () => {
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.data.resumeImportId).toBeUndefined()
    act(() => result.current.setResumeImportId('imp-123'))
    expect(result.current.data.resumeImportId).toBe('imp-123')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn vitest run src/__tests__/features/onboarding/useOnboardingState.test.ts`
Expected: FAIL — `stepIndex` is 5 not 6, `stepId` not `'review'`, `setResumeImportId` is not a function.

- [ ] **Step 3: Add the `review` step to `types.ts`**

In `src/features/onboarding/components/onboarding/types.ts`:

Change the `StepId` union:

```ts
export type StepId = 'welcome' | 'portfolio' | 'resume' | 'connect' | 'repos' | 'processing' | 'review'
```

Append to the `STEPS` array (after the `processing` entry):

```ts
  { id: 'review',     name: 'Review',        required: true  },
```

Add to the `OnboardingData` interface (after `reposConnected: boolean`):

```ts
  resumeImportId?: string
```

- [ ] **Step 4: Wire state in `useOnboardingState.ts`**

In `src/features/onboarding/components/onboarding/useOnboardingState.ts`:

Add `review: 6` to the `STEP_INDEX` record:

```ts
const STEP_INDEX: Record<StepId, number> = {
  welcome:    0,
  portfolio:  1,
  resume:     2,
  connect:    3,
  repos:      4,
  processing: 5,
  review:     6,
}
```

Add this setter after `setReposConnected`:

```ts
  const setResumeImportId = useCallback((id: string) => {
    setData((d) => ({ ...d, resumeImportId: id }))
  }, [])
```

Add `setResumeImportId` to the returned object (after `setReposConnected`):

```ts
    setReposConnected,
    setResumeImportId,
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn vitest run src/__tests__/features/onboarding/useOnboardingState.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Commit**

Run `yarn test && yarn lint && yarn typecheck` (git-commit skill). All green, then:

```bash
git add src/features/onboarding/components/onboarding/types.ts src/features/onboarding/components/onboarding/useOnboardingState.ts src/__tests__/features/onboarding/useOnboardingState.test.ts
git commit -m "feat(onboarding): add terminal review step and resumeImportId state"
```

---

### Task 2: Create `ReviewStep` (moved Review + gap + enhance + saved)

**Files:**
- Create: `src/features/onboarding/components/steps/ReviewStep.tsx`
- Test: `src/__tests__/features/onboarding/ReviewStep.test.tsx`

This component is the verbatim Review/enhance/saved logic currently in
`ImportCareerStep` (lines 464–680 + supporting queries lines 117–148,
227–234, 250–259), reparented to take `importId` as a prop and own the
`/overview` navigation. The no-`importId` path renders a minimal finish
screen and fires no queries.

- [ ] **Step 1: Write the failing test (no-id path)**

Create `src/__tests__/features/onboarding/ReviewStep.test.tsx`:

```tsx
/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

import { ReviewStep } from '@/features/onboarding/components/steps/ReviewStep'

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ReviewStep', () => {
  it('renders the all-set finish screen when no importId is present', () => {
    renderWithClient(<ReviewStep importId={undefined} />)
    expect(screen.getByText(/you're all set/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /finish/i })).toBeTruthy()
  })

  it('navigates to /overview when Finish is clicked (no-id path)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    renderWithClient(<ReviewStep importId={undefined} />)
    await userEvent.click(screen.getByRole('button', { name: /finish/i }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/overview', replace: true })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run src/__tests__/features/onboarding/ReviewStep.test.tsx`
Expected: FAIL — cannot resolve `ReviewStep` (file does not exist).

- [ ] **Step 3: Create `ReviewStep.tsx`**

Create `src/features/onboarding/components/steps/ReviewStep.tsx` with this exact content:

```tsx
'use client'

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Briefcase,
  GraduationCap,
  Wrench,
  Award,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { adminKeys } from '@/lib/api/query-keys'
import {
  getImportProgressFn,
  getGapReportFn,
  listCareerEntriesFn,
  updateCareerEntryFn,
} from '@/server/resume-imports'
import type { CareerEntry } from '@/server/resume-imports'
import { EnhanceRoleCard } from './EnhanceRoleCard'
import { GapAnalysisReport } from './GapAnalysisReport'

type SubPhase = 'review' | 'enhance' | 'saved'

interface ReviewStepProps {
  readonly importId?: string
}

export function ReviewStep({ importId }: ReviewStepProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sub, setSub] = useState<SubPhase>('review')

  const finish = () => void navigate({ to: '/overview', replace: true })

  // Progress is read once to learn whether the gap report is ready.
  const { data: progress } = useQuery({
    queryKey: adminKeys.resumeImports.progress(importId ?? ''),
    queryFn:  () => getImportProgressFn({ data: importId as string }),
    enabled:  !!importId,
    staleTime: Infinity,
  })

  const { data: entries = [] } = useQuery<CareerEntry[]>({
    queryKey: adminKeys.resumeImports.entries(),
    queryFn:  () => listCareerEntriesFn({ data: {} }),
    enabled:  !!importId && sub === 'review',
    staleTime: Infinity,
  })

  const { data: gapReport = null } = useQuery({
    queryKey: adminKeys.resumeImports.gapReport(importId ?? ''),
    queryFn:  () => getGapReportFn({ data: importId as string }),
    enabled:  !!importId && sub === 'review' && progress?.gapReportReady === true,
    staleTime: Infinity,
  })

  const { data: enhancedEntries = [] } = useQuery<CareerEntry[]>({
    queryKey: adminKeys.resumeImports.entries('enhance'),
    queryFn:  () => listCareerEntriesFn({ data: {} }),
    enabled:  !!importId && sub === 'enhance',
    refetchInterval: (query) => {
      const all = query.state.data ?? []
      const experienceEntries = all.filter((e: CareerEntry) => e.entryType === 'experience')
      const allTerminal =
        experienceEntries.length > 0 &&
        experienceEntries.every((e: CareerEntry) =>
          ['complete', 'skipped', 'failed'].includes(e.enrichmentStatus),
        )
      return allTerminal ? false : 3_000
    },
  })

  async function handleSaveEntry(id: string, highlights: string[]) {
    const entry = enhancedEntries.find((e) => e.id === id)
    if (!entry) return
    const rawData = { ...(entry.rawData as Record<string, unknown>), highlights }
    await updateCareerEntryFn({ data: { id, rawData } })
    await queryClient.invalidateQueries({ queryKey: adminKeys.resumeImports.entries() })
    await queryClient.invalidateQueries({ queryKey: adminKeys.resumeImports.entries('enhance') })
  }

  // No resume was imported (user skipped Step 3) — nothing to review.
  if (!importId) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <p className="text-base font-semibold text-zinc-100">You're all set</p>
        <p className="max-w-sm text-sm text-zinc-500">
          Your workspace is ready. You can import your career history any time from your profile.
        </p>
        <Button variant="primary" onClick={finish} className="mt-2 flex items-center gap-1.5">
          Finish
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  const experienceEntries = entries.filter((e: CareerEntry) => e.entryType === 'experience')
  const educationEntries  = entries.filter((e: CareerEntry) => e.entryType === 'education')
  const skillEntries      = entries.filter((e: CareerEntry) => e.entryType === 'skill')
  const otherCount        = entries.filter((e: CareerEntry) =>
    !['experience', 'education', 'skill'].includes(e.entryType)
  ).length

  if (sub === 'saved') {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <p className="text-sm font-medium text-zinc-200">Career history imported</p>
        <p className="text-xs text-zinc-500">
          {experienceEntries.length} role{experienceEntries.length !== 1 ? 's' : ''} extracted.
          Enrichment continues in the background.
        </p>
        <Button variant="primary" onClick={finish} className="mt-3 flex items-center gap-1.5">
          Finish
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  if (sub === 'enhance') {
    const enhanceExperience = enhancedEntries.filter(
      (e: CareerEntry) => e.entryType === 'experience',
    )
    const allTerminal = enhanceExperience.every((e: CareerEntry) =>
      ['complete', 'skipped', 'failed'].includes(e.enrichmentStatus),
    )

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">Enhance your experience</h3>
          <p className="mt-1 text-sm text-zinc-500">
            We researched each role online. Review the suggestions, edit your highlights,
            and save — or skip to keep them as extracted.
          </p>
          {!allTerminal && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-indigo-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Researching remaining roles…
            </p>
          )}
        </div>

        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {enhanceExperience.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">
              No experience entries found.
            </div>
          ) : (
            enhanceExperience.map((entry: CareerEntry) => (
              <EnhanceRoleCard
                key={entry.id}
                entry={entry}
                onSave={handleSaveEntry}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <Button
            variant="ghost"
            onClick={() => setSub('review')}
            className="text-xs"
          >
            ← Back to review
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setSub('saved')}
              className="text-xs"
            >
              Skip enhancement
            </Button>
            <Button
              variant="primary"
              onClick={() => setSub('saved')}
              className="flex items-center gap-1.5"
            >
              Save &amp; continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Review extracted career history</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Tucaken extracted the following from your resume. You can edit individual entries later from your profile.
        </p>
      </div>

      <GapAnalysisReport report={gapReport} />

      <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">

        {experienceEntries.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Briefcase className="h-3.5 w-3.5" />
              Experience ({experienceEntries.length})
            </h4>
            <div className="space-y-2">
              {experienceEntries.map((entry) => {
                const d = entry.rawData as { title?: string; company?: string; period?: string; highlights?: string[] }
                return (
                  <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">{d.title ?? '—'}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{d.period ?? ''}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">{d.company ?? ''}</div>
                    {Array.isArray(d.highlights) && d.highlights.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-zinc-400 list-disc list-inside">
                        {d.highlights.slice(0, 2).map((h, i) => (
                          <li key={i} className="truncate">{h}</li>
                        ))}
                        {d.highlights.length > 2 && (
                          <li className="text-zinc-600">+{d.highlights.length - 2} more</li>
                        )}
                      </ul>
                    )}
                    {entry.enrichmentStatus === 'complete' && entry.enrichedData && (
                      <span className="mt-2 inline-block rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
                        AI enriched
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {educationEntries.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <GraduationCap className="h-3.5 w-3.5" />
              Education ({educationEntries.length})
            </h4>
            <div className="space-y-2">
              {educationEntries.map((entry) => {
                const d = entry.rawData as { degree?: string; institution?: string; period?: string }
                return (
                  <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">{d.degree ?? '—'}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{d.period ?? ''}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">{d.institution ?? ''}</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {skillEntries.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Wrench className="h-3.5 w-3.5" />
              Skills
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {skillEntries.flatMap((entry) => {
                const d = entry.rawData as { skills?: string[] }
                return d.skills ?? []
              }).slice(0, 20).map((skill, i) => (
                <span
                  key={i}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-zinc-300"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {otherCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-600">
            <Award className="h-3.5 w-3.5" />
            {otherCount} additional entr{otherCount === 1 ? 'y' : 'ies'} extracted (certifications, projects, achievements)
          </div>
        )}

        {entries.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">
            No entries extracted yet. Enrichment may still be running.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <Button
          variant="ghost"
          onClick={finish}
          className="text-xs"
        >
          Skip for now
        </Button>
        <Button
          variant="primary"
          onClick={() => setSub('enhance')}
          className="flex items-center gap-1.5"
        >
          Looks good
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/__tests__/features/onboarding/ReviewStep.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

Run `yarn test && yarn lint && yarn typecheck` (git-commit skill). All green, then:

```bash
git add src/features/onboarding/components/steps/ReviewStep.tsx src/__tests__/features/onboarding/ReviewStep.test.tsx
git commit -m "feat(onboarding): add ReviewStep for the terminal review/enhance page"
```

---

### Task 3: Shrink `ImportCareerStep` to upload + processing + complete

**Files:**
- Modify: `src/features/onboarding/components/steps/ImportCareerStep.tsx`

The step keeps `idle | requesting-url | uploading | processing | complete |
error`. On terminal progress it calls a new `onExtracted(importId)` prop,
shows a 100% ring + check for ~900ms, then calls `onNext()`. All
review/enhance/saved render blocks and their queries are removed (they now
live in `ReviewStep`).

- [ ] **Step 1: Update the `Phase` type and props**

In `src/features/onboarding/components/steps/ImportCareerStep.tsx`:

Replace the `Phase` type (lines 38–46) with:

```ts
type Phase =
  | 'idle'
  | 'requesting-url'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error'
```

Replace the `ImportCareerStepProps` interface (lines 70–73) with:

```ts
interface ImportCareerStepProps {
  readonly onNext: () => void
  readonly onSkip: () => void
  readonly onExtracted: (importId: string) => void
}
```

Replace the component signature line (line 75) with:

```ts
export function ImportCareerStep({ onNext, onSkip, onExtracted }: ImportCareerStepProps) {
```

- [ ] **Step 2: Remove the moved queries/handlers**

Delete these now-unused blocks:

- The `entries` query (lines 117–123).
- The `gapReport` query (lines 125–132).
- The `enhancedEntries` query (lines 134–148).
- The `handleSaveEntry` function (lines 227–234).
- The render-helper derivations `experienceEntries`/`educationEntries`/`skillEntries`/`otherCount` (lines 250–255).

Remove now-unused imports from the top of the file: `useQueryClient` (keep `useQuery`), `getGapReportFn`, `listCareerEntriesFn`, `updateCareerEntryFn`, `CareerEntry`, `EnhanceRoleCard`, `GapAnalysisReport`, and the icons `ChevronRight`, `Briefcase`, `GraduationCap`, `Wrench`, `Award`. Keep `getUploadUrlFn`, `completeUploadFn`, `getImportProgressFn`, `retryImportFn`, `ImportPhase`, `CheckCircle2`, `Upload`, `FileText`, `AlertCircle`, `SkipForward`, `Loader2`.

Remove the `const queryClient = useQueryClient()` line (line 85).

- [ ] **Step 3: Point the terminal transition at `onExtracted` + `complete`**

Replace the progress effect (lines 106–115) with:

```ts
  useEffect(() => {
    if (phase !== 'processing' || !progress) return
    if (progress.error) {
      setErrorMsg(progress.error.message || 'Extraction failed — please try a different file.')
      setPhase('error')
    } else if (progress.terminal && importId) {
      // terminal && no error ⇒ ready_for_review / completed
      onExtracted(importId)
      setPhase('complete')
    }
  }, [progress?.status, progress?.terminal, phase, importId, onExtracted])
```

- [ ] **Step 4: Replace the review/enhance/saved renders with a `complete` screen**

Delete the entire `if (phase === 'saved')` block (lines 464–475), the
entire `if (phase === 'enhance')` block (lines 477–545), and the final
`// ── review ──` `return (...)` block (lines 547–680, i.e. everything from
the `// ── review` comment to the closing of the component's last
`return`).

In their place — as the component's final `return`, after the
`if (phase === 'error')` block — add this `complete` screen:

```tsx
  // phase === 'complete' — ring filled, brief beat, then advance.
  return <CompleteScreen fileName={file?.name} onDone={onNext} />
```

- [ ] **Step 5: Add the `CompleteScreen` subcomponent**

At the end of the file (after the `ImportCareerStep` function closes), add:

```tsx
function CompleteScreen({
  fileName,
  onDone,
}: {
  readonly fileName?: string
  readonly onDone: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 900)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="space-y-8">
      <h3 className="text-3xl font-bold leading-[1.1] text-zinc-50 md:text-4xl">
        Import your career history
      </h3>
      <p className="text-lg font-semibold leading-snug text-emerald-300 md:text-xl">
        Career history extracted
      </p>

      <div className="mx-auto flex w-full max-w-[16rem] flex-col items-center gap-6 px-6 py-12">
        <div className="relative h-28 w-28">
          <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-90">
            <defs>
              <linearGradient id="proc-ring-done" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
            <circle
              cx="48"
              cy="48"
              r={RING_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="4"
            />
            <motion.circle
              cx="48"
              cy="48"
              r={RING_RADIUS}
              fill="none"
              stroke="url(#proc-ring-done)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              initial={{ strokeDashoffset: RING_CIRC }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ type: 'spring', bounce: 0.2, visualDuration: 0.6 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          </div>
        </div>

        <p className="w-full truncate text-center text-sm font-medium text-zinc-200">{fileName}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify typecheck + lint pass**

Run: `yarn typecheck`
Expected: no errors.

Run: `yarn lint src/features/onboarding/components/steps/ImportCareerStep.tsx`
Expected: 0 errors (pre-existing Tailwind canonical-class warnings are acceptable — they predate this work).

- [ ] **Step 7: Commit**

Run `yarn test && yarn lint && yarn typecheck` (git-commit skill). All green, then:

```bash
git add src/features/onboarding/components/steps/ImportCareerStep.tsx
git commit -m "refactor(onboarding): shrink ImportCareerStep to upload+processing+complete"
```

---

### Task 3.5: Preserve Settings resume-import review (second consumer)

**Added during execution:** `ImportCareerStep` has a second consumer,
`src/app/_dashboard.settings.github.tsx:150`, used as an "add resume"
panel (`onNext`/`onSkip` just call `setAddingResume(false)`). Task 3 made
`onExtracted` required and moved review/enhance out of `ImportCareerStep`,
which would leave that panel as upload-only. User decision: Settings keeps
full review/enhance parity via its own `ReviewStep`. This requires a
configurable finish action on `ReviewStep` (Settings must return to the
resumes list, not navigate to `/overview`).

**Files:**
- Modify: `src/features/onboarding/components/steps/ReviewStep.tsx`
- Modify: `src/__tests__/features/onboarding/ReviewStep.test.tsx`
- Modify: `src/app/_dashboard.settings.github.tsx`

- [ ] **Step 1: Add a failing test for the `onFinish` override**

In `src/__tests__/features/onboarding/ReviewStep.test.tsx`, append inside
the `describe`:

```tsx
  it('calls onFinish instead of navigating when onFinish is provided', async () => {
    const onFinish = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    renderWithClient(<ReviewStep importId={undefined} onFinish={onFinish} />)
    await userEvent.click(screen.getByRole('button', { name: /finish/i }))
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `yarn vitest run src/__tests__/features/onboarding/ReviewStep.test.tsx`
Expected: FAIL — `onFinish` is not a prop; navigate still called.

- [ ] **Step 3: Add the `onFinish` prop to `ReviewStep`**

In `src/features/onboarding/components/steps/ReviewStep.tsx`, change the
props interface:

```tsx
interface ReviewStepProps {
  readonly importId?: string
  /** Overrides the default "navigate to /overview" finish action. */
  readonly onFinish?: () => void
}
```

Change the component signature + `finish` definition:

```tsx
export function ReviewStep({ importId, onFinish }: ReviewStepProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sub, setSub] = useState<SubPhase>('review')

  const finish = onFinish ?? (() => void navigate({ to: '/overview', replace: true }))
```

(Everything else in `ReviewStep` is unchanged — all `onClick={finish}` /
`onClick={() => ...finish}` sites keep working.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run src/__tests__/features/onboarding/ReviewStep.test.tsx`
Expected: PASS (all `ReviewStep` tests, including the new one).

- [ ] **Step 5: Wire Settings to capture importId + render ReviewStep**

In `src/app/_dashboard.settings.github.tsx`:

Add the `ReviewStep` import next to the existing `ImportCareerStep` import
(line 7 area):

```tsx
import { ReviewStep } from '@/features/onboarding/components/steps/ReviewStep'
```

Find the component function that owns the `addingResume` state (it already
calls `setAddingResume`). Add local import-id state next to it:

```tsx
  const [resumeImportId, setResumeImportId] = useState<string | undefined>(undefined)
```

Replace the existing block (around lines 150–153):

```tsx
                <ImportCareerStep
                  onNext={() => setAddingResume(false)}
                  onSkip={() => setAddingResume(false)}
                />
```

with:

```tsx
                {resumeImportId ? (
                  <ReviewStep
                    importId={resumeImportId}
                    onFinish={() => { setResumeImportId(undefined); setAddingResume(false) }}
                  />
                ) : (
                  <ImportCareerStep
                    onNext={() => setAddingResume(false)}
                    onSkip={() => setAddingResume(false)}
                    onExtracted={setResumeImportId}
                  />
                )}
```

Note: `ImportCareerStep`'s `complete` phase calls `onExtracted(id)` then
`onNext()` after ~900ms. Here `onExtracted` sets `resumeImportId`, which
swaps the panel to `<ReviewStep>`; the subsequent `onNext()`
(`setAddingResume(false)`) is rendered moot because `ReviewStep` has
already replaced the subtree and `addingResume` only gates the outer panel
— verify in manual testing (Task 6) that the Settings panel shows
ReviewStep after extraction and its Finish returns to the resumes list.
If the `onNext` close fires destructively, change Settings `onNext` to a
no-op `() => {}` (the panel is closed by `ReviewStep`'s `onFinish`
instead).

- [ ] **Step 6: Verify gates**

Run: `yarn typecheck`
Expected: errors ONLY in `OnboardingShell.tsx` (still missing
`onExtracted`, fixed in Task 5). No `_dashboard.settings.github.tsx`
errors, no `ReviewStep` errors.

Run: `yarn test`
Expected: PASS (full suite, including new `ReviewStep` test).

Run: `yarn lint`
Expected: 0 errors (pre-existing warnings acceptable).

- [ ] **Step 7: Commit**

Tests + lint green; typecheck has only the expected single OnboardingShell
error (resolved Task 5). Then:

```bash
git add src/features/onboarding/components/steps/ReviewStep.tsx src/__tests__/features/onboarding/ReviewStep.test.tsx src/app/_dashboard.settings.github.tsx
git commit -m "feat(settings): keep resume-import review via ReviewStep onFinish"
```

No Co-Authored-By / AI trailer. Conventional Commits. Stage only the 3
listed files.

---

### Task 4: `ProcessingStep` advances via `onNext` instead of redirecting

**Files:**
- Modify: `src/features/onboarding/components/steps/ProcessingStep.tsx`

- [ ] **Step 1: Replace the navigate call with an `onNext` prop**

Replace the entire contents of
`src/features/onboarding/components/steps/ProcessingStep.tsx` with:

```tsx
// src/features/onboarding/components/steps/ProcessingStep.tsx
//
// Onboarding step 5 — polls repo sync status and advances to the terminal
// review step once all connected repos reach a terminal state (complete or
// error). No user controls — StepFooter is suppressed for this step by
// OnboardingShell.

import { useEffect } from 'react'
import { motion } from 'motion/react'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'

const TERMINAL_STATUSES = new Set(['complete', 'error'])

interface ProcessingStepProps {
  readonly onNext: () => void
}

export function ProcessingStep({ onNext }: ProcessingStepProps) {
  const { data: connectedRepos } = useGitHubConnectedRepos()

  useEffect(() => {
    if (!connectedRepos || connectedRepos.length === 0) return
    const allTerminal = connectedRepos.every((r) => TERMINAL_STATUSES.has(r.syncStatus))
    if (allTerminal) onNext()
  }, [connectedRepos, onNext])

  return (
    <div className="flex h-120 flex-col items-center justify-center gap-6 text-center">
      <div className="relative">
        <motion.div
          className="size-16 rounded-full border-2 border-teal-400/20"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ willChange: 'transform' }}
        />
        <motion.div
          className="absolute inset-0 m-auto size-10 rounded-full bg-teal-500/20 ring-1 ring-teal-400/30"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ willChange: 'opacity' }}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-zinc-100">Indexing your repositories…</p>
        <p className="text-xs text-zinc-500">This usually takes a minute or two</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `yarn typecheck`
Expected: errors ONLY in `OnboardingShell.tsx` (it still renders
`<ProcessingStep />` without the new required `onNext` prop). Fixed in
Task 5.

- [ ] **Step 3: Commit**

Defer the commit — `ProcessingStep` and `OnboardingShell` change together
and the tree must stay green. Proceed directly to Task 5 and commit them
as one unit there.

---

### Task 5: Wire the new flow in `OnboardingShell`

**Files:**
- Modify: `src/features/onboarding/components/onboarding/OnboardingShell.tsx`

- [ ] **Step 1: Import `ReviewStep`**

Add after the `ProcessingStep` import (line 12):

```ts
import { ReviewStep } from '../steps/ReviewStep'
```

- [ ] **Step 2: Treat `review` like `processing` for chrome**

Replace the `isProcessing` line (line 77) with:

```ts
  const isProcessing = s.stepId === 'processing'
  const isTerminal = isProcessing || s.stepId === 'review'
```

Replace the badge expression (line 88) — the `{isProcessing ? 'Setting up…' : 'Get started'}` — with:

```tsx
              {isTerminal ? (isProcessing ? 'Setting up…' : 'Almost done') : 'Get started'}
```

Replace the progress-bar guard (line 91) — `{!isProcessing && (` — with:

```tsx
          {!isTerminal && (
```

- [ ] **Step 3: Pass `onExtracted` to `ImportCareerStep`**

Replace the `resume` step render (lines 124–126) with:

```tsx
                {s.stepId === 'resume' && (
                  <ImportCareerStep
                    onNext={s.next}
                    onSkip={s.next}
                    onExtracted={s.setResumeImportId}
                  />
                )}
```

- [ ] **Step 4: Pass `onNext` to `ProcessingStep` and render `ReviewStep`**

Replace the processing step render (line 150) with:

```tsx
                {s.stepId === 'processing' && <ProcessingStep onNext={s.next} />}

                {s.stepId === 'review' && (
                  <ReviewStep importId={s.data.resumeImportId} />
                )}
```

- [ ] **Step 5: Verify typecheck + lint pass**

Run: `yarn typecheck`
Expected: no errors.

Run: `yarn lint`
Expected: 0 errors (125 pre-existing warnings acceptable).

- [ ] **Step 6: Run the full test suite**

Run: `yarn test`
Expected: PASS — all test files, including the extended
`useOnboardingState.test.ts` and new `ReviewStep.test.tsx`.

- [ ] **Step 7: Commit**

Run `yarn test && yarn lint && yarn typecheck` (git-commit skill). All green, then:

```bash
git add src/features/onboarding/components/steps/ProcessingStep.tsx src/features/onboarding/components/onboarding/OnboardingShell.tsx
git commit -m "feat(onboarding): route processing into the terminal review step"
```

---

### Task 6: Manual verification under dev-mock

**Files:** none (verification only).

- [ ] **Step 1: Lower the dev-mock processing window for a fast loop**

In `src/server/_dev-mock.ts`, temporarily set `PROCESSING_MS = 8_000`
(restore to the troubleshooting value or revert before shipping — see the
spec "Out of scope" note).

- [ ] **Step 2: Run the mocked dev server**

Run: `just dev-mock`

- [ ] **Step 3: Walk the flow**

1. Sign up (any email/strong password) → land on `/onboarding`.
2. Welcome → Portfolio → on Resume step, upload any `.pdf`.
3. Confirm: processing screen with the gradient ring; on completion the
   ring fills to a full circle with a check, then it auto-advances to the
   Connect step (Step 4) — NO inline "Review extracted career history".
4. Connect GitHub (mock) → Repositories → continue.
5. Processing ("Indexing your repositories…") → it advances to the new
   Review step (badge reads "Almost done", no progress bar).
6. Confirm Review list + gap report render; "Looks good" → Enhance →
   "Save & continue" → "Career history imported" → "Finish" navigates to
   `/overview`.
7. Re-run, this time **Skip** the resume step; confirm the final Review
   step shows "You're all set" + Finish → `/overview`, with no errors in
   the console.

- [ ] **Step 4: Revert the dev-mock knob**

Restore `PROCESSING_MS` in `src/server/_dev-mock.ts` to its prior value.
Do not commit `_dev-mock.ts` as part of this feature unless the team wants
the mock walk retained; it is dev-only and tracked separately.

---

## Self-Review

**Spec coverage:**
- New `review` terminal step after `processing` → Task 1 (types/state), Task 5 (shell render). ✓
- Scope moved = Review + gap + enhance → Task 2 (`ReviewStep` contains all three). ✓
- `ProcessingStep` no longer redirects to `/overview`; `ReviewStep` owns Finish → `/overview` → Task 4 + Task 2. ✓
- Extraction blocks Step 3; ring to 100% + completion beat then advance → Task 3 (`complete` phase + `CompleteScreen`, 900ms). ✓
- State lifting `resumeImportId` + `setResumeImportId` → Task 1; consumed Task 5/Task 2. ✓
- Skip path (no importId) → Task 2 no-id branch + Task 2 test + Task 6 step 7. ✓
- Smooth transition reuses existing `AnimatePresence` keyed by `stepId` → unchanged in Task 5; completion beat in Task 3. ✓
- Testing: `useOnboardingState` extended (Task 1), `ReviewStep` no-id + navigate (Task 2). Heavy RTL tests for `ImportCareerStep`/`ProcessingStep` deliberately omitted — the repo has no component-test precedent for motion + TanStack server-fn components; typecheck + the Task 6 manual script cover those. This is a conscious YAGNI scope call, consistent with the spec's testing section. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". All code blocks are complete and verbatim-usable.

**Type consistency:** `onExtracted: (importId: string) => void` defined Task 3, supplied as `s.setResumeImportId` (`(id: string) => void`) Task 5 — signatures match. `ReviewStep` prop `importId?: string` (Task 2) matches `s.data.resumeImportId?: string` (Task 1) supplied Task 5. `ProcessingStep` `onNext: () => void` (Task 4) supplied `s.next` (Task 5). `RING_RADIUS`/`RING_CIRC`/`motion`/`CheckCircle2` used by `CompleteScreen` remain imported in `ImportCareerStep` after Task 2's import pruning (explicitly kept). Query keys/server fns match `adminKeys.resumeImports.*` and `@/server/resume-imports` exports verified against the current codebase.
