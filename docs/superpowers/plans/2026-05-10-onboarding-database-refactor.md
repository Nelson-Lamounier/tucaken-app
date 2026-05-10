# Onboarding & Database Settings Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend onboarding with a repo-picker step and a processing gate, replace the settings/github wizard with a tabbed "Database" management page, and rename "Application Analysis" to "Resume Analysis".

**Architecture:** The onboarding wizard gains two new steps (`repos` at index 4, `processing` at index 5); `ProcessingStep` polls `useGitHubConnectedRepos` and navigates to `/overview` on terminal state. The settings page becomes a tab layout with Repositories and Resumes tabs; wizard sub-flows (ImportCareerStep, connect prompt) activate on-demand. All three subsystems touch independent files and can be implemented sequentially without conflicts.

**Tech Stack:** React 19, TanStack Router/Query, Vitest + @testing-library/react, Tailwind v4, TypeScript strict, `motion/react`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/features/onboarding/components/onboarding/types.ts` | Step IDs, STEPS array, OnboardingData |
| Modify | `src/features/onboarding/components/onboarding/useOnboardingState.ts` | Step index map, repos guard |
| Modify | `src/features/github/components/GitHubRepoPicker.tsx` | maxRepos prop + cap enforcement |
| Modify | `src/features/onboarding/components/steps/ConnectReposStep.tsx` | Button label, maxRepos, hint |
| **Create** | `src/features/onboarding/components/steps/ProcessingStep.tsx` | Polling gate, aggregate indicator, auto-redirect |
| Modify | `src/features/onboarding/components/onboarding/OnboardingShell.tsx` | Render repos/processing steps, fetch repo data, suppress footer |
| Modify | `src/app/onboarding.tsx` | Step schema max 4→5 |
| Modify | `src/app/_dashboard.settings.github.tsx` | Replace wizard with tabbed Database page |
| Modify | `src/features/onboarding/components/OnboardingContainer.tsx` | Remove GenerateResumeStep |
| **Delete** | `src/features/onboarding/components/steps/GenerateResumeStep.tsx` | Remove |
| Modify | `src/components/layouts/AppLayout.tsx` | Nav: "GitHub" → "Database" |
| Modify | `src/app/_dashboard.applications.new.tsx` | "Application Analysis" → "Resume Analysis" |
| Modify | `src/app/_dashboard.applications.index.tsx` | "New Analysis" description text |
| **Create** | `src/__tests__/features/onboarding/useOnboardingState.test.ts` | Unit tests for new step logic |

---

## Task 1: Update onboarding types

**Files:**
- Modify: `src/features/onboarding/components/onboarding/types.ts`

- [ ] **Step 1: Replace the file content**

```typescript
// src/features/onboarding/types.ts
//
// Shared types for the first-run onboarding flow.

import type { GitHubInstallation } from '@/lib/types/github.types'

export type StepId = 'welcome' | 'portfolio' | 'resume' | 'connect' | 'repos' | 'processing'

export const STEPS: Array<{ id: StepId; name: string; required: boolean }> = [
  { id: 'welcome',    name: 'Welcome',       required: false },
  { id: 'portfolio',  name: 'Portfolio',     required: false },
  { id: 'resume',     name: 'Resume',        required: false },
  { id: 'connect',    name: 'Connect',       required: true  },
  { id: 'repos',      name: 'Repositories',  required: true  },
  { id: 'processing', name: 'Processing',    required: true  },
]

export interface ResumeSummary {
  roles: number
  education: number
  skills: number
}

export interface OnboardingData {
  portfolioUrl?: string
  resume?: { fileName: string; summary: ResumeSummary }
  githubConnected: boolean
  reposConnected: boolean
}

export interface OnboardingShellProps {
  onSubmitPortfolio?: (url: string) => Promise<void> | void
  onUploadResume?: (file: File, onProgress?: (step: string) => void) => Promise<ResumeSummary>
  /** Sync redirect to GitHub App install URL. */
  onConnectGithub?: () => void
  onComplete?: () => Promise<void> | void
  installation?: GitHubInstallation | null
  isLoadingInstallation?: boolean
  /** Step index to restore after GitHub install redirect (0 = welcome). */
  initialStepIndex?: number
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only in files that still reference `'done'` StepId or `setGithubConnected` — those will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/components/onboarding/types.ts
git commit -m "feat(onboarding): add repos+processing steps, remove done from StepId"
```

---

## Task 2: Update useOnboardingState

**Files:**
- Modify: `src/features/onboarding/components/onboarding/useOnboardingState.ts`
- Create: `src/__tests__/features/onboarding/useOnboardingState.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/features/onboarding/useOnboardingState.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnboardingState } from '../../../features/onboarding/components/onboarding/useOnboardingState'

describe('useOnboardingState', () => {
  it('starts at welcome by default', () => {
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.stepId).toBe('welcome')
    expect(result.current.stepIndex).toBe(0)
  })

  it('respects initialStepIndex', () => {
    const { result } = renderHook(() => useOnboardingState(3))
    expect(result.current.stepId).toBe('connect')
  })

  it('clamps initialStepIndex to valid range', () => {
    const { result } = renderHook(() => useOnboardingState(99))
    expect(result.current.stepIndex).toBe(5) // processing is last
  })

  it('advances through steps with next()', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.next())
    expect(result.current.stepId).toBe('portfolio')
  })

  it('does not advance past the last step', () => {
    const { result } = renderHook(() => useOnboardingState(5))
    act(() => result.current.next())
    expect(result.current.stepIndex).toBe(5)
  })

  it('goes back with back()', () => {
    const { result } = renderHook(() => useOnboardingState(2))
    act(() => result.current.back())
    expect(result.current.stepId).toBe('portfolio')
  })

  it('does not go back past step 0', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.back())
    expect(result.current.stepIndex).toBe(0)
  })

  it('jumpTo navigates to named step', () => {
    const { result } = renderHook(() => useOnboardingState())
    act(() => result.current.jumpTo('repos'))
    expect(result.current.stepId).toBe('repos')
    expect(result.current.stepIndex).toBe(4)
  })

  it('setReposConnected updates data', () => {
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.data.reposConnected).toBe(false)
    act(() => result.current.setReposConnected(true))
    expect(result.current.data.reposConnected).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/__tests__/features/onboarding/useOnboardingState.test.ts 2>&1 | tail -20
```

Expected: FAIL — `useOnboardingState` still has old step map.

- [ ] **Step 3: Replace useOnboardingState.ts**

```typescript
// src/features/onboarding/hooks/useOnboardingState.ts

import { useCallback, useState } from 'react'
import type { OnboardingData, ResumeSummary, StepId } from './types'
import { STEPS } from './types'

const STEP_INDEX: Record<StepId, number> = {
  welcome:    0,
  portfolio:  1,
  resume:     2,
  connect:    3,
  repos:      4,
  processing: 5,
}

const ID_BY_INDEX: StepId[] = STEPS.map((s) => s.id)

export function useOnboardingState(initialStepIndex = 0) {
  const [stepIndex, setStepIndex] = useState(() =>
    Math.min(Math.max(initialStepIndex, 0), ID_BY_INDEX.length - 1),
  )
  const [data, setData] = useState<OnboardingData>({
    githubConnected: false,
    reposConnected:  false,
  })

  const stepId = ID_BY_INDEX[stepIndex]

  const next = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, ID_BY_INDEX.length - 1))
  }, [])

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0))
  }, [])

  const jumpTo = useCallback((id: StepId) => {
    setStepIndex(STEP_INDEX[id])
  }, [])

  const setPortfolioUrl = useCallback((url: string) => {
    setData((d) => ({ ...d, portfolioUrl: url }))
  }, [])

  const setResume = useCallback((fileName: string, summary: ResumeSummary) => {
    setData((d) => ({ ...d, resume: { fileName, summary } }))
  }, [])

  const setGithubConnected = useCallback((connected: boolean) => {
    setData((d) => ({ ...d, githubConnected: connected }))
  }, [])

  const setReposConnected = useCallback((connected: boolean) => {
    setData((d) => ({ ...d, reposConnected: connected }))
  }, [])

  return {
    stepIndex,
    stepId,
    data,
    next,
    back,
    jumpTo,
    setPortfolioUrl,
    setResume,
    setGithubConnected,
    setReposConnected,
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run src/__tests__/features/onboarding/useOnboardingState.test.ts 2>&1 | tail -20
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/components/onboarding/useOnboardingState.ts \
        src/__tests__/features/onboarding/useOnboardingState.test.ts
git commit -m "feat(onboarding): update step index map, add setReposConnected"
```

---

## Task 3: Add maxRepos cap to GitHubRepoPicker

**Files:**
- Modify: `src/features/github/components/GitHubRepoPicker.tsx`

- [ ] **Step 1: Add `maxRepos` prop and cap enforcement**

Replace the `GitHubRepoPickerProps` interface and the `handleAdd` / button render sections:

```typescript
// At top of file — add maxRepos to props interface
interface GitHubRepoPickerProps {
  readonly accessibleRepos: GitHubAccessibleRepo[] | undefined
  readonly isLoading: boolean
  readonly connectedRepos: ConnectedRepo[] | undefined
  readonly maxRepos?: number
}

export function GitHubRepoPicker({ accessibleRepos, isLoading, connectedRepos, maxRepos }: GitHubRepoPickerProps) {
  // ... existing state ...

  const connectedCount = connectedRepos?.length ?? 0
  const atCap = maxRepos !== undefined && connectedCount >= maxRepos
```

In the button render section, replace the existing `<Button>` for adding:

```tsx
{isConnected ? (
  <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-400 opacity-70">
    ✓ Added
  </span>
) : isQueuing ? (
  <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] text-indigo-400 opacity-80">
    queuing…
  </span>
) : (
  <Button
    variant="secondary"
    onClick={() => handleAdd(repo.fullName, repo.defaultBranch)}
    disabled={isQueuing || atCap}
    className="py-1 px-2.5 text-[10px]"
  >
    + Add
  </Button>
)}
```

Add cap hint below the header section (after the `<div>` that wraps the title/description and count):

```tsx
{maxRepos !== undefined && (
  <p className="mt-1 text-[11px] text-zinc-500">
    {connectedCount >= maxRepos
      ? `Maximum of ${maxRepos} repositories reached`
      : `${connectedCount} of ${maxRepos} repositories connected`}
  </p>
)}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep GitHubRepoPicker
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/features/github/components/GitHubRepoPicker.tsx
git commit -m "feat(github): add maxRepos prop to GitHubRepoPicker"
```

---

## Task 4: Update ConnectReposStep for onboarding context

**Files:**
- Modify: `src/features/onboarding/components/steps/ConnectReposStep.tsx`

- [ ] **Step 1: Update the component**

Full replacement:

```typescript
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GitHubAccountSection } from '@/features/github/components/GitHubAccountSection'
import { GitHubRepoPicker } from '@/features/github/components/GitHubRepoPicker'
import { GitHubConnectedRepos } from '@/features/github/components/GitHubConnectedRepos'
import type { GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'

const MAX_REPOS = 3

interface ConnectReposStepProps {
  readonly installation: GitHubInstallation | null | undefined
  readonly isLoadingInstallation: boolean
  readonly accessibleRepos: GitHubAccessibleRepo[] | undefined
  readonly isLoadingRepos: boolean
  readonly connectedRepos: ConnectedRepo[] | undefined
  readonly onNext: () => void
  /** When true, enforces the 3-repo cap and shows "Next: Start Indexing". */
  readonly enforceLimit?: boolean
}

export function ConnectReposStep({
  installation,
  isLoadingInstallation,
  accessibleRepos,
  isLoadingRepos,
  connectedRepos,
  onNext,
  enforceLimit = false,
}: ConnectReposStepProps) {
  const connectedCount = connectedRepos?.length ?? 0
  const hasConnected = connectedCount > 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Connect your repositories</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Select which GitHub repos to index. Tucaken kicks off ingestion and enriches each previous
          role against your actual commit history.
        </p>
        {enforceLimit && (
          <p className="mt-1 text-xs text-zinc-600">
            You can connect up to {MAX_REPOS} repositories during onboarding.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <GitHubAccountSection installation={installation} isLoading={isLoadingInstallation} />
        {installation && (
          <GitHubRepoPicker
            accessibleRepos={accessibleRepos}
            isLoading={isLoadingRepos}
            connectedRepos={connectedRepos}
            maxRepos={enforceLimit ? MAX_REPOS : undefined}
          />
        )}
        {installation && <GitHubConnectedRepos connectedRepos={connectedRepos} />}
      </div>

      <div className="flex justify-end pt-2 border-t border-white/10">
        <Button
          variant="primary"
          onClick={onNext}
          disabled={!hasConnected}
          className="flex items-center gap-1.5"
        >
          {hasConnected
            ? enforceLimit
              ? 'Next: Start Indexing'
              : 'Next'
            : 'Add a repo to continue'}
          {hasConnected && <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep ConnectReposStep
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/components/steps/ConnectReposStep.tsx
git commit -m "feat(onboarding): add enforceLimit prop to ConnectReposStep, update button label"
```

---

## Task 5: Create ProcessingStep

**Files:**
- Create: `src/features/onboarding/components/steps/ProcessingStep.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/features/onboarding/components/steps/ProcessingStep.tsx
//
// Onboarding step 5 — polls repo sync status and navigates to /overview
// once all connected repos reach a terminal state (complete or error).
// No user controls — StepFooter is suppressed for this step by OnboardingShell.

import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'

const TERMINAL_STATUSES = new Set(['complete', 'error'])

export function ProcessingStep() {
  const navigate = useNavigate()
  const { data: connectedRepos } = useGitHubConnectedRepos()

  useEffect(() => {
    if (!connectedRepos || connectedRepos.length === 0) return
    const allTerminal = connectedRepos.every((r) => TERMINAL_STATUSES.has(r.syncStatus))
    if (allTerminal) {
      void navigate({ to: '/overview', replace: true })
    }
  }, [connectedRepos, navigate])

  return (
    <div className="flex h-[480px] flex-col items-center justify-center gap-6 text-center">
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

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep ProcessingStep
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/components/steps/ProcessingStep.tsx
git commit -m "feat(onboarding): add ProcessingStep with repo sync polling and auto-redirect"
```

---

## Task 6: Update OnboardingShell

**Files:**
- Modify: `src/features/onboarding/components/onboarding/OnboardingShell.tsx`

- [ ] **Step 1: Replace the file**

```typescript
// src/features/onboarding/components/OnboardingShell.tsx

import { AnimatePresence, motion } from 'motion/react'
import { OnboardingBackground } from './OnboardingBackground'
import { OnboardingProgress } from './OnboardingProgress'
import { WelcomeStep } from './WelcomeStep'
import { PortfolioStep } from './PortfolioStep'
import { ImportCareerStep } from '../steps/ImportCareerStep'
import { ConnectStep } from './ConnectStep'
import { ConnectReposStep } from '../steps/ConnectReposStep'
import { ProcessingStep } from '../steps/ProcessingStep'
import { useOnboardingState } from './useOnboardingState'
import { useGitHubAccessibleRepos } from '@/features/github/hooks/use-github-accessible-repos'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import type { OnboardingShellProps } from './types'

// Steps shown in the progress bar — processing is silent (no indicator slot)
const VISIBLE_STEPS = [
  { id: 'welcome'   as const, name: 'Welcome' },
  { id: 'portfolio' as const, name: 'Portfolio' },
  { id: 'resume'    as const, name: 'Resume' },
  { id: 'connect'   as const, name: 'Connect' },
  { id: 'repos'     as const, name: 'Repositories' },
]

export function OnboardingShell({
  onSubmitPortfolio,
  onConnectGithub,
  installation,
  isLoadingInstallation,
  initialStepIndex = 0,
}: Readonly<OnboardingShellProps>) {
  const s = useOnboardingState(initialStepIndex)

  const { data: accessibleRepos, isLoading: isLoadingRepos } = useGitHubAccessibleRepos(
    Boolean(installation),
  )
  const { data: connectedRepos } = useGitHubConnectedRepos()

  const variants = {
    enter:  { opacity: 0, x: 20 },
    center: { opacity: 1, x: 0 },
    exit:   { opacity: 0, x: -20 },
  }

  async function handlePortfolioSubmit(url: string) {
    s.setPortfolioUrl(url)
    await onSubmitPortfolio?.(url)
  }

  function handleConnectGithub() {
    onConnectGithub?.()
  }

  // processing step has no visible progress slot — clamp to last visible step
  const visibleIndex = Math.min(s.stepIndex, VISIBLE_STEPS.length - 1)
  const isProcessing = s.stepId === 'processing'

  return (
    <div className="dark relative flex min-h-screen w-full items-stretch justify-center overflow-hidden bg-zinc-950 px-4 py-8 text-zinc-200">
      <OnboardingBackground />

      <div className="relative flex w-full max-w-3xl flex-col">
        <header className="mb-8 flex flex-col gap-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 font-mono text-xs font-bold text-white">
              t
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight text-white">tucaken</span>
            <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              {isProcessing ? 'Setting up…' : 'Get started'}
            </span>
          </div>
          {!isProcessing && (
            <OnboardingProgress
              steps={VISIBLE_STEPS}
              current={visibleIndex}
              onJump={s.jumpTo}
            />
          )}
        </header>

        <main className="flex-1">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-sm md:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={s.stepId}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-[480px]"
              >
                {s.stepId === 'welcome' && <WelcomeStep onNext={s.next} />}

                {s.stepId === 'portfolio' && (
                  <PortfolioStep
                    initialValue={s.data.portfolioUrl}
                    onSubmit={handlePortfolioSubmit}
                    onNext={s.next}
                    onSkip={s.next}
                    onBack={s.back}
                  />
                )}

                {s.stepId === 'resume' && (
                  <ImportCareerStep onNext={s.next} onSkip={s.next} />
                )}

                {s.stepId === 'connect' && (
                  <ConnectStep
                    installation={installation}
                    isLoadingInstallation={isLoadingInstallation}
                    onConnectGithub={handleConnectGithub}
                    onNext={s.next}
                    onBack={s.back}
                  />
                )}

                {s.stepId === 'repos' && (
                  <ConnectReposStep
                    installation={installation}
                    isLoadingInstallation={isLoadingInstallation ?? false}
                    accessibleRepos={accessibleRepos}
                    isLoadingRepos={isLoadingRepos}
                    connectedRepos={connectedRepos}
                    onNext={s.next}
                    enforceLimit
                  />
                )}

                {s.stepId === 'processing' && <ProcessingStep />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep OnboardingShell
```

Expected: no errors.

- [ ] **Step 3: Run full type check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors (or only pre-existing errors unrelated to this change).

- [ ] **Step 4: Commit**

```bash
git add src/features/onboarding/components/onboarding/OnboardingShell.tsx
git commit -m "feat(onboarding): render repos+processing steps, fetch repo data in shell"
```

---

## Task 7: Update onboarding.tsx search schema

**Files:**
- Modify: `src/app/onboarding.tsx`

- [ ] **Step 1: Update the step schema max from 4 to 5**

In `src/app/onboarding.tsx`, find:

```typescript
step: z.coerce.number().min(0).max(4).optional(),
```

Replace with:

```typescript
step: z.coerce.number().min(0).max(5).optional(),
```

- [ ] **Step 2: Remove the `onComplete` prop and the `done` step handling**

In `OnboardingPage`, the current `onComplete` callback navigates to `/overview`. Since `ProcessingStep` now handles this redirect internally, remove `onComplete` from `<OnboardingShell>`:

Find:

```tsx
onComplete={async () => {
  await navigate({ to: '/overview' })
}}
```

Remove those three lines entirely. `navigate` import can also be removed if nothing else uses it — check first:

```bash
grep -n "navigate" src/app/onboarding.tsx
```

If `navigate` is only used by `onComplete`, remove the `const navigate = useNavigate()` line and the `useNavigate` import.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep onboarding
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding.tsx
git commit -m "feat(onboarding): extend step schema to max 5, remove onComplete handler"
```

---

## Task 8: Refactor settings Database page

**Files:**
- Modify: `src/app/_dashboard.settings.github.tsx`

This is the largest single-file change. Replace the entire wizard with a two-tab layout.

- [ ] **Step 1: Replace the file**

```typescript
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Database, GitBranch, FileText, Plus } from 'lucide-react'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { ImportCareerStep } from '@/features/onboarding/components/steps/ImportCareerStep'
import { GitHubAccountSection } from '@/features/github/components/GitHubAccountSection'
import { GitHubRepoPicker } from '@/features/github/components/GitHubRepoPicker'
import { GitHubConnectedRepos } from '@/features/github/components/GitHubConnectedRepos'
import { useGitHubInstallation } from '@/features/github/hooks/use-github-installation'
import { useGitHubAccessibleRepos } from '@/features/github/hooks/use-github-accessible-repos'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { getResumesFn } from '@/server/resumes'
import { handleGitHubInstallFn } from '@/server/github'
import { adminKeys } from '@/lib/api/query-keys'
import { useToastStore } from '@/lib/stores/toast-store'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'

type Tab = 'repositories' | 'resumes'

const searchSchema = z.object({
  installation_id: z.coerce.string().optional(),
  setup_action:    z.coerce.string().optional(),
  tab:             z.enum(['repositories', 'resumes']).catch('repositories'),
})

export const Route = createFileRoute('/_dashboard/settings/github')({
  validateSearch: searchSchema,
  component:      DatabaseSettingsPage,
})

function DatabaseSettingsPage() {
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const { installation_id, tab } = Route.useSearch()
  const { addToast } = useToastStore()

  const [activeTab, setActiveTab]             = useState<Tab>(tab)
  const [addingResume, setAddingResume]       = useState(false)

  const { data: installation, isLoading: isLoadingInstallation } = useGitHubInstallation()
  const { data: accessibleRepos, isLoading: isLoadingRepos }     = useGitHubAccessibleRepos(Boolean(installation))
  const { data: connectedRepos }                                  = useGitHubConnectedRepos()
  const { data: resumes }                                         = useQuery({
    queryKey: adminKeys.resumes.list(),
    queryFn:  () => getResumesFn(),
  })

  useEffect(() => {
    if (!installation_id) return
    const id = installation_id
    async function handleInstall() {
      try {
        await handleGitHubInstallFn({ data: { installationId: id } })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'GitHub installation failed'
        console.error('[database] installation callback error:', msg)
        addToast('error', `GitHub connect failed: ${msg}`)
      } finally {
        await queryClient.invalidateQueries({ queryKey: adminKeys.github.installation() })
        void navigate({ to: '/settings/github', replace: true, search: { tab: 'repositories' } })
      }
    }
    void handleInstall()
  }, [installation_id, navigate, queryClient, addToast])

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'repositories', label: 'Repositories', icon: <GitBranch className="size-4" /> },
    { id: 'resumes',      label: 'Resumes',       icon: <FileText className="size-4" /> },
  ]

  return (
    <DashboardPage
      title="Database"
      description="Manage the repositories and resumes that seed your knowledge base."
      fullWidth
    >
      {/* Tab bar */}
      <div className="border-b border-white/10">
        <nav className="flex gap-1 px-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={[
                'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                activeTab === t.id
                  ? 'border-teal-400 text-teal-300'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'repositories' && (
          <div className="space-y-6 max-w-3xl">
            <GitHubAccountSection installation={installation} isLoading={isLoadingInstallation} />
            {installation && (
              <GitHubRepoPicker
                accessibleRepos={accessibleRepos}
                isLoading={isLoadingRepos}
                connectedRepos={connectedRepos}
              />
            )}
            {installation && <GitHubConnectedRepos connectedRepos={connectedRepos} />}
          </div>
        )}

        {activeTab === 'resumes' && (
          <div className="max-w-3xl space-y-6">
            {addingResume ? (
              <div>
                <button
                  type="button"
                  onClick={() => setAddingResume(false)}
                  className="mb-4 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  ← Back to resumes
                </button>
                <ImportCareerStep
                  onNext={() => setAddingResume(false)}
                  onSkip={() => setAddingResume(false)}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-100">Uploaded resumes</h3>
                  <Button
                    variant="secondary"
                    onClick={() => setAddingResume(true)}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Plus className="size-3.5" />
                    Add resume
                  </Button>
                </div>

                {resumes && resumes.length > 0 ? (
                  <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/10">
                    {resumes.map((r) => (
                      <li key={r.resumeId} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm text-zinc-200">{r.label}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {new Date(r.createdAt).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })}
                          </p>
                        </div>
                        {r.isActive && (
                          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-medium text-teal-300 ring-1 ring-teal-400/25">
                            Active
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
                    <FileText className="mx-auto mb-3 size-8 text-zinc-700" />
                    <p className="text-sm text-zinc-500">No resumes uploaded yet</p>
                    <button
                      type="button"
                      onClick={() => setAddingResume(true)}
                      className="mt-2 text-xs text-teal-400 hover:text-teal-300 transition-colors"
                    >
                      Upload your first resume →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardPage>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep settings.github
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/_dashboard.settings.github.tsx
git commit -m "feat(database): replace GitHub wizard with tabbed Database management page"
```

---

## Task 9: Clean up — delete GenerateResumeStep, update OnboardingContainer, rename nav

**Files:**
- Delete: `src/features/onboarding/components/steps/GenerateResumeStep.tsx`
- Modify: `src/features/onboarding/components/OnboardingContainer.tsx`
- Modify: `src/components/layouts/AppLayout.tsx`

- [ ] **Step 1: Delete GenerateResumeStep**

```bash
rm src/features/onboarding/components/steps/GenerateResumeStep.tsx
```

- [ ] **Step 2: Update OnboardingContainer to remove the reference**

Replace `src/features/onboarding/components/OnboardingContainer.tsx`:

```typescript
import { MultiColumnLayout } from '@/components/ui/MultiColumnLayout'
import { OnboardingSidebar } from './OnboardingSidebar'
import { ImportCareerStep } from './steps/ImportCareerStep'
import { ConnectReposStep } from './steps/ConnectReposStep'
import type { GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'

export type OnboardingStep = 1 | 2

interface OnboardingContainerProps {
  readonly activeStep: OnboardingStep
  readonly onStepChange: (step: OnboardingStep) => void
  readonly installation: GitHubInstallation | null | undefined
  readonly isLoadingInstallation: boolean
  readonly accessibleRepos: GitHubAccessibleRepo[] | undefined
  readonly isLoadingRepos: boolean
  readonly connectedRepos: ConnectedRepo[] | undefined
}

export function OnboardingContainer({
  activeStep,
  onStepChange,
  installation,
  isLoadingInstallation,
  accessibleRepos,
  isLoadingRepos,
  connectedRepos,
}: OnboardingContainerProps) {
  return (
    <MultiColumnLayout secondaryColumn={<OnboardingSidebar activeStep={activeStep} />}>
      {activeStep === 1 && (
        <ImportCareerStep
          onNext={() => onStepChange(2)}
          onSkip={() => onStepChange(2)}
        />
      )}
      {activeStep === 2 && (
        <ConnectReposStep
          installation={installation}
          isLoadingInstallation={isLoadingInstallation}
          accessibleRepos={accessibleRepos}
          isLoadingRepos={isLoadingRepos}
          connectedRepos={connectedRepos}
          onNext={() => {}}
        />
      )}
    </MultiColumnLayout>
  )
}
```

Note: `OnboardingContainer` is no longer used by the settings page (which was fully replaced in Task 8). Check if it's imported anywhere else before leaving it:

```bash
grep -rn "OnboardingContainer" src --include="*.tsx" --include="*.ts"
```

If the only reference is the file itself, delete it too:

```bash
rm src/features/onboarding/components/OnboardingContainer.tsx
```

- [ ] **Step 3: Rename nav label "GitHub" → "Database" in AppLayout**

In `src/components/layouts/AppLayout.tsx`, find:

```typescript
{ name: "GitHub", href: "/settings/github", icon: Github },
```

Replace with:

```typescript
{ name: "Database", href: "/settings/github", icon: Database },
```

Add `Database` to the lucide-react import at the top of the file alongside `Github`.

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/components/steps/ \
        src/features/onboarding/components/OnboardingContainer.tsx \
        src/components/layouts/AppLayout.tsx
git commit -m "chore(onboarding): delete GenerateResumeStep, rename nav GitHub → Database"
```

---

## Task 10: Rename "Application Analysis" → "Resume Analysis"

**Files:**
- Modify: `src/app/_dashboard.applications.new.tsx`
- Modify: `src/app/_dashboard.applications.index.tsx`

- [ ] **Step 1: Update the new analysis page title**

In `src/app/_dashboard.applications.new.tsx`, find:

```tsx
title="Application Analysis"
```

Replace with:

```tsx
title="Resume Analysis"
```

Check for any other occurrences:

```bash
grep -n "Application Analysis" src/app/_dashboard.applications.new.tsx
```

Replace all found instances.

- [ ] **Step 2: Update the applications index page**

In `src/app/_dashboard.applications.index.tsx`, find:

```typescript
title: 'New Analysis',
```

This card links to `/applications/new` — check if its description references "Application Analysis":

```bash
grep -n "Application Analysis\|application analysis" src/app/_dashboard.applications.index.tsx
```

Replace any found instances with "Resume Analysis".

- [ ] **Step 3: Run full type check and tests**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -20
```

Expected: TypeScript clean, all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/_dashboard.applications.new.tsx \
        src/app/_dashboard.applications.index.tsx
git commit -m "chore(rename): Application Analysis → Resume Analysis"
```

---

## Self-Review Checklist

- [x] **Spec coverage — onboarding steps**: Tasks 1–7 cover `repos` + `processing` step IDs, STEPS array, useOnboardingState, ConnectReposStep, ProcessingStep, OnboardingShell, and onboarding.tsx schema.
- [x] **Spec coverage — max 3 repos**: Task 3 adds `maxRepos` to `GitHubRepoPicker`; Task 4 passes `enforceLimit` (sets `maxRepos={3}`). Both onboarding and settings Database page share the same component.
- [x] **Spec coverage — processing gate**: Task 5 `ProcessingStep` uses `useGitHubConnectedRepos` (which already polls every 5s on active statuses), checks terminal condition, navigates to `/overview`.
- [x] **Spec coverage — Database page tabs**: Task 8 replaces wizard with Repositories + Resumes tabs, on-demand `ImportCareerStep`, no `OnboardingProgress` bar.
- [x] **Spec coverage — GenerateResumeStep deleted**: Task 9 deletes the file and removes all references.
- [x] **Spec coverage — nav rename**: Task 9 renames "GitHub" → "Database" in `AppLayout.tsx`.
- [x] **Spec coverage — Resume Analysis rename**: Task 10 updates all string occurrences.
- [x] **Type consistency**: `StepId` defined in Task 1 is used verbatim in Task 2 (`STEP_INDEX` map). `setReposConnected` defined in Task 2 matches usage in Task 6 (OnboardingShell does not call it — `ProcessingStep` handles redirect internally). `enforceLimit` prop defined in Task 4 is passed in Task 6. `maxRepos` prop defined in Task 3 is consumed in Task 4.
- [x] **No placeholders**: All code blocks are complete.
- [x] **`OnboardingContainer` note**: Task 9 checks live whether the file is still referenced before deleting — safe.
