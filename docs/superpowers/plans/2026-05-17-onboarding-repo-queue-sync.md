# Onboarding Repo Queue + Deferred Bulk Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In onboarding, "Add" queues a repo (max 3, no sync); proceeding triggers a bulk sync on a full-screen Document-style processing page that then advances to the migrated Review page.

**Architecture:** Server-side queue via a `deferSync` flag on `POST /github/connected-repos` (admin-api, implemented separately) + a new `POST /github/connected-repos/sync`. This repo adds the BFF fns, a queue mutation hook, a `mode` prop on the shared `GitHubRepoPicker` (Settings keeps immediate-sync), a redesigned `ProcessingStep`, and dev-mock simulation so the whole flow is testable offline under `just dev-mock`.

**Tech Stack:** React 19, TanStack Start/Router/Query, Vitest, Motion for React, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-05-17-onboarding-repo-queue-sync-design.md`

**Commit protocol:** Every commit step follows the git-commit skill — run `yarn test`, `yarn lint`, `yarn typecheck` first; commit only on green (lint: 0 errors, 125 pre-existing warnings OK; typecheck: clean); Conventional Commits; NO Co-Authored-By/AI trailer. Branch: `feat/onboarding-defer-review` (already checked out).

---

### Task 1: BFF server fns — `queueConnectedRepoFn` + `startConnectedReposSyncFn`

**Files:**
- Modify: `src/server/github.ts`
- Test: `src/__tests__/server/github.test.ts`

- [ ] **Step 1: Add failing tests**

In `src/__tests__/server/github.test.ts`, add `queueConnectedRepoFn, startConnectedReposSyncFn` to the existing import block from `'../../server/github'` (the block that already imports `triggerGitHubIngestionFn` etc.). Then append these two `describe` blocks immediately before the final closing `})` of the top-level `describe('github server functions', …)`:

```ts
  describe('queueConnectedRepoFn', () => {
    it('posts repoFullName with deferSync true (no job dispatched)', async () => {
      const response = { status: 'queued', repoFullName: 'owner/repo', jobName: null }
      mockResponse(response)

      const handler = queueConnectedRepoFn as (input: { data: { repoFullName: string; defaultBranch?: string } }) => Promise<unknown>
      const result = await handler({ data: { repoFullName: 'owner/repo', defaultBranch: 'main' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/github/connected-repos`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ repoFullName: 'owner/repo', defaultBranch: 'main', deferSync: true }),
        }),
      )
      expect(result).toEqual(response)
    })
  })

  describe('startConnectedReposSyncFn', () => {
    it('posts to the bulk sync endpoint', async () => {
      mockResponse({ started: 2 })

      const handler = startConnectedReposSyncFn as () => Promise<unknown>
      const result = await handler()

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/github/connected-repos/sync`,
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result).toEqual({ started: 2 })
    })
  })
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `yarn vitest run src/__tests__/server/github.test.ts`
Expected: FAIL — `queueConnectedRepoFn` / `startConnectedReposSyncFn` are not exported.

- [ ] **Step 3: Implement the two fns**

In `src/server/github.ts`, immediately after the `triggerGitHubIngestionFn` export (before `const removeRepoSchema = …`), add:

```ts
const queueSchema = z.object({
  repoFullName:  z.string().min(1),
  defaultBranch: z.string().optional(),
})

// Connect a repo WITHOUT dispatching the sync job (onboarding queue).
// admin-api treats deferSync:true as connect-only (status 'pending').
export const queueConnectedRepoFn = createServerFn({ method: 'POST' })
  .inputValidator(queueSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ status: string; repoFullName: string; jobName: string | null }>(
      '/github/connected-repos',
      {
        method: 'POST',
        body: JSON.stringify({
          repoFullName:  data.repoFullName,
          defaultBranch: data.defaultBranch,
          deferSync:     true,
        }),
      },
    )
  })

// Dispatch ingestion jobs for every 'pending' repo of the caller.
export const startConnectedReposSyncFn = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAuth()
  return apiFetch<{ started: number }>('/github/connected-repos/sync', {
    method: 'POST',
  })
})
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `yarn vitest run src/__tests__/server/github.test.ts`
Expected: PASS (all github server tests, including the 2 new).

- [ ] **Step 5: Commit**

Gate (`yarn test && yarn lint && yarn typecheck`) green, then:

```bash
git add src/server/github.ts src/__tests__/server/github.test.ts
git commit -m "feat(github): queueConnectedRepoFn + startConnectedReposSyncFn BFF"
```

---

### Task 2: dev-mock — deferSync queue + bulk sync endpoint

**Files:**
- Modify: `src/server/_dev-mock.ts`
- Test: `src/__tests__/server/devMock-github.test.ts`

- [ ] **Step 1: Rewrite the dev-mock test for the queue lifecycle**

Replace the body of the `it('returns no installation until POST, then fixtures', …)` test in `src/__tests__/server/devMock-github.test.ts` from the line `// Connected repos start empty` to the end of the `it(` block (keep lines 1–27 — the install/repos assertions — unchanged) with:

```ts
    // Connected repos start empty — nothing connected until the user adds.
    expect(mockApiResponse('/github/connected-repos', 'GET')).toEqual({ repos: [] })

    // "Add" queues the repo with deferSync — it appears as 'pending', NOT syncing.
    expect(
      mockApiResponse(
        '/github/connected-repos',
        'POST',
        JSON.stringify({ repoFullName: 'dev-user/portfolio-api', defaultBranch: 'main', deferSync: true }),
      ),
    ).toMatchObject({ status: expect.any(String), repoFullName: 'dev-user/portfolio-api' })

    const queued = mockApiResponse('/github/connected-repos', 'GET') as {
      repos: Array<{ repoFullName: string; syncStatus: string }>
    }
    expect(queued.repos).toHaveLength(1)
    expect(queued.repos[0]!.syncStatus).toBe('pending')

    // Bulk sync starts jobs for all pending repos → they become 'syncing'.
    expect(mockApiResponse('/github/connected-repos/sync', 'POST')).toEqual({ started: 1 })
    const syncing = mockApiResponse('/github/connected-repos', 'GET') as {
      repos: Array<{ syncStatus: string }>
    }
    expect(syncing.repos[0]!.syncStatus).toBe('syncing')

    // DELETE de-queues by url-encoded repoFullName.
    expect(
      mockApiResponse(
        `/github/connected-repos/${encodeURIComponent('dev-user/portfolio-api')}`,
        'DELETE',
      ),
    ).toEqual({ success: true })
    expect(mockApiResponse('/github/connected-repos', 'GET')).toEqual({ repos: [] })
```

- [ ] **Step 2: Run the test, expect FAIL**

Run: `yarn vitest run src/__tests__/server/devMock-github.test.ts`
Expected: FAIL — POST currently sets `addedAt` (→ 'syncing'), there is no `/connected-repos/sync` handler, and no 'pending' state.

- [ ] **Step 3: Update the `MockConnected` type + comment**

In `src/server/_dev-mock.ts` replace:

```ts
// Connected repos are stateful so the Step 5 picker replicates the real
// workflow: clicking "Add" POSTs the repo, it appears as `syncing`, then
// flips to `complete` after SYNC_MS — driving the connected-repos poll and
// letting ProcessingStep advance once every repo is terminal. Starts empty
// (nothing connected until the user adds).
const SYNC_MS = 6_000
type MockConnected = {
  repoFullName: string
  owner:        string
  name:         string
  defaultBranch: string
  addedAt:      number // epoch ms when "Add" was clicked
}
let mockConnectedRepos: MockConnected[] = []
```

with:

```ts
// Connected repos are stateful so onboarding runs offline: "Add" queues a
// repo with deferSync (status 'pending', syncStartedAt null); the bulk
// /connected-repos/sync stamps syncStartedAt so each repo goes
// pending → syncing → complete (after SYNC_MS), driving the poll and
// letting ProcessingStep advance once every repo is terminal.
const SYNC_MS = 6_000
type MockConnected = {
  repoFullName: string
  owner:        string
  name:         string
  defaultBranch: string
  syncStartedAt: number | null // null = queued (pending); ms = sync started
}
let mockConnectedRepos: MockConnected[] = []
```

- [ ] **Step 4: Update the POST/GET/sync handlers**

In `src/server/_dev-mock.ts` replace the whole `if (p === '/github/connected-repos') { … }` block AND the DELETE block that follows it with:

```ts
  if (p === '/github/connected-repos/sync' && method === 'POST') {
    let started = 0
    const now = Date.now()
    for (const r of mockConnectedRepos) {
      if (r.syncStartedAt === null) { r.syncStartedAt = now; started++ }
    }
    return { started }
  }
  if (p === '/github/connected-repos') {
    if (method === 'POST') {
      const parsed = parseBody(body)
      const repoFullName = String(parsed['repoFullName'] ?? '')
      const defaultBranch = String(parsed['defaultBranch'] ?? 'main')
      const deferSync = parsed['deferSync'] === true
      if (repoFullName && !mockConnectedRepos.some((r) => r.repoFullName === repoFullName)) {
        const [owner, ...rest] = repoFullName.split('/')
        mockConnectedRepos.push({
          repoFullName,
          owner: owner ?? '',
          name: rest.join('/') || repoFullName,
          defaultBranch,
          // deferSync (onboarding queue) → pending; otherwise (Settings
          // immediate add) → sync starts now.
          syncStartedAt: deferSync ? null : Date.now(),
        })
      }
      return { status: deferSync ? 'queued' : 'syncing', repoFullName, jobName: deferSync ? null : 'mock-ingest-job' }
    }
    if (!githubInstalled) return { repos: [] }
    const now = Date.now()
    return {
      repos: mockConnectedRepos.map((r) => {
        const started = r.syncStartedAt
        let syncStatus: 'pending' | 'syncing' | 'complete'
        if (started === null) syncStatus = 'pending'
        else if (now - started < SYNC_MS) syncStatus = 'syncing'
        else syncStatus = 'complete'
        const complete = syncStatus === 'complete'
        return {
          repoFullName:  r.repoFullName,
          owner:         r.owner,
          name:          r.name,
          defaultBranch: r.defaultBranch,
          syncStatus,
          lastSyncedAt:  complete && started !== null ? new Date(started + SYNC_MS).toISOString() : null,
          addedAt:       new Date(started ?? now).toISOString(),
          qualityScore:  complete ? 85 : null,
          classification: complete ? 'project' : null,
        }
      }),
    }
  }
  // DELETE /github/connected-repos/<url-encoded repoFullName> — remove it.
  if (p.startsWith('/github/connected-repos/')) {
    const target = decodeURIComponent(p.slice('/github/connected-repos/'.length))
    mockConnectedRepos = mockConnectedRepos.filter((r) => r.repoFullName !== target)
    return { success: true }
  }
```

(Note: the `/connected-repos/sync` check is placed BEFORE the generic `/connected-repos` and the `startsWith('/github/connected-repos/')` DELETE branch so it is matched first.)

- [ ] **Step 5: Run the test, expect PASS**

Run: `yarn vitest run src/__tests__/server/devMock-github.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Gate green, then:

```bash
git add src/server/_dev-mock.ts src/__tests__/server/devMock-github.test.ts
git commit -m "feat(dev-mock): deferSync queue + bulk connected-repos/sync"
```

---

### Task 3: Queue mutation hook + `GitHubRepoPicker` mode prop

**Files:**
- Create: `src/features/github/hooks/use-github-queue-repo.ts`
- Modify: `src/features/github/components/GitHubRepoPicker.tsx`

- [ ] **Step 1: Create the queue hook**

Create `src/features/github/hooks/use-github-queue-repo.ts` (mirrors `use-github-ingestion.ts`, same return shape, calls `queueConnectedRepoFn`):

```ts
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { queueConnectedRepoFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'

interface QueueVariables {
  readonly repoFullName:  string
  readonly defaultBranch?: string
}

// Queues a repo (deferSync) — connects it as 'pending' without dispatching
// the sync job. Same shape as useGitHubIngestion so GitHubRepoPicker can
// swap by mode.
export function useGitHubQueueRepo() {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const [needsUpgrade, setNeedsUpgrade] = useState(false)

  const mutation = useMutation<
    { status: string; repoFullName: string; jobName: string | null },
    Error,
    QueueVariables
  >({
    mutationFn: (data) => queueConnectedRepoFn({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.accessibleRepos() })
    },
    onError: (err) => {
      if (err.message.includes('[429]')) {
        setNeedsUpgrade(true)
      } else {
        addToast('error', `Failed to queue repo: ${err.message}`)
      }
    },
  })

  return {
    ...mutation,
    needsUpgrade,
    dismissUpgrade: () => setNeedsUpgrade(false),
  }
}
```

- [ ] **Step 2: Add `mode` prop to `GitHubRepoPicker`**

In `src/features/github/components/GitHubRepoPicker.tsx`:

Add the import after the `useGitHubIngestion` import:

```ts
import { useGitHubQueueRepo } from '../hooks/use-github-queue-repo'
```

Add `mode` to the props interface (after `maxRepos?: number`):

```ts
  /** 'sync' = immediate ingestion (Settings, default). 'queue' = deferSync queue (onboarding). */
  readonly mode?: 'sync' | 'queue'
```

Change the destructure + hook selection. Replace:

```ts
export function GitHubRepoPicker({ accessibleRepos, isLoading, connectedRepos, maxRepos }: GitHubRepoPickerProps) {
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [queuingRepos, setQueuingRepos] = useState<Set<string>>(new Set())
  const ingestion = useGitHubIngestion()
```

with:

```ts
export function GitHubRepoPicker({ accessibleRepos, isLoading, connectedRepos, maxRepos, mode = 'sync' }: GitHubRepoPickerProps) {
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [queuingRepos, setQueuingRepos] = useState<Set<string>>(new Set())
  const syncIngestion = useGitHubIngestion()
  const queueIngestion = useGitHubQueueRepo()
  const ingestion = mode === 'queue' ? queueIngestion : syncIngestion
```

(Everything else — `handleAdd`, `ingestion.mutate`, `ingestion.needsUpgrade`, `ingestion.dismissUpgrade`, `connectedSet`, `atCap` — is unchanged and works against the selected hook. In queue mode `connectedRepos` already contains the queued repo as 'pending', so `connectedSet` shows "✓ Added" and `atCap` counts it.)

- [ ] **Step 3: Verify gates**

Run: `yarn typecheck` → clean.
Run: `yarn lint` → 0 errors.
Run: `yarn test` → all pass (65+; no test imports the picker, suite stays green).

- [ ] **Step 4: Commit**

```bash
git add src/features/github/hooks/use-github-queue-repo.ts src/features/github/components/GitHubRepoPicker.tsx
git commit -m "feat(github): GitHubRepoPicker queue mode + useGitHubQueueRepo"
```

---

### Task 4: `ConnectReposStep` — queue mode, queued chips, "Start indexing"

**Files:**
- Modify: `src/features/onboarding/components/steps/ConnectReposStep.tsx`

- [ ] **Step 1: Rewrite `ConnectReposStep`**

Replace the entire contents of `src/features/onboarding/components/steps/ConnectReposStep.tsx` with:

```tsx
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { GitHubConnectionCard } from '@/features/onboarding/components/onboarding/GitHubConnectionCard'
import { GitHubRepoPicker } from '@/features/github/components/GitHubRepoPicker'
import { StepHeader } from '@/features/onboarding/components/onboarding/StepHeader'
import { COPY } from '@/features/onboarding/components/onboarding/content'
import { adminKeys } from '@/lib/api/query-keys'
import { removeConnectedRepoFn } from '@/server/github'
import type { GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'

const MAX_REPOS = 3

interface ConnectReposStepProps {
  readonly installation: GitHubInstallation | null | undefined
  readonly isLoadingInstallation: boolean
  readonly accessibleRepos: GitHubAccessibleRepo[] | undefined
  readonly isLoadingRepos: boolean
  readonly connectedRepos: ConnectedRepo[] | undefined
  readonly onNext: () => void
  /** When true, enforces the 3-repo cap during onboarding. */
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
  const queryClient = useQueryClient()
  const [introDone, setIntroDone] = useState(false)

  // Queued = repos connected but not yet syncing (deferSync).
  const queued = (connectedRepos ?? []).filter((r) => r.syncStatus === 'pending')
  const hasQueued = queued.length > 0

  const dequeue = useMutation({
    mutationFn: (repoFullName: string) => removeConnectedRepoFn({ data: { repoFullName } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.accessibleRepos() })
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <StepHeader
          eyebrow={COPY.repos.eyebrow}
          title={COPY.repos.title}
          sub={COPY.repos.sub}
          typewriter
          onTypingComplete={() => setIntroDone(true)}
        />
        {enforceLimit && (
          <p className="mt-1 text-xs text-zinc-600">
            Queue up to {MAX_REPOS} repositories. Indexing starts after you click “Start indexing”.
          </p>
        )}
      </div>

      <AnimatePresence>
        {introDone && (
          <motion.div
            key="repos-body"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: 'transform, opacity' }}
            className="space-y-4"
          >
            <GitHubConnectionCard
              connected={!!installation}
              installation={installation}
              isLoading={isLoadingInstallation}
            />
            {installation && (
              <GitHubRepoPicker
                mode="queue"
                accessibleRepos={accessibleRepos}
                isLoading={isLoadingRepos}
                connectedRepos={connectedRepos}
                maxRepos={enforceLimit ? MAX_REPOS : undefined}
              />
            )}
            {installation && hasQueued && (
              <div className="flex flex-wrap gap-2">
                {queued.map((r) => (
                  <span
                    key={r.repoFullName}
                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200"
                  >
                    {r.repoFullName}
                    <button
                      type="button"
                      aria-label={`Remove ${r.repoFullName} from queue`}
                      onClick={() => dequeue.mutate(r.repoFullName)}
                      disabled={dequeue.isPending}
                      className="rounded-full p-0.5 text-indigo-300/70 transition hover:bg-indigo-500/20 hover:text-indigo-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end pt-2 border-t border-white/10">
        <Button
          variant="primary"
          onClick={onNext}
          disabled={!hasQueued}
          className="flex items-center gap-1.5"
        >
          {hasQueued ? 'Start indexing' : 'Add a repo to continue'}
          {hasQueued && <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify gates**

Run: `yarn typecheck` → clean.
Run: `yarn lint` → 0 errors (pre-existing Tailwind canonical-class warnings acceptable).
Run: `yarn test` → all pass.

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/components/steps/ConnectReposStep.tsx
git commit -m "feat(onboarding): repo step queues repos with removable chips"
```

---

### Task 5: Extend connected-repos poll timeout to 15 minutes

**Files:**
- Modify: `src/features/github/hooks/use-github-connected-repos.ts`

- [ ] **Step 1: Change the timeout constant**

In `src/features/github/hooks/use-github-connected-repos.ts` replace:

```ts
const POLL_TIMEOUT_MS = 10 * 60 * 1_000
```

with:

```ts
// Production repo ingestion can take up to ~15 min; poll until then before
// marking stuck repos errored.
const POLL_TIMEOUT_MS = 15 * 60 * 1_000
```

- [ ] **Step 2: Verify gates**

Run: `yarn typecheck` → clean. `yarn lint` → 0 errors. `yarn test` → all pass.

- [ ] **Step 3: Commit**

```bash
git add src/features/github/hooks/use-github-connected-repos.ts
git commit -m "fix(github): extend connected-repos poll timeout to 15 min"
```

---

### Task 6: Redesign `ProcessingStep` — full-screen Document aesthetic + bulk sync trigger

**Files:**
- Modify: `src/features/onboarding/components/steps/ProcessingStep.tsx`

- [ ] **Step 1: Rewrite `ProcessingStep`**

Replace the entire contents of `src/features/onboarding/components/steps/ProcessingStep.tsx` with:

```tsx
'use client'

// Onboarding processing step — triggers the bulk sync for all queued
// repos, then shows full-screen Document-style progress (Typewriter
// heading + circular gradient ring for aggregate progress) plus a
// per-repo SyncProgressBar list, and advances to Review once every repo
// is terminal (complete or error). StepFooter is suppressed for this
// step by OnboardingShell.

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Typewriter } from '@/components/ui/Typewriter'
import { SyncProgressBar } from '@/features/github/components/SyncProgressBar'
import { GitHubSyncStatusBadge } from '@/features/github/components/GitHubSyncStatusBadge'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { startConnectedReposSyncFn } from '@/server/github'

const TERMINAL_STATUSES = new Set(['complete', 'error'])

// Progress-ring geometry: r=44 in a 96×96 viewBox.
const RING_RADIUS = 44
const RING_CIRC = 2 * Math.PI * RING_RADIUS

interface ProcessingStepProps {
  readonly onNext: () => void
}

export function ProcessingStep({ onNext }: ProcessingStepProps) {
  const { data: connectedRepos } = useGitHubConnectedRepos()
  const startedRef = useRef(false)
  const [startError, setStartError] = useState<string | null>(null)

  // Trigger the bulk sync once on mount (queued → syncing).
  const triggerSync = () => {
    setStartError(null)
    startConnectedReposSyncFn()
      .catch((err: unknown) => {
        setStartError(err instanceof Error ? err.message : 'Failed to start indexing')
      })
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    triggerSync()
  }, [])

  const repos = connectedRepos ?? []
  const total = repos.length
  const terminalCount = repos.filter((r) => TERMINAL_STATUSES.has(r.syncStatus)).length
  const pct = total === 0 ? 0 : Math.round((terminalCount / total) * 100)

  useEffect(() => {
    if (total > 0 && terminalCount === total) onNext()
  }, [total, terminalCount, onNext])

  return (
    <div className="space-y-8">
      <Typewriter
        key="indexing-title"
        as="h3"
        text="Indexing your repositories"
        className="text-3xl font-bold leading-[1.1] text-zinc-50 md:text-4xl"
        speed={45}
      />

      <p className="text-lg font-semibold leading-snug text-teal-100/90 md:text-xl">
        {total === 0
          ? 'Starting…'
          : `${terminalCount} of ${total} ${total === 1 ? 'repository' : 'repositories'} indexed`}
      </p>

      <div className="mx-auto flex w-full max-w-[16rem] flex-col items-center gap-6 px-6 py-10">
        <div className="relative h-28 w-28">
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full opacity-70 blur-[2px]"
            style={{
              willChange: 'transform',
              background:
                'conic-gradient(from 0deg, transparent 0deg, rgba(20,184,166,0.55) 110deg, rgba(16,185,129,0.55) 230deg, transparent 360deg)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
          />
          <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-90">
            <defs>
              <linearGradient id="proc-repos-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
            <circle cx="48" cy="48" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
            <motion.circle
              cx="48"
              cy="48"
              r={RING_RADIUS}
              fill="none"
              stroke="url(#proc-repos-ring)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              initial={false}
              animate={{ strokeDashoffset: RING_CIRC * (1 - pct / 100) }}
              transition={{ type: 'spring', bounce: 0.2, visualDuration: 0.6 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold text-teal-100">{pct}%</span>
          </div>
        </div>
      </div>

      {startError ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-sm text-red-300">{startError}</p>
          <Button variant="secondary" onClick={triggerSync} className="flex items-center gap-1.5">
            Retry
          </Button>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-md space-y-2">
          {repos.map((repo) => (
            <div
              key={repo.repoFullName}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <span className="truncate text-xs font-medium text-zinc-200">{repo.repoFullName}</span>
              {repo.syncStatus === 'pending' || repo.syncStatus === 'syncing' ? (
                <SyncProgressBar />
              ) : (
                <GitHubSyncStatusBadge status={repo.syncStatus} />
              )}
            </div>
          ))}
          {total === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Preparing…
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-zinc-600">
        This can take several minutes (up to ~15 in some cases). You can leave this page — we’ll keep indexing.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify gates**

Run: `yarn typecheck` → clean.
Run: `yarn lint` → 0 errors (pre-existing Tailwind canonical-class warnings acceptable).
Run: `yarn test` → all pass (no test imports ProcessingStep).

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/components/steps/ProcessingStep.tsx
git commit -m "feat(onboarding): full-screen repo-sync processing page"
```

---

### Task 7: Manual verification under dev-mock

**Files:** none (verification only).

- [ ] **Step 1: Lower the sync dwell for a fast loop (optional)**

In `src/server/_dev-mock.ts` you may temporarily lower `SYNC_MS` (e.g. `4_000`) for a faster walkthrough; restore before finishing (it ships at `6_000`).

- [ ] **Step 2: Run the mocked dev server**

Run: `just dev-mock`

- [ ] **Step 3: Walk the flow**

1. Sign up → onboarding → Welcome → Portfolio → Resume (upload any PDF) → ring fills → auto-advance.
2. Connect step → Connect GitHub (offline simulated) → connect step shows connected → continue.
3. Repos step: click **+ Add** on 1–3 repos. Confirm each shows **“✓ Added”** and appears as a removable **queued chip** below. Confirm **nothing syncs yet** (no progress bars here). Confirm Add is disabled at 3 and the X removes a chip.
4. Click **Start indexing**.
5. Full-screen processing page: Typewriter heading, circular ring filling as repos complete, per-repo `SyncProgressBar` → synced. Confirm it advances to the **Review** page once all repos are terminal.
6. Re-run; remove a queued chip before Start indexing and confirm it’s excluded from sync.

- [ ] **Step 4: Restore the dev knob**

If you changed `SYNC_MS`, restore it to `6_000`. Commit nothing in this task.

---

## Self-Review

**Spec coverage:**
- Contract (deferSync + /sync + DELETE + GET) → Task 1 (BFF) + Task 2 (dev-mock). ✓
- BFF `queueConnectedRepoFn` / `startConnectedReposSyncFn` → Task 1. ✓
- `GitHubRepoPicker` mode prop, Settings unchanged (default 'sync') → Task 3. ✓
- ConnectReposStep: queue mode, remove GitHubConnectedRepos panel, removable queued chips, "Start indexing" enabled ≥1 pending → Task 4. ✓
- ProcessingStep: bulk sync on mount + retry, Document aesthetic ring (aggregate) + per-repo SyncProgressBar list, advance when all terminal → Task 6. ✓
- 15-min poll timeout → Task 5. ✓
- ReviewStep unchanged → no task needed (explicitly out of scope). ✓
- dev-mock simulation (pending → /sync → syncing → complete) → Task 2. ✓
- Testing: server-fn tests (Task 1) + dev-mock lifecycle test (Task 2) mirror existing patterns; component RTL deliberately omitted per spec testing section; manual walkthrough Task 7. ✓
- Error handling: start-sync failure → toast/Retry (Task 6); empty queue → button disabled (Task 4); timeout → repos error → advance (Task 5 + Task 6 terminal logic). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". All code blocks complete and verbatim.

**Type consistency:** `queueConnectedRepoFn` returns `{status,repoFullName,jobName:string|null}` (Task 1) consumed by `useGitHubQueueRepo` with the same generic (Task 3). `startConnectedReposSyncFn` returns `{started:number}` (Task 1) — ProcessingStep only calls it for effect, ignores the value (Task 6). dev-mock POST returns `jobName: deferSync ? null : 'mock-ingest-job'` and `/sync` returns `{started}` matching Task 1 types. `ConnectedRepo.syncStatus` values `pending|syncing|complete|error` used consistently in Tasks 2/4/6. `mode?: 'sync'|'queue'` default `'sync'` (Task 3) passed as `mode="queue"` only by ConnectReposStep (Task 4); Settings caller passes no `mode` → unchanged. `removeConnectedRepoFn({data:{repoFullName}})` signature matches existing export used in Task 4.
