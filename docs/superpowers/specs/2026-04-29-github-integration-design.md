# GitHub Integration — Design Spec
**Date:** 2026-04-29  
**Status:** Approved  
**Route:** `/admin/settings/github`

---

## 1. Purpose

Allow the admin user to connect their GitHub account via an existing GitHub App installation, browse accessible repositories, and trigger K8s-based ingestion jobs that index repo contents into the vector RDS used by the Bedrock agent as a Knowledge Base (KB). The KB drives both resume generation (via job application analysis) and article generation.

This feature is **account-level**, not per-job-application. Repos are global KB sources.

---

## 2. Background & Existing Infrastructure

| Layer | What exists |
|---|---|
| GitHub App | Already created and installed on the user's GitHub account |
| Ingestion pipeline | `POST /api/admin/ingestion/trigger` on admin-api dispatches a K8s Job (`run-ingestion.js`) with `USER_ID`, `REPO_FULL_NAME`, `FORCE_REINDEX`. `GITHUB_TOKEN` is injected from the `ingestion-secrets` K8s Secret via `envFrom`. |
| Sync state machine | `repo_sync_state`: `pending → syncing → complete \| error` written by the pod via `markStarted()` / `markComplete()` / `markError()` |
| Pipeline dispatch | K8s Batch API called directly from admin-api (in-cluster). No Step Functions, no Lambda. Returns `{ status, pipelineRunId, jobName }`. |
| Frontend server fns | Pattern: `createServerFn` → `requireAuth()` → `apiFetch<T>()` forwarding Bearer token to admin-api |
| Admin-api GitHub endpoints | Exist, need frontend wiring |

---

## 3. Folder Restructure

### Remove / relocate
```
src/features/applications/components/GitHubRepoChip.tsx     → move to src/features/github/components/
src/features/applications/components/GitHubRepoForm.tsx     → DELETE (replaced by RepoPicker)
src/features/applications/components/GitHubRepoSection.tsx  → DELETE (wrong model)
src/app/_dashboard.applications.github.tsx                  → UPDATE href only (hub card → /settings/github)
src/lib/types/applications.types.ts                         → REMOVE GitHubRepo interface + githubRepo fields
src/features/applications/components/ApplicationReviewDetail.tsx → REMOVE GitHubRepoSection import + githubRepo state
```

### New structure
```
src/
├── features/
│   └── github/
│       ├── components/
│       │   ├── GitHubAccountSection.tsx      Screen 1: avatar / username / repo count / disconnect
│       │   ├── GitHubRepoPicker.tsx           Screen 2a: searchable accessible repos + Add buttons
│       │   ├── GitHubConnectedRepos.tsx       Screen 2b: connected repos list with sync status + actions
│       │   ├── GitHubRepoChip.tsx             Moved chip (owner/name monospace badge)
│       │   └── GitHubSyncStatusBadge.tsx      Status chip: pending | syncing | complete | error
│       └── hooks/
│           ├── use-github-installation.ts    TanStack Query: GET installation status
│           ├── use-github-accessible-repos.ts  TanStack Query: GET repos from GitHub App
│           ├── use-github-connected-repos.ts   TanStack Query + polling: GET connected repos
│           └── use-github-ingestion.ts       useMutation: POST ingestion trigger
│
├── server/
│   └── github.ts                            NEW: all GitHub server functions
│
├── lib/
│   └── types/
│       └── github.types.ts                  NEW: GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo
│
└── app/
    └── _dashboard.settings.github.tsx       NEW route: /settings/github
```

---

## 4. Types (`src/lib/types/github.types.ts`)

```typescript
export interface GitHubInstallation {
  readonly installationId: string
  readonly accountLogin: string
  readonly accountAvatarUrl: string
  readonly repositoryCount: number
  readonly connectedAt: string       // ISO 8601
}

export interface GitHubAccessibleRepo {
  readonly id: number
  readonly fullName: string          // "owner/name"
  readonly owner: string
  readonly name: string
  readonly defaultBranch: string
  readonly private: boolean
  readonly updatedAt: string         // ISO 8601
}

export type RepoSyncStatus = 'pending' | 'syncing' | 'complete' | 'error'

export interface ConnectedRepo {
  readonly repoFullName: string      // "owner/name"
  readonly owner: string
  readonly name: string
  readonly defaultBranch: string
  readonly syncStatus: RepoSyncStatus
  readonly lastSyncedAt?: string     // ISO 8601
  readonly pipelineRunId?: string
  readonly jobName?: string
  readonly addedAt: string           // ISO 8601
}
```

---

## 5. Server Functions (`src/server/github.ts`)

All follow the existing pattern: `createServerFn` → `requireAuth()` → `apiFetch<T>()`.

| Function | Method + Path | Purpose |
|---|---|---|
| `getGitHubInstallationFn` | `GET /api/admin/github/installation` | Returns `GitHubInstallation \| null` |
| `handleGitHubInstallFn` | `POST /api/admin/github/installation` | Body: `{ installationId }`. Persists install after GitHub callback. |
| `disconnectGitHubFn` | `DELETE /api/admin/github/installation` | Removes installation record |
| `getGitHubAccessibleReposFn` | `GET /api/admin/github/repos` | Returns `GitHubAccessibleRepo[]` via GitHub App token |
| `getGitHubConnectedReposFn` | `GET /api/admin/github/connected-repos` | Returns `ConnectedRepo[]` with current sync states |
| `triggerGitHubIngestionFn` | `POST /api/admin/ingestion/trigger` | Body: `{ repoFullName, forceReindex? }`. Returns `{ status, pipelineRunId, jobName }` |
| `removeConnectedRepoFn` | `DELETE /api/admin/github/connected-repos/:repoFullName` | Body: `{ repoFullName }` (URL-encoded in path, also sent in body to avoid double-encoding issues). Removes repo from connected list. |

---

## 6. Query Keys (`src/lib/api/query-keys.ts`)

```typescript
github: {
  all:             ['admin', 'github'] as const,
  installation:    () => ['admin', 'github', 'installation'] as const,
  accessibleRepos: () => ['admin', 'github', 'accessible-repos'] as const,
  connectedRepos:  () => ['admin', 'github', 'connected-repos'] as const,
}
```

---

## 7. Hooks

### `use-github-installation.ts`
`useGitHubInstallation()` — `useQuery` on `adminKeys.github.installation()`. Returns `GitHubInstallation | null`.

### `use-github-accessible-repos.ts`
`useGitHubAccessibleRepos(enabled: boolean)` — `useQuery`, only fetches when installation exists.

### `use-github-connected-repos.ts`
`useGitHubConnectedRepos()` — `useQuery` with `refetchInterval` of 5 s while any row has `status === 'pending' | 'syncing'`. Timeout at 10 min (matches applications polling pattern).

### `use-github-ingestion.ts`
`useGitHubIngestion()` — `useMutation`. On success: invalidates `adminKeys.github.connectedRepos()` and `adminKeys.github.accessibleRepos()`. Uses `useToastStore` for feedback.

---

## 8. Screen 1 — `GitHubAccountSection`

**Not connected state:**
- GitHub octicon + "Connect your GitHub account" heading + description
- "Connect GitHub" `Button` (primary) → redirects to `https://github.com/apps/<slug>/installations/new`. The app slug is read from `VITE_GITHUB_APP_SLUG` (new env var, e.g. `tucaken-admin`).
- Repo picker sections hidden

**Connected state:**
- Avatar (img with fallback initials) + username + "N repositories accessible"
- Green dot + "Connected" status
- "Disconnect" `Button` (danger) → calls `disconnectGitHubFn`, confirms first, invalidates `adminKeys.github.all`

**Loading state:** `Loader2` spinner while `useGitHubInstallation` is fetching.

---

## 9. Screen 2a — `GitHubRepoPicker`

Only rendered when connected.

- Section header: "Repositories" + accessible count
- Search `<input>` — client-side filter on `repo.fullName`
- List of `GitHubAccessibleRepo[]` rows, each row:
  - `GitHubRepoChip` (owner/name monospace badge)
  - Branch badge (reuses `FitRatingChip` pattern)
  - `private` amber badge when `repo.private === true`
  - "✓ Added" disabled badge when repo is already in connected list
  - "+ Add" `Button` (primary) when not yet connected → calls `useGitHubIngestion`, shows "queuing…" optimistically
- Client-side "Show more" button revealing 10 additional rows at a time if accessible repo count exceeds 10

---

## 10. Screen 2b — `GitHubConnectedRepos`

Only rendered when connected.

- Section header: "Connected Repositories" + connected count
- Empty state when list is empty
- Each row:
  - `GitHubRepoChip`
  - `GitHubSyncStatusBadge` (`pending` amber / `syncing` indigo+spin / `complete` emerald / `error` red)
  - Last synced timestamp when `complete`
  - "↺ Re-sync" `Button` (ghost) → `triggerGitHubIngestionFn` with `forceReindex: true`. Disabled while `syncing`.
  - "Remove" `Button` (danger) → `removeConnectedRepoFn`. Available in all states.

### `GitHubSyncStatusBadge`
Mirrors `FitRatingChip` exactly: colour map + label map keyed on `RepoSyncStatus`.

```typescript
const STATUS_COLOURS: Record<RepoSyncStatus, string> = {
  pending: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  syncing: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300',
  complete: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  error: 'border-red-500/20 bg-red-500/10 text-red-300',
}
```

---

## 11. Route — `_dashboard.settings.github.tsx`

```
path: /settings/github
validateSearch: z.object({ installation_id: z.string().optional(), setup_action: z.string().optional() })
```

**GitHub App install callback handling:**
On mount, if `installation_id` search param is present:
1. Call `handleGitHubInstallFn({ installationId })`
2. Invalidate `adminKeys.github.installation()`
3. `navigate({ replace: true, search: {} })` to clean the URL

**Page structure:**
```tsx
<DashboardPage title="GitHub" description="Connect your GitHub account to index repositories into the knowledge base.">
  <GitHubAccountSection installation={installation} />
  {installation && <GitHubRepoPicker accessibleRepos={accessibleRepos} connectedRepos={connectedRepos} />}
  {installation && <GitHubConnectedRepos connectedRepos={connectedRepos} />}
</DashboardPage>
```

---

## 12. Sidebar (`AppLayout.tsx`)

Add a `settingsNavigation` array and `SidebarSettings` component between `SidebarNavList` and `SidebarObservability`:

```typescript
const settingsNavigation = [
  { name: 'GitHub', href: '/settings/github', icon: Github },
] as const
```

`SidebarSettings` renders with a "Settings" group header, matching the Observability section pattern.

---

## 13. Applications Hub update

The "GitHub Repositories" card already exists on `_dashboard.applications.index.tsx`. Change its `href` from `/applications/github` to `/settings/github`. Remove the `/applications/github` route file.

---

## 14. Reused components

| Component | Used for |
|---|---|
| `DashboardPage` | Settings page wrapper |
| `Button` (primary / danger / ghost) | Connect, Disconnect, Add, Re-sync, Remove |
| `LinkCard` | Account section card container |
| `FitRatingChip` pattern | `GitHubSyncStatusBadge` |
| `useToastStore` | Mutation success/error feedback |
| `Loader2` | Loading states |
| `requireAuth` | Every server function guard |
| `apiFetch<T>` | BFF calls in server functions |
| `adminKeys` pattern | Query key factory extension |
| `DashboardDrawer` | Not needed (single-page layout chosen) |

---

## 15. Out of scope

- GitHub webhook handling (repo push events → auto re-sync)
- Multi-user installations
- Org-level GitHub App installs
- Repo branch selection (always uses `defaultBranch`)
- Viewing KB content or indexing progress beyond sync status
