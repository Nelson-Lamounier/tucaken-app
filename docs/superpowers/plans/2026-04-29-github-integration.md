# GitHub Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing GitHub App to a new `/settings/github` settings page with account connect/disconnect and repo indexing management.

**Architecture:** Single settings route with three stacked sections (Account → RepoPicker → ConnectedRepos), backed by 7 new server functions delegating to admin-api, 4 TanStack Query hooks with polling, and a cleaned-up `features/github/` module. Old GitHub artifacts in `features/applications/` are removed.

**Tech Stack:** TanStack Start (`createServerFn`), TanStack Query (v5), Zustand (`useToastStore`), Tailwind v4, Zod, Vitest (node env)

---

## File Map

### Files to DELETE
- `src/features/applications/components/GitHubRepoForm.tsx`
- `src/features/applications/components/GitHubRepoSection.tsx`
- `src/app/_dashboard.applications.github.tsx`

### Files to MODIFY
| File | What changes |
|---|---|
| `src/lib/types/applications.types.ts` | Remove `GitHubRepo` interface; remove `githubRepo?` from `ApplicationSummary` and `ApplicationDetail` |
| `src/features/applications/components/ApplicationReviewDetail.tsx` | Remove `GitHubRepo` type import, `GitHubRepoSection` import, `githubRepo` useState, `<GitHubRepoSection>` JSX |
| `src/features/applications/components/ApplicationCard.tsx` | Remove `GitHubRepoChip` import and `{app.githubRepo && <GitHubRepoChip>}` JSX |
| `src/app/_dashboard.applications.index.tsx` | Change "GitHub Repositories" card `href` from `/applications/github` to `/settings/github`; update description |
| `src/lib/api/query-keys.ts` | Add `github` namespace to `adminKeys` |
| `src/components/layouts/AppLayout.tsx` | Add `settingsNavigation` array + Settings sidebar group; import `Github` from lucide-react |

### Files to CREATE
| File | Responsibility |
|---|---|
| `src/lib/types/github.types.ts` | `GitHubInstallation`, `GitHubAccessibleRepo`, `RepoSyncStatus`, `ConnectedRepo` |
| `src/server/github.ts` | 7 server functions (install, disconnect, accessible-repos, connected-repos, ingestion trigger, remove) |
| `src/__tests__/server/github.test.ts` | Vitest tests for all 7 server functions |
| `src/features/github/components/GitHubRepoChip.tsx` | Monospace owner/name badge, `{ fullName: string }` prop |
| `src/features/github/components/GitHubSyncStatusBadge.tsx` | Colour+label chip for `RepoSyncStatus` |
| `src/features/github/hooks/use-github-installation.ts` | `useGitHubInstallation()` — useQuery |
| `src/features/github/hooks/use-github-accessible-repos.ts` | `useGitHubAccessibleRepos(enabled)` — useQuery |
| `src/features/github/hooks/use-github-connected-repos.ts` | `useGitHubConnectedRepos()` — useQuery with 5 s polling |
| `src/features/github/hooks/use-github-ingestion.ts` | `useGitHubIngestion()` — useMutation |
| `src/features/github/components/GitHubAccountSection.tsx` | Screen 1: not-connected / connected states |
| `src/features/github/components/GitHubRepoPicker.tsx` | Screen 2a: searchable repo list with Add buttons |
| `src/features/github/components/GitHubConnectedRepos.tsx` | Screen 2b: connected repos with sync status + Re-sync / Remove |
| `src/app/_dashboard.settings.github.tsx` | Route `/settings/github`; handles GitHub App callback |

---

## Task 1: Delete old GitHub artifacts

**Files:**
- Delete: `src/features/applications/components/GitHubRepoForm.tsx`
- Delete: `src/features/applications/components/GitHubRepoSection.tsx`
- Delete: `src/app/_dashboard.applications.github.tsx`

- [ ] **Step 1: Delete the three files**

```bash
rm src/features/applications/components/GitHubRepoForm.tsx
rm src/features/applications/components/GitHubRepoSection.tsx
rm src/app/_dashboard.applications.github.tsx
```

- [ ] **Step 2: Remove GitHubRepoSection import and usage from ApplicationReviewDetail**

In `src/features/applications/components/ApplicationReviewDetail.tsx`:

Remove line 7: `import type { ApplicationDetail, GitHubRepo } from '@/lib/types/applications.types'`
Replace with: `import type { ApplicationDetail } from '@/lib/types/applications.types'`

Remove line 24: `import { GitHubRepoSection } from './GitHubRepoSection'`

Remove line 39: `const [githubRepo, setGithubRepo] = useState<GitHubRepo | null>(detail.githubRepo ?? null)`

Search for the `<GitHubRepoSection` JSX block and remove it entirely (the component renders a section with a link/form for linking a GitHub repo to the application — grep for `GitHubRepoSection` in the file to find the exact lines).

- [ ] **Step 3: Remove GitHubRepoChip import and usage from ApplicationCard**

In `src/features/applications/components/ApplicationCard.tsx`:

Remove line 11: `import { GitHubRepoChip } from './GitHubRepoChip'`

Remove line 67: `{app.githubRepo && <GitHubRepoChip repo={app.githubRepo} />}`

- [ ] **Step 4: Verify TypeScript compiles without errors**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: errors only about `GitHubRepo` still referenced in `applications.types.ts` (resolved in Task 2). No errors in `ApplicationCard` or `ApplicationReviewDetail`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove per-application GitHub link artifacts"
```

---

## Task 2: Types + Query Keys

**Files:**
- Create: `src/lib/types/github.types.ts`
- Modify: `src/lib/types/applications.types.ts`
- Modify: `src/lib/api/query-keys.ts`

- [ ] **Step 1: Create `github.types.ts`**

```typescript
// src/lib/types/github.types.ts
export interface GitHubInstallation {
  readonly installationId: string
  readonly accountLogin: string
  readonly accountAvatarUrl: string
  readonly repositoryCount: number
  readonly connectedAt: string
}

export interface GitHubAccessibleRepo {
  readonly id: number
  readonly fullName: string
  readonly owner: string
  readonly name: string
  readonly defaultBranch: string
  readonly private: boolean
  readonly updatedAt: string
}

export type RepoSyncStatus = 'pending' | 'syncing' | 'complete' | 'error'

export interface ConnectedRepo {
  readonly repoFullName: string
  readonly owner: string
  readonly name: string
  readonly defaultBranch: string
  readonly syncStatus: RepoSyncStatus
  readonly lastSyncedAt?: string
  readonly pipelineRunId?: string
  readonly jobName?: string
  readonly addedAt: string
}
```

- [ ] **Step 2: Remove `GitHubRepo` from `applications.types.ts`**

In `src/lib/types/applications.types.ts`:

Remove `readonly githubRepo?: GitHubRepo` from `ApplicationSummary` (around line 162).
Remove `readonly githubRepo?: GitHubRepo` from `ApplicationDetail` (around line 380).
Remove the entire `GitHubRepo` interface block (around lines 385–404, including its section comment).

- [ ] **Step 3: Add `github` namespace to query-keys**

In `src/lib/api/query-keys.ts`, add after the `applications` block (before the closing `} as const`):

```typescript
  /** GitHub integration query keys */
  github: {
    /** All GitHub queries */
    all: ['admin', 'github'] as const,
    /** GitHub App installation status */
    installation: () => ['admin', 'github', 'installation'] as const,
    /** Repos accessible via the GitHub App */
    accessibleRepos: () => ['admin', 'github', 'accessible-repos'] as const,
    /** Repos connected (indexed) to the KB */
    connectedRepos: () => ['admin', 'github', 'connected-repos'] as const,
  },
```

- [ ] **Step 4: Verify TypeScript compiles clean**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/github.types.ts src/lib/types/applications.types.ts src/lib/api/query-keys.ts
git commit -m "feat(github): add types and query key namespace"
```

---

## Task 3: Server functions

**Files:**
- Create: `src/server/github.ts`
- Create: `src/__tests__/server/github.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/server/github.test.ts
/**
 * @format
 * Unit tests for GitHub integration server functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain: Record<string, unknown> = {}
    chain.middleware = () => chain
    chain.inputValidator = () => chain
    chain.handler = (fn: unknown) => fn
    return chain
  },
}))

vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  setResponseHeader: vi.fn(),
}))

import { getCookie } from '@tanstack/react-start/server'
const mockGetCookie = getCookie as unknown as ReturnType<typeof vi.fn>

vi.mock('../../server/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import {
  getGitHubInstallationFn,
  handleGitHubInstallFn,
  disconnectGitHubFn,
  getGitHubAccessibleReposFn,
  getGitHubConnectedReposFn,
  triggerGitHubIngestionFn,
  removeConnectedRepoFn,
} from '../../server/github'

const BASE = 'http://admin-api.admin-api:3002/api/admin'

describe('github server functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCookie.mockReturnValue('mock-jwt-token')
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const mockResponse = (data: unknown, ok = true, status = 200) => {
    fetchMock.mockResolvedValueOnce({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: async () => data,
      text: async () => JSON.stringify(data),
    })
  }

  describe('getGitHubInstallationFn', () => {
    it('returns installation when found', async () => {
      const installation = { installationId: '123', accountLogin: 'nelsonlamounier' }
      mockResponse({ installation })

      const handler = getGitHubInstallationFn as () => Promise<unknown>
      const result = await handler()

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/github/installation`,
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer mock-jwt-token' }) }),
      )
      expect(result).toEqual(installation)
    })

    it('returns null on 404', async () => {
      mockResponse({ message: 'Not found' }, false, 404)

      const handler = getGitHubInstallationFn as () => Promise<unknown>
      const result = await handler()

      expect(result).toBeNull()
    })
  })

  describe('handleGitHubInstallFn', () => {
    it('posts installationId to admin-api', async () => {
      mockResponse({ success: true })

      const handler = handleGitHubInstallFn as (input: { data: { installationId: string } }) => Promise<unknown>
      const result = await handler({ data: { installationId: '42' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/github/installation`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ installationId: '42' }),
        }),
      )
      expect(result).toEqual({ success: true })
    })
  })

  describe('disconnectGitHubFn', () => {
    it('sends DELETE to installation endpoint', async () => {
      mockResponse({ success: true })

      const handler = disconnectGitHubFn as () => Promise<unknown>
      await handler()

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/github/installation`,
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  describe('getGitHubAccessibleReposFn', () => {
    it('returns repos array', async () => {
      const repos = [{ id: 1, fullName: 'owner/repo' }]
      mockResponse({ repos })

      const handler = getGitHubAccessibleReposFn as () => Promise<unknown>
      const result = await handler()

      expect(fetchMock).toHaveBeenCalledWith(`${BASE}/github/repos`, expect.anything())
      expect(result).toEqual(repos)
    })
  })

  describe('getGitHubConnectedReposFn', () => {
    it('returns connected repos array', async () => {
      const repos = [{ repoFullName: 'owner/repo', syncStatus: 'complete' }]
      mockResponse({ repos })

      const handler = getGitHubConnectedReposFn as () => Promise<unknown>
      const result = await handler()

      expect(fetchMock).toHaveBeenCalledWith(`${BASE}/github/connected-repos`, expect.anything())
      expect(result).toEqual(repos)
    })
  })

  describe('triggerGitHubIngestionFn', () => {
    it('posts repoFullName to ingestion trigger', async () => {
      const response = { status: 'dispatched', pipelineRunId: 'run-1', jobName: 'job-1' }
      mockResponse(response)

      const handler = triggerGitHubIngestionFn as (input: { data: { repoFullName: string; forceReindex?: boolean } }) => Promise<unknown>
      const result = await handler({ data: { repoFullName: 'owner/repo', forceReindex: true } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/ingestion/trigger`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ repoFullName: 'owner/repo', forceReindex: true }),
        }),
      )
      expect(result).toEqual(response)
    })
  })

  describe('removeConnectedRepoFn', () => {
    it('sends DELETE with encoded repo name in URL', async () => {
      mockResponse({ success: true })

      const handler = removeConnectedRepoFn as (input: { data: { repoFullName: string } }) => Promise<unknown>
      await handler({ data: { repoFullName: 'owner/repo' } })

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/github/connected-repos/${encodeURIComponent('owner/repo')}`,
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ repoFullName: 'owner/repo' }),
        }),
      )
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/server/github.test.ts 2>&1 | tail -20
```

Expected: FAIL — `../../server/github` cannot be resolved.

- [ ] **Step 3: Implement `src/server/github.ts`**

```typescript
// src/server/github.ts
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getCookie } from '@tanstack/react-start/server'
import type { GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'
import { requireAuth } from './auth-guard'

const ADMIN_API_URL =
  process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'

function getSessionToken(): string {
  const token = getCookie('__session')
  if (!token) throw new Error('Session cookie missing after auth guard')
  return token
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken()
  const res = await fetch(`${ADMIN_API_URL}/api/admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`admin-api ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

export const getGitHubInstallationFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  try {
    const body = await apiFetch<{ installation: GitHubInstallation }>('/github/installation')
    return body.installation
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('admin-api 404')) return null
    throw err
  }
})

const installSchema = z.object({ installationId: z.string().min(1) })

export const handleGitHubInstallFn = createServerFn({ method: 'POST' })
  .inputValidator(installSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ success: boolean }>('/github/installation', {
      method: 'POST',
      body: JSON.stringify({ installationId: data.installationId }),
    })
  })

export const disconnectGitHubFn = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAuth()
  return apiFetch<{ success: boolean }>('/github/installation', { method: 'DELETE' })
})

export const getGitHubAccessibleReposFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  const body = await apiFetch<{ repos: GitHubAccessibleRepo[] }>('/github/repos')
  return body.repos
})

export const getGitHubConnectedReposFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  const body = await apiFetch<{ repos: ConnectedRepo[] }>('/github/connected-repos')
  return body.repos
})

const ingestionSchema = z.object({
  repoFullName: z.string().min(1),
  forceReindex: z.boolean().optional(),
})

export const triggerGitHubIngestionFn = createServerFn({ method: 'POST' })
  .inputValidator(ingestionSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ status: string; pipelineRunId: string; jobName: string }>(
      '/ingestion/trigger',
      {
        method: 'POST',
        body: JSON.stringify({ repoFullName: data.repoFullName, forceReindex: data.forceReindex }),
      },
    )
  })

const removeRepoSchema = z.object({ repoFullName: z.string().min(1) })

export const removeConnectedRepoFn = createServerFn({ method: 'POST' })
  .inputValidator(removeRepoSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ success: boolean }>(
      `/github/connected-repos/${encodeURIComponent(data.repoFullName)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ repoFullName: data.repoFullName }),
      },
    )
  })
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/__tests__/server/github.test.ts 2>&1 | tail -20
```

Expected: 7 test suites, all PASS.

- [ ] **Step 5: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/github.ts src/__tests__/server/github.test.ts
git commit -m "feat(github): add server functions with tests"
```

---

## Task 4: Move GitHubRepoChip + add GitHubSyncStatusBadge

**Files:**
- Create: `src/features/github/components/GitHubRepoChip.tsx`
- Create: `src/features/github/components/GitHubSyncStatusBadge.tsx`

- [ ] **Step 1: Create the github components directory**

```bash
mkdir -p src/features/github/components
mkdir -p src/features/github/hooks
```

- [ ] **Step 2: Create updated `GitHubRepoChip`**

```typescript
// src/features/github/components/GitHubRepoChip.tsx
import { Github } from 'lucide-react'

export function GitHubRepoChip({ fullName }: { readonly fullName: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs font-mono text-zinc-400">
      <Github className="h-3 w-3 shrink-0" />
      <span className="max-w-[160px] truncate">{fullName}</span>
    </span>
  )
}
```

- [ ] **Step 3: Create `GitHubSyncStatusBadge`**

```typescript
// src/features/github/components/GitHubSyncStatusBadge.tsx
import { Loader2 } from 'lucide-react'
import type { RepoSyncStatus } from '@/lib/types/github.types'

const STATUS_COLOURS: Record<RepoSyncStatus, string> = {
  pending: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  syncing: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300',
  complete: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  error: 'border-red-500/20 bg-red-500/10 text-red-300',
}

const STATUS_LABELS: Record<RepoSyncStatus, string> = {
  pending: 'pending',
  syncing: 'syncing',
  complete: 'synced',
  error: 'error',
}

export function GitHubSyncStatusBadge({ status }: { readonly status: RepoSyncStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[status]}`}
    >
      {status === 'syncing' && <Loader2 className="h-3 w-3 animate-spin" />}
      {STATUS_LABELS[status]}
    </span>
  )
}
```

- [ ] **Step 4: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/github/
git commit -m "feat(github): add GitHubRepoChip and GitHubSyncStatusBadge components"
```

---

## Task 5: TanStack Query hooks

**Files:**
- Create: `src/features/github/hooks/use-github-installation.ts`
- Create: `src/features/github/hooks/use-github-accessible-repos.ts`
- Create: `src/features/github/hooks/use-github-connected-repos.ts`
- Create: `src/features/github/hooks/use-github-ingestion.ts`

- [ ] **Step 1: Create `use-github-installation.ts`**

```typescript
// src/features/github/hooks/use-github-installation.ts
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getGitHubInstallationFn } from '@/server/github'
import type { GitHubInstallation } from '@/lib/types/github.types'

export function useGitHubInstallation() {
  return useQuery<GitHubInstallation | null>({
    queryKey: adminKeys.github.installation(),
    queryFn: () => getGitHubInstallationFn(),
  })
}
```

- [ ] **Step 2: Create `use-github-accessible-repos.ts`**

```typescript
// src/features/github/hooks/use-github-accessible-repos.ts
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getGitHubAccessibleReposFn } from '@/server/github'
import type { GitHubAccessibleRepo } from '@/lib/types/github.types'

export function useGitHubAccessibleRepos(enabled: boolean) {
  return useQuery<GitHubAccessibleRepo[]>({
    queryKey: adminKeys.github.accessibleRepos(),
    queryFn: () => getGitHubAccessibleReposFn(),
    enabled,
  })
}
```

- [ ] **Step 3: Create `use-github-connected-repos.ts`**

```typescript
// src/features/github/hooks/use-github-connected-repos.ts
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getGitHubConnectedReposFn } from '@/server/github'
import type { ConnectedRepo } from '@/lib/types/github.types'

const POLL_INTERVAL = 5_000
const POLL_TIMEOUT_MS = 10 * 60 * 1_000
const ACTIVE_SYNC_STATUSES = new Set(['pending', 'syncing'])

export function useGitHubConnectedRepos() {
  const pollStartRef = useRef<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  const query = useQuery<ConnectedRepo[]>({
    queryKey: adminKeys.github.connectedRepos(),
    queryFn: () => getGitHubConnectedReposFn(),
    refetchInterval: (queryResult) => {
      if (timedOut) return false

      const data = queryResult.state.data
      if (!data) return false

      const hasActive = data.some((r) => ACTIVE_SYNC_STATUSES.has(r.syncStatus))
      if (!hasActive) return false

      if (!pollStartRef.current) pollStartRef.current = Date.now()

      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return false
      }

      return POLL_INTERVAL
    },
  })

  useEffect(() => {
    const data = query.data
    if (!data) return
    const hasActive = data.some((r) => ACTIVE_SYNC_STATUSES.has(r.syncStatus))
    if (!hasActive) {
      pollStartRef.current = null
      setTimedOut(false)
    }
  }, [query.data])

  return { ...query, timedOut }
}
```

- [ ] **Step 4: Create `use-github-ingestion.ts`**

```typescript
// src/features/github/hooks/use-github-ingestion.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { triggerGitHubIngestionFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'

interface IngestionVariables {
  readonly repoFullName: string
  readonly forceReindex?: boolean
}

export function useGitHubIngestion() {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  return useMutation<{ status: string; pipelineRunId: string; jobName: string }, Error, IngestionVariables>({
    mutationFn: (data) => triggerGitHubIngestionFn({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.accessibleRepos() })
    },
    onError: (err) => {
      addToast('error', `Ingestion failed: ${err.message}`)
    },
  })
}
```

- [ ] **Step 5: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/github/hooks/
git commit -m "feat(github): add TanStack Query hooks"
```

---

## Task 6: GitHubAccountSection (Screen 1)

**Files:**
- Create: `src/features/github/components/GitHubAccountSection.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/features/github/components/GitHubAccountSection.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Github, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { adminKeys } from '@/lib/api/query-keys'
import { disconnectGitHubFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'
import type { GitHubInstallation } from '@/lib/types/github.types'

interface GitHubAccountSectionProps {
  readonly installation: GitHubInstallation | null | undefined
  readonly isLoading: boolean
}

export function GitHubAccountSection({ installation, isLoading }: GitHubAccountSectionProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const appSlug = import.meta.env['VITE_GITHUB_APP_SLUG'] as string | undefined

  const disconnect = useMutation({
    mutationFn: () => disconnectGitHubFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.all })
      addToast('success', 'GitHub disconnected.')
    },
    onError: (err: Error) => {
      addToast('error', `Disconnect failed: ${err.message}`)
    },
  })

  const handleDisconnect = () => {
    if (!window.confirm('Disconnect GitHub? Existing connected repos will be removed from the knowledge base.')) return
    disconnect.mutate()
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading GitHub status…</span>
        </div>
      </div>
    )
  }

  if (!installation) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          GitHub Account
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
            <Github className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Connect your GitHub account</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Grant access so Bedrock can index your repositories
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
          <span className="text-xs text-zinc-500">No installation found</span>
          <Button
            variant="secondary"
            onClick={() => {
              if (appSlug) {
                window.location.href = `https://github.com/apps/${appSlug}/installations/new`
              }
            }}
            className="flex items-center gap-2"
          >
            <Github className="h-3.5 w-3.5" />
            Connect GitHub
          </Button>
        </div>
      </div>
    )
  }

  const initials = installation.accountLogin.slice(0, 2).toUpperCase()

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        GitHub Account
      </div>
      <div className="flex items-center gap-3">
        {installation.accountAvatarUrl ? (
          <img
            src={installation.accountAvatarUrl}
            alt={installation.accountLogin}
            className="h-9 w-9 rounded-full border border-white/10"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-600 text-xs font-bold text-white">
            {initials}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-zinc-100">{installation.accountLogin}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {installation.repositoryCount} repositories accessible via GitHub App
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs text-emerald-400">Connected</span>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
        <span className="text-xs text-zinc-500">
          Installed · github.com/apps/{appSlug ?? 'tucaken'}
        </span>
        <Button
          variant="danger"
          onClick={handleDisconnect}
          disabled={disconnect.isPending}
        >
          {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/github/components/GitHubAccountSection.tsx
git commit -m "feat(github): add GitHubAccountSection component"
```

---

## Task 7: GitHubRepoPicker (Screen 2a)

**Files:**
- Create: `src/features/github/components/GitHubRepoPicker.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/features/github/components/GitHubRepoPicker.tsx
import { useState, useMemo } from 'react'
import { Loader2, GitBranch, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GitHubRepoChip } from './GitHubRepoChip'
import { useGitHubIngestion } from '../hooks/use-github-ingestion'
import type { GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'

const PAGE_SIZE = 10

interface GitHubRepoPickerProps {
  readonly accessibleRepos: GitHubAccessibleRepo[] | undefined
  readonly isLoading: boolean
  readonly connectedRepos: ConnectedRepo[] | undefined
}

export function GitHubRepoPicker({ accessibleRepos, isLoading, connectedRepos }: GitHubRepoPickerProps) {
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [queuingRepos, setQueuingRepos] = useState<Set<string>>(new Set())
  const ingestion = useGitHubIngestion()

  const connectedSet = useMemo(
    () => new Set((connectedRepos ?? []).map((r) => r.repoFullName)),
    [connectedRepos],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (accessibleRepos ?? []).filter((r) =>
      q === '' || r.fullName.toLowerCase().includes(q),
    )
  }, [accessibleRepos, search])

  const visible = filtered.slice(0, visibleCount)
  const remaining = filtered.length - visibleCount

  const handleAdd = (fullName: string) => {
    setQueuingRepos((prev) => new Set(prev).add(fullName))
    ingestion.mutate(
      { repoFullName: fullName },
      {
        onSettled: () => {
          setQueuingRepos((prev) => {
            const next = new Set(prev)
            next.delete(fullName)
            return next
          })
        },
      },
    )
  }

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Repositories</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Select repositories to index into the knowledge base
          </p>
        </div>
        {accessibleRepos && (
          <span className="text-xs text-zinc-600">{accessibleRepos.length} accessible</span>
        )}
      </div>

      <div className="border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <input
            type="text"
            placeholder="Search repositories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading repositories…</span>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {visible.map((repo) => {
            const isConnected = connectedSet.has(repo.fullName)
            const isQueuing = queuingRepos.has(repo.fullName)

            return (
              <div
                key={repo.id}
                className={`flex items-center justify-between px-4 py-2.5 ${isConnected ? 'bg-emerald-500/[0.03]' : isQueuing ? 'bg-indigo-500/[0.03]' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <GitHubRepoChip fullName={repo.fullName} />
                  <span className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-500">
                    <GitBranch className="h-2.5 w-2.5" />
                    {repo.defaultBranch}
                  </span>
                  {repo.private && (
                    <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400">
                      private
                    </span>
                  )}
                </div>

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
                    onClick={() => handleAdd(repo.fullName)}
                    disabled={ingestion.isPending}
                    className="py-1 px-2.5 text-[10px]"
                  >
                    + Add
                  </Button>
                )}
              </div>
            )
          })}

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="w-full py-2 text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              + {remaining} more repositories
            </button>
          )}

          {filtered.length === 0 && !isLoading && (
            <p className="py-6 text-center text-xs text-zinc-600">
              {search ? 'No repositories match your search.' : 'No accessible repositories found.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/github/components/GitHubRepoPicker.tsx
git commit -m "feat(github): add GitHubRepoPicker component"
```

---

## Task 8: GitHubConnectedRepos (Screen 2b)

**Files:**
- Create: `src/features/github/components/GitHubConnectedRepos.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/features/github/components/GitHubConnectedRepos.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { GitHubRepoChip } from './GitHubRepoChip'
import { GitHubSyncStatusBadge } from './GitHubSyncStatusBadge'
import { adminKeys } from '@/lib/api/query-keys'
import { triggerGitHubIngestionFn, removeConnectedRepoFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'
import type { ConnectedRepo } from '@/lib/types/github.types'

interface GitHubConnectedReposProps {
  readonly connectedRepos: ConnectedRepo[] | undefined
}

export function GitHubConnectedRepos({ connectedRepos }: GitHubConnectedReposProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  const resync = useMutation({
    mutationFn: (repoFullName: string) =>
      triggerGitHubIngestionFn({ data: { repoFullName, forceReindex: true } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      addToast('success', 'Re-sync queued.')
    },
    onError: (err: Error) => {
      addToast('error', `Re-sync failed: ${err.message}`)
    },
  })

  const remove = useMutation({
    mutationFn: (repoFullName: string) =>
      removeConnectedRepoFn({ data: { repoFullName } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.accessibleRepos() })
      addToast('success', 'Repository removed.')
    },
    onError: (err: Error) => {
      addToast('error', `Remove failed: ${err.message}`)
    },
  })

  const repos = connectedRepos ?? []

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Connected Repositories</p>
          <p className="mt-0.5 text-xs text-zinc-500">Indexed into the Bedrock knowledge base</p>
        </div>
        {repos.length > 0 && (
          <span className="text-xs text-zinc-600">{repos.length} connected</span>
        )}
      </div>

      {repos.length === 0 ? (
        <p className="py-8 text-center text-xs text-zinc-600">
          No repositories connected yet. Add one from the list above.
        </p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {repos.map((repo) => {
            const isSyncing = repo.syncStatus === 'syncing'
            const lastSynced = repo.lastSyncedAt
              ? new Date(repo.lastSyncedAt).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : null

            return (
              <div
                key={repo.repoFullName}
                className={`flex items-center justify-between px-4 py-2.5 ${isSyncing ? 'bg-indigo-500/[0.02]' : repo.syncStatus === 'error' ? 'bg-red-500/[0.02]' : ''}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <GitHubRepoChip fullName={repo.repoFullName} />
                  <GitHubSyncStatusBadge status={repo.syncStatus} />
                  {repo.syncStatus === 'complete' && lastSynced && (
                    <span className="text-[10px] text-zinc-600">{lastSynced}</span>
                  )}
                  {repo.syncStatus === 'error' && (
                    <span className="text-[10px] text-zinc-600">Ingestion failed</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    onClick={() => resync.mutate(repo.repoFullName)}
                    disabled={isSyncing || resync.isPending}
                    className="py-1 px-2 text-[10px]"
                  >
                    ↺ Re-sync
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => remove.mutate(repo.repoFullName)}
                    disabled={remove.isPending}
                    className="py-1 px-2 text-[10px]"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/github/components/GitHubConnectedRepos.tsx
git commit -m "feat(github): add GitHubConnectedRepos component"
```

---

## Task 9: Route `/settings/github`

**Files:**
- Create: `src/app/_dashboard.settings.github.tsx`

- [ ] **Step 1: Implement the route**

```tsx
// src/app/_dashboard.settings.github.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { GitHubAccountSection } from '@/features/github/components/GitHubAccountSection'
import { GitHubRepoPicker } from '@/features/github/components/GitHubRepoPicker'
import { GitHubConnectedRepos } from '@/features/github/components/GitHubConnectedRepos'
import { useGitHubInstallation } from '@/features/github/hooks/use-github-installation'
import { useGitHubAccessibleRepos } from '@/features/github/hooks/use-github-accessible-repos'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { handleGitHubInstallFn } from '@/server/github'
import { adminKeys } from '@/lib/api/query-keys'

const searchSchema = z.object({
  installation_id: z.string().optional(),
  setup_action: z.string().optional(),
})

export const Route = createFileRoute('/_dashboard/settings/github')({
  validateSearch: searchSchema,
  component: GitHubSettingsPage,
})

function GitHubSettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { installation_id } = Route.useSearch()

  const { data: installation, isLoading } = useGitHubInstallation()
  const { data: accessibleRepos, isLoading: isLoadingRepos } = useGitHubAccessibleRepos(
    Boolean(installation),
  )
  const { data: connectedRepos } = useGitHubConnectedRepos()

  useEffect(() => {
    if (!installation_id) return

    void (async () => {
      try {
        await handleGitHubInstallFn({ data: { installationId: installation_id } })
        await queryClient.invalidateQueries({ queryKey: adminKeys.github.installation() })
      } catch {
        // Installation may already be persisted — invalidate regardless
        await queryClient.invalidateQueries({ queryKey: adminKeys.github.installation() })
      } finally {
        void navigate({ replace: true, search: {} })
      }
    })()
  }, [installation_id, navigate, queryClient])

  return (
    <DashboardPage
      title="GitHub"
      description="Connect your GitHub account to index repositories into the knowledge base."
    >
      <div className="max-w-2xl space-y-4">
        <GitHubAccountSection installation={installation} isLoading={isLoading} />
        {installation && (
          <GitHubRepoPicker
            accessibleRepos={accessibleRepos}
            isLoading={isLoadingRepos}
            connectedRepos={connectedRepos}
          />
        )}
        {installation && <GitHubConnectedRepos connectedRepos={connectedRepos} />}
      </div>
    </DashboardPage>
  )
}
```

- [ ] **Step 2: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (TanStack Router will regenerate `routeTree.gen.ts` on next dev start).

- [ ] **Step 3: Commit**

```bash
git add src/app/_dashboard.settings.github.tsx
git commit -m "feat(github): add /settings/github route"
```

---

## Task 10: Sidebar + Applications Hub update

**Files:**
- Modify: `src/components/layouts/AppLayout.tsx`
- Modify: `src/app/_dashboard.applications.index.tsx`

- [ ] **Step 1: Add Settings navigation to AppLayout**

In `src/components/layouts/AppLayout.tsx`:

1. Add `Github` to the lucide-react import at the top (line 26 area):
   ```typescript
   import { ..., Github } from 'lucide-react'
   ```

2. Add `settingsNavigation` array after the `observabilityLinks` const (line 53 area):
   ```typescript
   const settingsNavigation = [
     { name: 'GitHub', href: '/settings/github', icon: Github },
   ] as const
   ```

3. Inside `SidebarNavList`, within the `<ul role="list" className="flex flex-1 flex-col gap-y-7">`, add a second `<li>` after the primary navigation `<li>` block:
   ```tsx
   <li>
     <div className="text-xs/6 font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
       Settings
     </div>
     <ul role="list" className="-mx-2 space-y-1">
       {settingsNavigation.map((item) => (
         <li key={item.name}>
           <Link
             to={item.href as string}
             activeProps={{ className: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' }}
             inactiveProps={{
               className: 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white',
             }}
             className="group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold transition-colors"
           >
             {({ isActive }) => (
               <>
                 <item.icon
                   aria-hidden="true"
                   className={classNames(
                     isActive ? 'text-teal-600 dark:text-teal-400' : 'text-zinc-400 dark:text-zinc-400 group-hover:text-teal-600 dark:group-hover:text-teal-400',
                     'size-6 shrink-0 transition-colors',
                   )}
                 />
                 {item.name}
               </>
             )}
           </Link>
         </li>
       ))}
     </ul>
   </li>
   ```

- [ ] **Step 2: Update Applications Hub card**

In `src/app/_dashboard.applications.index.tsx`, find the "GitHub Repositories" action entry and change:

```typescript
  {
    title: 'GitHub Repositories',
    href: '/applications/github',
    icon: Github,
    iconForeground: 'text-zinc-300',
    iconBackground: 'bg-zinc-700/50',
    description: 'Link and manage GitHub repositories for your job applications.',
  },
```

To:

```typescript
  {
    title: 'GitHub Repositories',
    href: '/settings/github',
    icon: Github,
    iconForeground: 'text-zinc-300',
    iconBackground: 'bg-zinc-700/50',
    description: 'Connect and manage GitHub repositories indexed into the knowledge base.',
  },
```

- [ ] **Step 3: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Verify tests still pass**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/AppLayout.tsx src/app/_dashboard.applications.index.tsx
git commit -m "feat(github): wire sidebar Settings section and update Applications Hub card"
```

---

## Task 11: Smoke test in browser

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify sidebar shows "Settings / GitHub" link**

Navigate to `http://localhost:5002/admin`. Sidebar should have a "Settings" group with "GitHub" link below the primary navigation.

- [ ] **Step 3: Verify `/settings/github` loads**

Click the GitHub sidebar link. Page should show `DashboardPage` with title "GitHub" and the `GitHubAccountSection` in its not-connected state (unless `GET /api/admin/github/installation` returns data).

- [ ] **Step 4: Verify Applications Hub card links to correct route**

Navigate to `http://localhost:5002/admin/applications`. Click "GitHub Repositories" card — should route to `/settings/github`, not `/applications/github`.

- [ ] **Step 5: Verify no 404 on old route**

Navigate to `http://localhost:5002/admin/applications/github` — should render the catch-all `_dashboard.$.tsx` 404 page, confirming the old route is gone.

- [ ] **Step 6: Add `VITE_GITHUB_APP_SLUG` to local env if testing connect flow**

```bash
echo "VITE_GITHUB_APP_SLUG=tucaken-admin" >> .env.local
```

Reload and verify "Connect GitHub" button text renders without `undefined`.
