# KB Repo Profile Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface per-repo AI profile data (quality score, classification, one-liner, tech stack) in the KB dashboard by replacing the compact `KbRepoList` with rich profile cards.

**Architecture:** Extend the admin-api `GET /github/connected-repos` query with a LEFT JOIN on `repository_profiles`, thread the new nullable fields through the frontend `ConnectedRepo` type, then replace `KbRepoList` with a `RepoProfileCards` component that renders a full card per repo.

**Tech Stack:** Hono (admin-api), Jest (admin-api tests), React 19, TanStack Router, Tailwind v4, Vitest (frontend tests), TypeScript.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `admin-api/src/routes/github.ts` | Modify | Add LEFT JOIN on `repository_profiles`, extend `ConnectedRepoRow`, extend route mapping |
| `admin-api/__tests__/routes/github.test.ts` | Modify | Extend fixture + add 2 profile-field assertions |
| `src/lib/types/github.types.ts` | Modify | Add `ScoreBreakdown`, `RepoClassification`, extend `ConnectedRepo` |
| `src/features/user-home/components/KbRepoList.tsx` | Delete | Replaced by `RepoProfileCards` |
| `src/features/user-home/components/RepoProfileCards.tsx` | Create | Rich card list for connected repos with score, classification, AI profile |
| `src/features/user-home/components/UserDashboard.tsx` | Modify | Swap `KbRepoList` import/usage for `RepoProfileCards` |

---

## Task 1: Extend admin-api test with profile field assertions (TDD — write failing tests first)

**Files:**
- Modify: `admin-api/__tests__/routes/github.test.ts`

- [ ] **Step 1: Extend the `connectedRepoRow` fixture with profile fields**

In `admin-api/__tests__/routes/github.test.ts`, replace the existing `connectedRepoRow` constant (around line 144) with:

```typescript
/** Connected repo row (joins repositories + repo_sync_state + repository_profiles) */
const connectedRepoRow: Row = {
    full_name:          'Nelson-Lamounier/cdk-monitoring',
    default_branch:     'develop',
    index_status:       'pending',
    added_at:           new Date('2026-04-29T10:00:00Z'),
    sync_status:        'complete',
    last_synced_at:     new Date('2026-04-29T11:00:00Z'),
    file_count:         393,
    chunk_count:        1420,
    error_message:      null,
    quality_score:      0.80,
    quality_breakdown:  { has_readme: 0.25, has_manifest: 0.20, has_ci: 0.15, has_changelog: 0, has_tests: 0, commit_count: 0.10, confidence: 0.10 },
    classification:     'project',
    extraction_status:  'completed',
    one_liner:          'AWS CDK constructs for automated CloudWatch monitoring dashboards.',
    domain:             'devops',
    tech_stack:         ['TypeScript', 'AWS CDK', 'CloudWatch'],
    complexity:         'moderate',
    confidence:         0.90,
};
```

- [ ] **Step 2: Add two new test cases in the `GET /connected-repos` describe block**

After the existing `'returns repos with sync status from join'` test (around line 337), add:

```typescript
it('includes profile fields when profile exists', async () => {
    seedQuery([connectedRepoRow]);

    const res  = await buildApp().request('/connected-repos');
    const body = await res.json() as { repos: Array<Record<string, unknown>> };

    expect(res.status).toBe(200);
    const repo = body.repos[0]!;
    expect(repo['qualityScore']).toBe(0.80);
    expect(repo['classification']).toBe('project');
    expect(repo['extractionStatus']).toBe('completed');
    expect(repo['oneLiner']).toBe('AWS CDK constructs for automated CloudWatch monitoring dashboards.');
    expect(repo['domain']).toBe('devops');
    expect(repo['techStack']).toEqual(['TypeScript', 'AWS CDK', 'CloudWatch']);
    expect(repo['complexity']).toBe('moderate');
    expect(repo['confidence']).toBe(0.90);
    expect(repo['qualityBreakdown']).toMatchObject({ has_readme: 0.25, has_manifest: 0.20 });
});

it('returns null profile fields when repo has no profile', async () => {
    const rowWithoutProfile: Row = {
        full_name:         'Nelson-Lamounier/cdk-monitoring',
        default_branch:    'develop',
        index_status:      'pending',
        added_at:          new Date('2026-04-29T10:00:00Z'),
        sync_status:       'complete',
        last_synced_at:    new Date('2026-04-29T11:00:00Z'),
        file_count:        393,
        chunk_count:       1420,
        error_message:     null,
        quality_score:     null,
        quality_breakdown: null,
        classification:    null,
        extraction_status: null,
        one_liner:         null,
        domain:            null,
        tech_stack:        null,
        complexity:        null,
        confidence:        null,
    };
    seedQuery([rowWithoutProfile]);

    const res  = await buildApp().request('/connected-repos');
    const body = await res.json() as { repos: Array<Record<string, unknown>> };

    expect(res.status).toBe(200);
    const repo = body.repos[0]!;
    expect(repo['qualityScore']).toBeNull();
    expect(repo['classification']).toBeNull();
    expect(repo['oneLiner']).toBeNull();
    expect(repo['techStack']).toBeNull();
});
```

- [ ] **Step 3: Run the tests — confirm the two new tests fail**

```bash
cd admin-api
NODE_OPTIONS='--experimental-vm-modules' jest --testPathPattern="github" --verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|●)"
```

Expected: existing tests pass, the two new tests fail with something like `expect(received).toBe(expected) — received: undefined`.

---

## Task 2: Extend admin-api SQL query and route mapping (make tests pass)

**Files:**
- Modify: `admin-api/src/routes/github.ts`

- [ ] **Step 1: Extend `ConnectedRepoRow` interface**

Replace the existing `ConnectedRepoRow` interface (around line 131) with:

```typescript
interface ConnectedRepoRow {
    full_name:          string;
    default_branch:     string;
    index_status:       string;
    added_at:           Date;
    sync_status:        string | null;
    last_synced_at:     Date | null;
    file_count:         number | null;
    chunk_count:        number | null;
    error_message:      string | null;
    // profile fields — all nullable (LEFT JOIN; no profile yet = nulls)
    quality_score:      number | null;
    quality_breakdown:  Record<string, number> | null;
    classification:     string | null;
    extraction_status:  string | null;
    one_liner:          string | null;
    domain:             string | null;
    tech_stack:         string[] | null;
    complexity:         string | null;
    confidence:         number | null;
}
```

- [ ] **Step 2: Replace the `listConnectedRepos` SQL query**

Replace the `listConnectedRepos` function body (around line 143) with:

```typescript
async function listConnectedRepos(pool: Pool, userId: string): Promise<ConnectedRepoRow[]> {
    const { rows } = await pool.query<ConnectedRepoRow>(
        `SELECT r.full_name, r.default_branch, r.index_status, r.added_at,
                s.sync_status, s.last_synced_at, s.file_count, s.chunk_count, s.error_message,
                p.quality_score, p.quality_breakdown, p.classification, p.extraction_status,
                p.extracted->>'one_liner'             AS one_liner,
                p.extracted->>'domain'                AS domain,
                p.extracted->'tech_stack'             AS tech_stack,
                p.extracted->>'complexity'            AS complexity,
                (p.extracted->>'confidence')::float   AS confidence
         FROM repositories r
         LEFT JOIN repo_sync_state s
           ON s.user_id = r.user_id AND s.repo_full_name = r.full_name
         LEFT JOIN repository_profiles p
           ON p.user_id = r.user_id AND p.repo_full_name = r.full_name
         WHERE r.user_id = $1::uuid AND r.provider = 'github'
         ORDER BY r.added_at DESC`,
        [userId],
    );
    return rows;
}
```

- [ ] **Step 3: Extend the route handler mapping**

In the `router.get('/connected-repos', ...)` handler (around line 557), replace the `repos` mapping with:

```typescript
const repos = rows.map(r => {
    const [owner, name] = r.full_name.split('/');
    return {
        repoFullName:      r.full_name,
        owner:             owner ?? '',
        name:              name  ?? '',
        defaultBranch:     r.default_branch,
        syncStatus:        r.sync_status ?? r.index_status,
        lastSyncedAt:      r.last_synced_at?.toISOString(),
        fileCount:         r.file_count ?? 0,
        chunkCount:        r.chunk_count ?? 0,
        errorMessage:      r.error_message,
        addedAt:           r.added_at.toISOString(),
        qualityScore:      r.quality_score      ?? null,
        qualityBreakdown:  r.quality_breakdown  ?? null,
        classification:    r.classification     ?? null,
        extractionStatus:  r.extraction_status  ?? null,
        oneLiner:          r.one_liner          ?? null,
        domain:            r.domain             ?? null,
        techStack:         r.tech_stack         ?? null,
        complexity:        r.complexity         ?? null,
        confidence:        r.confidence         ?? null,
    };
});
```

- [ ] **Step 4: Run the tests — confirm all pass**

```bash
cd admin-api
NODE_OPTIONS='--experimental-vm-modules' jest --testPathPattern="github" --verbose 2>&1 | grep -E "(PASS|FAIL|SKIP|✓|✗|×|●|Tests:)"
```

Expected: all tests pass including the two new ones.

- [ ] **Step 5: Run typecheck**

```bash
cd admin-api
yarn typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd admin-api
git add src/routes/github.ts __tests__/routes/github.test.ts
git commit -m "feat(api): include repository profile fields in GET /github/connected-repos"
```

---

## Task 3: Extend frontend ConnectedRepo type

**Files:**
- Modify: `src/lib/types/github.types.ts`

- [ ] **Step 1: Add `ScoreBreakdown`, `RepoClassification`, and extend `ConnectedRepo`**

Replace the full contents of `src/lib/types/github.types.ts` with:

```typescript
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

export interface ScoreBreakdown {
  readonly has_readme:    number
  readonly has_manifest:  number
  readonly has_ci:        number
  readonly has_changelog: number
  readonly has_tests:     number
  readonly commit_count:  number
  readonly confidence:    number
}

export type RepoClassification =
  | 'project'
  | 'fork'
  | 'tutorial'
  | 'abandoned'
  | 'noise'
  | 'stale'

export interface ConnectedRepo {
  readonly repoFullName:     string
  readonly owner:            string
  readonly name:             string
  readonly defaultBranch:    string
  readonly syncStatus:       RepoSyncStatus
  readonly lastSyncedAt?:    string
  readonly pipelineRunId?:   string
  readonly jobName?:         string
  readonly addedAt:          string
  readonly qualityScore?:    number | null
  readonly qualityBreakdown?: ScoreBreakdown | null
  readonly classification?:  RepoClassification | null
  readonly extractionStatus?: string | null
  readonly oneLiner?:        string | null
  readonly domain?:          string | null
  readonly techStack?:       string[] | null
  readonly complexity?:      string | null
  readonly confidence?:      number | null
}
```

- [ ] **Step 2: Run typecheck on the frontend**

```bash
yarn typecheck
```

Expected: no errors. If any consumer of `ConnectedRepo` breaks, check that the new fields are `optional` (they are — existing code won't break).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/github.types.ts
git commit -m "feat(types): add ScoreBreakdown, RepoClassification and profile fields to ConnectedRepo"
```

---

## Task 4: Create RepoProfileCards and update UserDashboard

**Files:**
- Create: `src/features/user-home/components/RepoProfileCards.tsx`
- Delete: `src/features/user-home/components/KbRepoList.tsx`
- Modify: `src/features/user-home/components/UserDashboard.tsx`

- [ ] **Step 1: Create `RepoProfileCards.tsx`**

Create `src/features/user-home/components/RepoProfileCards.tsx`:

```tsx
'use client'

import { Link } from '@tanstack/react-router'
import { GitBranch, RefreshCw } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GitHubRepoChip } from '@/features/github/components/GitHubRepoChip'
import { GitHubSyncStatusBadge } from '@/features/github/components/GitHubSyncStatusBadge'
import { triggerGitHubIngestionFn } from '@/server/github'
import { githubKeys } from '@/lib/api/query-keys'
import type { ConnectedRepo, RepoClassification, ScoreBreakdown } from '@/lib/types/github.types'

interface RepoProfileCardsProps {
  readonly repos: ConnectedRepo[]
  readonly isLoading: boolean
}

// ---------------------------------------------------------------------------
// Classification badge
// ---------------------------------------------------------------------------

const CLASSIFICATION_STYLES: Record<RepoClassification, string> = {
  project:   'border-teal-500/20 bg-teal-500/10 text-teal-300',
  stale:     'border-amber-500/20 bg-amber-500/10 text-amber-300',
  fork:      'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
  noise:     'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
  abandoned: 'border-red-500/20 bg-red-500/10 text-red-300',
  tutorial:  'border-purple-500/20 bg-purple-500/10 text-purple-300',
}

function ClassificationBadge({ value }: { readonly value: RepoClassification }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_STYLES[value]}`}>
      {value}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Score bar + signal pills
// ---------------------------------------------------------------------------

const SIGNALS: { label: string; key: keyof ScoreBreakdown }[] = [
  { label: 'README',    key: 'has_readme' },
  { label: 'Manifest',  key: 'has_manifest' },
  { label: 'CI',        key: 'has_ci' },
  { label: 'Changelog', key: 'has_changelog' },
  { label: 'Tests',     key: 'has_tests' },
  { label: 'Commits',   key: 'commit_count' },
  { label: 'Conf',      key: 'confidence' },
]

function scoreBarColor(score: number): string {
  if (score >= 0.7) return 'bg-teal-500'
  if (score >= 0.4) return 'bg-amber-500'
  return 'bg-red-500'
}

function ScoreSection({
  score,
  breakdown,
}: {
  readonly score: number
  readonly breakdown: ScoreBreakdown | null | undefined
}) {
  const pct = Math.round(score * 100)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">Quality Score</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-8 text-right text-xs font-semibold tabular-nums text-zinc-300">
          {pct}%
        </span>
      </div>
      {breakdown && (
        <div className="flex flex-wrap gap-1">
          {SIGNALS.map(({ label, key }) => {
            const active = (breakdown[key] ?? 0) > 0
            return (
              <span
                key={key}
                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                  active
                    ? 'border-teal-500/20 bg-teal-500/8 text-teal-400'
                    : 'border-white/8 bg-white/4 text-zinc-600 line-through'
                }`}
              >
                {label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual card
// ---------------------------------------------------------------------------

function RepoCard({ repo }: { readonly repo: ConnectedRepo }) {
  const queryClient = useQueryClient()
  const { mutate: reindex, isPending } = useMutation({
    mutationFn: () =>
      triggerGitHubIngestionFn({ data: { repoFullName: repo.repoFullName, forceReindex: true } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: githubKeys.connectedRepos() }),
  })

  const lastSynced = repo.lastSyncedAt
    ? new Date(repo.lastSyncedAt).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const hasProfile =
    repo.extractionStatus === 'completed' || repo.extractionStatus === 'ready_for_review'

  const isPendingProfile =
    repo.extractionStatus === 'pending' || repo.extractionStatus === 'extracting'

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitHubRepoChip fullName={repo.repoFullName} />
        {repo.classification && <ClassificationBadge value={repo.classification} />}
        <button
          type="button"
          disabled={isPending || repo.syncStatus === 'syncing'}
          onClick={() => reindex()}
          className="ml-auto flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
          Re-index
        </button>
      </div>

      {/* One-liner */}
      {repo.oneLiner && (
        <p className="text-sm leading-relaxed text-zinc-400">{repo.oneLiner}</p>
      )}

      {/* Profile body */}
      {hasProfile && repo.qualityScore != null ? (
        <ScoreSection score={repo.qualityScore} breakdown={repo.qualityBreakdown} />
      ) : isPendingProfile ? (
        <div className="space-y-2">
          <div className="h-2 w-2/3 animate-pulse rounded bg-white/8" />
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-4 w-12 animate-pulse rounded bg-white/8" />
            ))}
          </div>
        </div>
      ) : repo.extractionStatus === 'failed' ? (
        <p className="text-xs text-red-400">Extraction failed — re-index to retry</p>
      ) : (
        <p className="text-xs text-zinc-600">
          Profile extraction pending — re-index to generate
        </p>
      )}

      {/* Tech stack + domain + complexity */}
      {hasProfile && (repo.techStack?.length || repo.domain || repo.complexity) && (
        <div className="flex flex-wrap items-center gap-2">
          {repo.domain && (
            <span className="rounded border border-indigo-500/20 bg-indigo-500/8 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
              {repo.domain}
            </span>
          )}
          {repo.techStack?.slice(0, 6).map(tech => (
            <span
              key={tech}
              className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400"
            >
              {tech}
            </span>
          ))}
          {repo.complexity && (
            <span className="ml-auto text-[10px] text-zinc-600">{repo.complexity}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2">
        <GitHubSyncStatusBadge status={repo.syncStatus} />
        {lastSynced && repo.syncStatus === 'complete' && (
          <span className="text-[10px] text-zinc-600">{lastSynced}</span>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Skeleton placeholder (loading state)
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <li className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-36 animate-pulse rounded bg-white/8" />
        <div className="h-5 w-16 animate-pulse rounded bg-white/8" />
      </div>
      <div className="h-4 w-3/4 animate-pulse rounded bg-white/8" />
      <div className="space-y-2">
        <div className="h-2 w-full animate-pulse rounded bg-white/8" />
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="h-4 w-10 animate-pulse rounded bg-white/8" />
          ))}
        </div>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function RepoProfileCards({ repos, isLoading }: RepoProfileCardsProps) {
  let content: React.ReactNode

  if (isLoading) {
    content = (
      <ul className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </ul>
    )
  } else if (repos.length === 0) {
    content = (
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
    )
  } else {
    content = (
      <ul className="space-y-3">
        {repos.map(repo => (
          <RepoCard key={repo.repoFullName} repo={repo} />
        ))}
      </ul>
    )
  }

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
      {content}
    </section>
  )
}
```

- [ ] **Step 2: Verify the `githubKeys.connectedRepos()` query key exists**

Run:

```bash
grep -n "connectedRepos" src/lib/api/query-keys.ts
```

Expected: a line like `connectedRepos: () => [...githubKeys.all, 'connected-repos'] as const`. If the key name differs, update the `invalidateQueries` call in `RepoCard` to match the actual key.

- [ ] **Step 3: Update `UserDashboard.tsx` to use `RepoProfileCards`**

In `src/features/user-home/components/UserDashboard.tsx`, replace the `KbRepoList` import and usage:

```tsx
// Replace this import:
import { KbRepoList } from './KbRepoList'

// With:
import { RepoProfileCards } from './RepoProfileCards'
```

And in the JSX (around line 95), replace:

```tsx
<KbRepoList repos={repos} isLoading={loadingRepos} />
```

With:

```tsx
<RepoProfileCards repos={repos} isLoading={loadingRepos} />
```

- [ ] **Step 4: Delete `KbRepoList.tsx`**

```bash
rm src/features/user-home/components/KbRepoList.tsx
```

- [ ] **Step 5: Run typecheck**

```bash
yarn typecheck
```

Expected: no errors. Confirm `KbRepoList` has no other imports in the codebase:

```bash
grep -r "KbRepoList" src/
```

Expected: no output.

- [ ] **Step 6: Run frontend tests**

```bash
yarn test
```

Expected: all tests pass. The deleted `KbRepoList` has no test file, so no tests are lost.

- [ ] **Step 7: Commit**

```bash
git add src/features/user-home/components/RepoProfileCards.tsx \
        src/features/user-home/components/UserDashboard.tsx
git rm src/features/user-home/components/KbRepoList.tsx
git commit -m "feat(dashboard): replace KbRepoList with RepoProfileCards showing quality score and AI profile"
```

---

## Self-Review Notes

- `githubKeys.connectedRepos()` — Step 2 of Task 4 verifies this exists before committing. The mutation's `onSuccess` invalidates the query so the card refreshes after re-index.
- `triggerGitHubIngestionFn` is already used in `GitHubConnectedRepos.tsx` with the same `{ data: { repoFullName, forceReindex: true } }` shape — safe reuse.
- `tech_stack` from DB: uses `->` (JSONB) operator, not `->>`; pg parses it to `string[]` automatically.
- All new `ConnectedRepo` profile fields are optional+nullable — no existing consumer breaks.
- Score bar uses `style={{ width: ... }}` for dynamic width, consistent with Tailwind v4 (dynamic values can't be statically extracted).
