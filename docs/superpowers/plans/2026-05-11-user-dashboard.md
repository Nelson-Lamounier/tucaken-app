# User Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin-only `/overview` route with a single-scroll user-facing Knowledge Base health dashboard, moving admin metrics to a new tab inside `/reports`.

**Architecture:** New `src/features/user-home/` feature folder with five focused components. `UserDashboard` orchestrates all data fetching and passes props down — no child fetches independently. `DashboardOverview` is untouched and embedded as an Admin tab in `ReportContainer`.

**Tech Stack:** React 19, TanStack Router v5, TanStack Query v5, Vitest, Tailwind v4, TypeScript strict.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/features/user-home/lib/kb-stats.ts` | Pure stat derivation — testable with no React |
| Create | `src/features/user-home/components/KbRepoList.tsx` | Read-only repo health list |
| Create | `src/features/user-home/components/CareerDataBreakdown.tsx` | Career entry type chips + latest import |
| Create | `src/features/user-home/components/ResumeFilesList.tsx` | Import history list (max 3 visible) |
| Create | `src/features/user-home/components/KbQuickActions.tsx` | 4 navigation action cards |
| Create | `src/features/user-home/components/UserDashboard.tsx` | Data orchestrator + page layout |
| Create | `src/__tests__/features/user-home/kb-stats.test.ts` | Unit tests for `deriveKbStats` |
| Modify | `src/app/_dashboard.overview.tsx` | Swap component import |
| Modify | `src/features/reports/components/ReportContainer.tsx` | Add Admin tab |

---

## Task 1: Pure KB stats logic

**Files:**
- Create: `src/features/user-home/lib/kb-stats.ts`
- Create: `src/__tests__/features/user-home/kb-stats.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/features/user-home/kb-stats.test.ts
import { describe, it, expect } from 'vitest'
import { deriveKbStats } from '@/features/user-home/lib/kb-stats'

describe('deriveKbStats', () => {
  const repo = (status: 'pending' | 'syncing' | 'complete' | 'error') =>
    ({ syncStatus: status })
  const entry = (type: string) => ({ entryType: type })
  const imp = (status: string, entries = 0) =>
    ({ status, careerEntriesCreated: Array(entries).fill('id'), embeddingsCreatedCount: 0 })

  it('counts repos by sync status', () => {
    const result = deriveKbStats(
      [repo('complete'), repo('syncing'), repo('error'), repo('pending')],
      [],
      [],
    )
    expect(result.repoCount).toBe(4)
    expect(result.syncedRepoCount).toBe(1)
    expect(result.pendingRepoCount).toBe(2) // syncing + pending
  })

  it('counts career entries by type', () => {
    const result = deriveKbStats([], [
      entry('experience'), entry('experience'),
      entry('education'),
      entry('skill'), entry('skill'), entry('skill'),
    ], [])
    expect(result.careerEntryCount).toBe(6)
    expect(result.experienceCount).toBe(2)
    expect(result.educationCount).toBe(1)
    expect(result.skillCount).toBe(3)
  })

  it('counts imports by status', () => {
    const result = deriveKbStats([], [], [
      imp('completed'), imp('ready_for_review'),
      imp('failed'),
      imp('parsing'),
    ])
    expect(result.importCount).toBe(4)
    expect(result.processedImportCount).toBe(2)
    expect(result.failedImportCount).toBe(1)
  })

  it('isReady true when at least one repo is synced', () => {
    const result = deriveKbStats([repo('complete')], [], [])
    expect(result.isReady).toBe(true)
  })

  it('isReady true when at least one import is processed', () => {
    const result = deriveKbStats([], [], [imp('completed')])
    expect(result.isReady).toBe(true)
  })

  it('isReady false when no repos synced and no imports processed', () => {
    const result = deriveKbStats([repo('pending')], [], [imp('parsing')])
    expect(result.isReady).toBe(false)
  })

  it('isReady false on empty data', () => {
    const result = deriveKbStats([], [], [])
    expect(result.isReady).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — expect failure (module not found)**

```bash
npx vitest run src/__tests__/features/user-home/kb-stats.test.ts --reporter=verbose
```

Expected: `Error: Cannot find module '@/features/user-home/lib/kb-stats'`

- [ ] **Step 3: Create the implementation**

```typescript
// src/features/user-home/lib/kb-stats.ts

export interface KbRepo {
  syncStatus: 'pending' | 'syncing' | 'complete' | 'error'
}

export interface KbEntry {
  entryType: string
}

export interface KbImport {
  status: string
  careerEntriesCreated: string[]
  embeddingsCreatedCount: number
}

export interface KbStats {
  repoCount: number
  syncedRepoCount: number
  pendingRepoCount: number
  careerEntryCount: number
  experienceCount: number
  educationCount: number
  skillCount: number
  importCount: number
  processedImportCount: number
  failedImportCount: number
  isReady: boolean
}

export function deriveKbStats(
  repos: KbRepo[],
  entries: KbEntry[],
  imports: KbImport[],
): KbStats {
  const syncedRepoCount = repos.filter(r => r.syncStatus === 'complete').length
  const pendingRepoCount = repos.filter(
    r => r.syncStatus === 'pending' || r.syncStatus === 'syncing',
  ).length
  const processedImportCount = imports.filter(
    i => i.status === 'completed' || i.status === 'ready_for_review',
  ).length
  const failedImportCount = imports.filter(i => i.status === 'failed').length

  return {
    repoCount: repos.length,
    syncedRepoCount,
    pendingRepoCount,
    careerEntryCount: entries.length,
    experienceCount: entries.filter(e => e.entryType === 'experience').length,
    educationCount: entries.filter(e => e.entryType === 'education').length,
    skillCount: entries.filter(e => e.entryType === 'skill').length,
    importCount: imports.length,
    processedImportCount,
    failedImportCount,
    isReady: syncedRepoCount >= 1 || processedImportCount >= 1,
  }
}
```

- [ ] **Step 4: Run test — expect all green**

```bash
npx vitest run src/__tests__/features/user-home/kb-stats.test.ts --reporter=verbose
```

Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add src/features/user-home/lib/kb-stats.ts src/__tests__/features/user-home/kb-stats.test.ts
git commit -m "feat(user-home): add KB stats derivation logic with tests"
```

---

## Task 2: KbRepoList component

**Files:**
- Create: `src/features/user-home/components/KbRepoList.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/user-home/components/KbRepoList.tsx
'use client'

import { Link } from '@tanstack/react-router'
import { GitBranch } from 'lucide-react'
import { GitHubRepoChip } from '@/features/github/components/GitHubRepoChip'
import { GitHubSyncStatusBadge } from '@/features/github/components/GitHubSyncStatusBadge'
import type { ConnectedRepo } from '@/lib/types/github.types'

interface KbRepoListProps {
  readonly repos: ConnectedRepo[]
  readonly isLoading: boolean
}

export function KbRepoList({ repos, isLoading }: KbRepoListProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Connected Repositories</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Indexed into your knowledge base</p>
        </div>
        <Link
          to="/settings/github"
          search={{ tab: 'repositories' }}
          className="text-xs text-teal-400 transition-colors hover:text-teal-300"
        >
          Manage →
        </Link>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-white/10 py-8 text-center text-xs text-zinc-600">
          Loading repositories…
        </div>
      ) : repos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 py-10 text-center">
          <GitBranch className="mx-auto mb-2 size-7 text-zinc-700" />
          <p className="text-sm text-zinc-500">No repositories connected</p>
          <Link
            to="/settings/github"
            search={{ tab: 'repositories' }}
            className="mt-1.5 inline-block text-xs text-teal-400 hover:text-teal-300"
          >
            Connect your first repo →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/10">
          {repos.map((repo) => {
            const lastSynced = repo.lastSyncedAt
              ? new Date(repo.lastSyncedAt).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : null

            return (
              <li key={repo.repoFullName} className="flex items-center gap-3 px-4 py-3">
                <GitHubRepoChip fullName={repo.repoFullName} />
                <GitHubSyncStatusBadge status={repo.syncStatus} />
                {lastSynced && repo.syncStatus === 'complete' && (
                  <span className="text-[10px] text-zinc-600">{lastSynced}</span>
                )}
                <span className="ml-auto text-[10px] text-zinc-700">— docs</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "user-home"
```

Expected: no output (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/features/user-home/components/KbRepoList.tsx
git commit -m "feat(user-home): add KbRepoList read-only component"
```

---

## Task 3: CareerDataBreakdown component

**Files:**
- Create: `src/features/user-home/components/CareerDataBreakdown.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/user-home/components/CareerDataBreakdown.tsx
'use client'

import { Link } from '@tanstack/react-router'
import { BookOpen, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import type { CareerEntry, ResumeImportRecord } from '@/server/resume-imports'

const ENTRY_LABELS: Record<string, string> = {
  experience:    'Experience',
  education:     'Education',
  skill:         'Skills',
  certification: 'Certifications',
  project:       'Projects',
  achievement:   'Achievements',
}

interface CareerDataBreakdownProps {
  readonly entries: CareerEntry[]
  readonly latestImport: ResumeImportRecord | undefined
  readonly isLoading: boolean
}

export function CareerDataBreakdown({
  entries,
  latestImport,
  isLoading,
}: CareerDataBreakdownProps) {
  const countsByType = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.entryType] = (acc[e.entryType] ?? 0) + 1
    return acc
  }, {})

  const isOk      = latestImport?.status === 'completed' || latestImport?.status === 'ready_for_review'
  const isFailed  = latestImport?.status === 'failed'
  const isPending = latestImport !== undefined && !isOk && !isFailed

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Career Data</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Extracted from your uploaded resume</p>
        </div>
        <Link
          to="/settings/github"
          search={{ tab: 'resumes' }}
          className="text-xs text-teal-400 transition-colors hover:text-teal-300"
        >
          View imports →
        </Link>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-white/10 py-8 text-center text-xs text-zinc-600">
          Loading career data…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 py-10 text-center">
          <BookOpen className="mx-auto mb-2 size-7 text-zinc-700" />
          <p className="text-sm text-zinc-500">No career data extracted yet</p>
          <Link
            to="/settings/github"
            search={{ tab: 'resumes' }}
            className="mt-1.5 inline-block text-xs text-teal-400 hover:text-teal-300"
          >
            Upload a resume →
          </Link>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-white/10 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(countsByType).map(([type, count]) => (
              <span
                key={type}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-zinc-300"
              >
                {count} {ENTRY_LABELS[type] ?? type}
              </span>
            ))}
          </div>

          {latestImport && (
            <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3">
              {isOk      && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />}
              {isFailed  && <AlertCircle  className="size-3.5 shrink-0 text-red-400" />}
              {isPending && <Loader2      className="size-3.5 shrink-0 animate-spin text-indigo-400" />}
              <span className="min-w-0 truncate text-xs text-zinc-400">
                {latestImport.originalFilename}
              </span>
              {latestImport.embeddingsCreatedCount > 0 && (
                <span className="ml-auto shrink-0 text-[10px] text-zinc-600">
                  {latestImport.embeddingsCreatedCount} embeddings
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "user-home"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/features/user-home/components/CareerDataBreakdown.tsx
git commit -m "feat(user-home): add CareerDataBreakdown component"
```

---

## Task 4: ResumeFilesList component

**Files:**
- Create: `src/features/user-home/components/ResumeFilesList.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/user-home/components/ResumeFilesList.tsx
'use client'

import { Link } from '@tanstack/react-router'
import { FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import type { ResumeImportRecord } from '@/server/resume-imports'

const MAX_VISIBLE = 3

interface ResumeFilesListProps {
  readonly imports: ResumeImportRecord[]
  readonly isLoading: boolean
}

export function ResumeFilesList({ imports, isLoading }: ResumeFilesListProps) {
  const visible  = imports.slice(0, MAX_VISIBLE)
  const overflow = imports.length - MAX_VISIBLE

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Resume Files</h3>
          <p className="mt-0.5 text-xs text-zinc-500">PDFs processed to seed your knowledge base</p>
        </div>
        <Link
          to="/settings/github"
          search={{ tab: 'resumes' }}
          className="text-xs text-teal-400 transition-colors hover:text-teal-300"
        >
          Upload →
        </Link>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-white/10 py-8 text-center text-xs text-zinc-600">
          Loading resume files…
        </div>
      ) : imports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 py-10 text-center">
          <FileText className="mx-auto mb-2 size-7 text-zinc-700" />
          <p className="text-sm text-zinc-500">No resume files uploaded yet</p>
          <Link
            to="/settings/github"
            search={{ tab: 'resumes' }}
            className="mt-1.5 inline-block text-xs text-teal-400 hover:text-teal-300"
          >
            Upload your first resume →
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/10">
            {visible.map((imp) => {
              const isOk     = imp.status === 'completed' || imp.status === 'ready_for_review'
              const isFailed = imp.status === 'failed'

              return (
                <li key={imp.id} className="flex items-center gap-3 px-4 py-3">
                  {isOk     && <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />}
                  {isFailed && <AlertCircle  className="size-4 shrink-0 text-red-400" />}
                  {!isOk && !isFailed && (
                    <Loader2 className="size-4 shrink-0 animate-spin text-indigo-400" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-200">{imp.originalFilename}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {new Date(imp.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                      {imp.careerEntriesCreated.length > 0 && (
                        <> · {imp.careerEntriesCreated.length} entries</>
                      )}
                    </p>
                  </div>

                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                      isOk
                        ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/25'
                        : isFailed
                          ? 'bg-red-500/15 text-red-300 ring-red-400/25'
                          : 'bg-indigo-500/15 text-indigo-300 ring-indigo-400/25',
                    ].join(' ')}
                  >
                    {isOk ? 'Processed' : isFailed ? 'Failed' : 'Processing'}
                  </span>
                </li>
              )
            })}
          </ul>

          {overflow > 0 && (
            <div className="text-right">
              <Link
                to="/settings/github"
                search={{ tab: 'resumes' }}
                className="text-xs text-teal-400 hover:text-teal-300"
              >
                View all {imports.length} →
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "user-home"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/features/user-home/components/ResumeFilesList.tsx
git commit -m "feat(user-home): add ResumeFilesList component"
```

---

## Task 5: KbQuickActions component

**Files:**
- Create: `src/features/user-home/components/KbQuickActions.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/user-home/components/KbQuickActions.tsx
'use client'

import { Link } from '@tanstack/react-router'
import { Bot, Upload, GitBranch, Briefcase } from 'lucide-react'

export function KbQuickActions() {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-100">Quick Actions</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">

        <Link
          to="/ai-agent"
          className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:border-teal-500/30 hover:bg-white/[0.04]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20">
            <Bot className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Run AI Agent</p>
            <p className="text-xs text-zinc-500">Generate a tailored resume</p>
          </div>
        </Link>

        <Link
          to="/settings/github"
          search={{ tab: 'resumes' }}
          className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:border-teal-500/30 hover:bg-white/[0.04]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20">
            <Upload className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Upload Resume</p>
            <p className="text-xs text-zinc-500">Add a PDF to your knowledge base</p>
          </div>
        </Link>

        <Link
          to="/settings/github"
          search={{ tab: 'repositories' }}
          className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:border-teal-500/30 hover:bg-white/[0.04]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20">
            <GitBranch className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Connect Repo</p>
            <p className="text-xs text-zinc-500">Index a GitHub repository</p>
          </div>
        </Link>

        <Link
          to="/applications"
          className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:border-teal-500/30 hover:bg-white/[0.04]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20">
            <Briefcase className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Applications</p>
            <p className="text-xs text-zinc-500">Track your job pipeline</p>
          </div>
        </Link>

      </div>
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "user-home"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/features/user-home/components/KbQuickActions.tsx
git commit -m "feat(user-home): add KbQuickActions navigation component"
```

---

## Task 6: UserDashboard orchestrator

**Files:**
- Create: `src/features/user-home/components/UserDashboard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/user-home/components/UserDashboard.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { Stats } from '@/components/ui/Stats'
import { Button } from '@/components/ui/Button'
import { useGitHubConnectedRepos } from '@/features/github/hooks/use-github-connected-repos'
import { adminKeys } from '@/lib/api/query-keys'
import { listResumeImportsFn, listCareerEntriesFn } from '@/server/resume-imports'
import { KbRepoList } from './KbRepoList'
import { CareerDataBreakdown } from './CareerDataBreakdown'
import { ResumeFilesList } from './ResumeFilesList'
import { KbQuickActions } from './KbQuickActions'
import { deriveKbStats } from '../lib/kb-stats'

export function UserDashboard() {
  const { data: repos = [], isLoading: loadingRepos } = useGitHubConnectedRepos()

  const { data: imports = [], isLoading: loadingImports } = useQuery({
    queryKey: adminKeys.resumeImports.list(),
    queryFn:  () => listResumeImportsFn(),
  })

  const { data: entries = [], isLoading: loadingEntries } = useQuery({
    queryKey: adminKeys.resumeImports.entries(),
    queryFn:  () => listCareerEntriesFn({ data: {} }),
  })

  const isLoading = loadingRepos || loadingImports || loadingEntries
  const stats     = deriveKbStats(repos, entries, imports)
  const latestImport = imports[0]

  const heroStats = [
    {
      name: 'Connected Repositories',
      value: isLoading ? '…' : stats.repoCount.toString(),
      change: isLoading
        ? ''
        : `${stats.syncedRepoCount} synced · ${stats.pendingRepoCount} pending`,
      changeType: 'positive' as const,
    },
    {
      name: 'Career Entries',
      value: isLoading ? '…' : stats.careerEntryCount.toString(),
      change: isLoading
        ? ''
        : `${stats.experienceCount} experience · ${stats.educationCount} education · ${stats.skillCount} skills`,
      changeType: 'positive' as const,
    },
    {
      name: 'Resume Uploads',
      value: isLoading ? '…' : stats.importCount.toString(),
      change: isLoading
        ? ''
        : `${stats.processedImportCount} processed · ${stats.failedImportCount} failed`,
      changeType: (stats.failedImportCount > 0 ? 'negative' : 'positive') as 'positive' | 'negative',
    },
    {
      name: 'Knowledge Base',
      value: isLoading ? '…' : stats.isReady ? 'Ready' : 'Needs setup',
      change: isLoading
        ? ''
        : stats.isReady
          ? 'AI agent has data to work with'
          : 'Upload a resume or connect a repo',
      changeType: (stats.isReady ? 'positive' : 'negative') as 'positive' | 'negative',
    },
  ]

  return (
    <DashboardPage
      title="Knowledge Base"
      description="Your AI agent's data health at a glance."
      actions={
        <Link to="/ai-agent">
          <Button variant="primary">Run AI Agent</Button>
        </Link>
      }
    >
      <div className="space-y-8">
        <Stats stats={heroStats} />
        <KbRepoList repos={repos} isLoading={loadingRepos} />
        <CareerDataBreakdown
          entries={entries}
          latestImport={latestImport}
          isLoading={loadingEntries || loadingImports}
        />
        <ResumeFilesList imports={imports} isLoading={loadingImports} />
        <KbQuickActions />
      </div>
    </DashboardPage>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "user-home"
```

Expected: no output

- [ ] **Step 3: Run all tests — nothing should break**

```bash
npx vitest run --reporter=verbose
```

Expected: all existing tests still pass (44+7 = 51 tests)

- [ ] **Step 4: Commit**

```bash
git add src/features/user-home/components/UserDashboard.tsx
git commit -m "feat(user-home): add UserDashboard orchestrator"
```

---

## Task 7: Wire /overview route

**Files:**
- Modify: `src/app/_dashboard.overview.tsx`

- [ ] **Step 1: Replace the route component**

Replace the entire file content with:

```tsx
// src/app/_dashboard.overview.tsx
import { createFileRoute } from '@tanstack/react-router'
import { UserDashboard } from '@/features/user-home/components/UserDashboard'

export const Route = createFileRoute('/_dashboard/overview')({
  component: UserDashboard,
})
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "overview"
```

Expected: no output

- [ ] **Step 3: Start dev server and verify manually**

```bash
npm run dev
```

Open `http://localhost:3000/overview` (or whichever port is shown).

Verify:
- Page title shows "Knowledge Base"
- Hero stats row renders with 4 cards (values may show "…" if data loads slowly)
- All 4 sections visible on scroll: repos, career data, resume files, quick actions
- Empty states shown if user has no data (dashed border, icon, CTA link)
- "Run AI Agent" button in header links to `/ai-agent`

- [ ] **Step 4: Commit**

```bash
git add src/app/_dashboard.overview.tsx
git commit -m "feat(user-home): promote UserDashboard to /overview landing route"
```

---

## Task 8: Add Admin tab to ReportContainer

**Files:**
- Modify: `src/features/reports/components/ReportContainer.tsx`

- [ ] **Step 1: Add the import at top of file**

At the top of `src/features/reports/components/ReportContainer.tsx`, after the existing imports, add:

```tsx
import { DashboardOverview } from '@/features/overview/components/DashboardOverview'
```

- [ ] **Step 2: Extend the tab union type and tabs array**

Find line 36:
```tsx
const [activeTab, setActiveTab] = useState<'all' | 'pipelines' | 'chatbot' | 'selfhealing' | 'prompt-quality'>('all')
```

Replace with:
```tsx
const [activeTab, setActiveTab] = useState<'all' | 'pipelines' | 'chatbot' | 'selfhealing' | 'prompt-quality' | 'admin'>('all')
```

Find lines 38–44:
```tsx
const tabs = [
  { id: 'all', name: 'Combined Overview' },
  { id: 'pipelines', name: 'Content Pipelines' },
  { id: 'chatbot', name: 'Chatbot Application' },
  { id: 'selfhealing', name: 'Self-Healing Automation' },
  { id: 'prompt-quality', name: 'Prompt Quality' },
]
```

Replace with:
```tsx
const tabs = [
  { id: 'all', name: 'Combined Overview' },
  { id: 'pipelines', name: 'Content Pipelines' },
  { id: 'chatbot', name: 'Chatbot Application' },
  { id: 'selfhealing', name: 'Self-Healing Automation' },
  { id: 'prompt-quality', name: 'Prompt Quality' },
  { id: 'admin', name: 'Admin' },
]
```

- [ ] **Step 3: Add the Admin tab panel**

After the closing `)}` of the `prompt-quality` tab panel (around line 426), add:

```tsx
{/* Admin — platform overview metrics */}
{activeTab === 'admin' && (
  <div>
    <div className="mb-4">
      <h2 className="text-base/7 font-semibold text-indigo-400">Platform Overview</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Admin-only metrics: articles, comments, AI pipeline costs.
      </p>
    </div>
    <DashboardOverview />
  </div>
)}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "ReportContainer\|DashboardOverview"
```

Expected: no output

- [ ] **Step 5: Run all tests**

```bash
npx vitest run --reporter=verbose
```

Expected: all 51 tests pass

- [ ] **Step 6: Verify in browser**

Navigate to `http://localhost:3000/reports`. Confirm the **Admin** tab appears last in the tab bar. Click it — the existing platform overview content renders inside the reports page.

- [ ] **Step 7: Commit**

```bash
git add src/features/reports/components/ReportContainer.tsx
git commit -m "feat(reports): add Admin tab embedding DashboardOverview"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| New feature folder + 5 files | Tasks 1–6 ✓ |
| Swap `_dashboard.overview.tsx` | Task 7 ✓ |
| Admin tab in `/reports` | Task 8 ✓ |
| Hero Stats 4 cards with derivation | Task 1 (logic) + Task 6 (render) ✓ |
| KbRepoList read-only, "Manage →" link | Task 2 ✓ |
| CareerDataBreakdown chips + latest import | Task 3 ✓ |
| ResumeFilesList max 3 + overflow link | Task 4 ✓ |
| KbQuickActions 4 cards | Task 5 ✓ |
| API gap: `— docs` placeholder | Task 2 (`ml-auto text-[10px] text-zinc-700`) ✓ |
| Reuse `Stats`, `GitHubRepoChip`, `GitHubSyncStatusBadge`, `DashboardPage`, `Button` | All tasks ✓ |
| No mutations on overview page | All components are read-only ✓ |

**Placeholder scan:** none found.

**Type consistency:** `deriveKbStats(repos, entries, imports)` — `KbRepo`, `KbEntry`, `KbImport` local interfaces match the structural shape of `ConnectedRepo`, `CareerEntry`, `ResumeImportRecord` so no adapter needed at the call site in `UserDashboard`.
