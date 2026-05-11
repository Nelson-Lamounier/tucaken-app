# User Dashboard — Design Spec

**Date:** 2026-05-11
**Route:** `/overview`
**Status:** Approved

---

## 1. Goal

Replace the admin-only `DashboardOverview` at `/overview` with a user-facing **Knowledge Base health dashboard**. Every authenticated user lands here first and sees the real-time state of their personal KB: repos synced, career entries extracted, resume files uploaded, and whether the AI agent has enough data to act.

Admin pipeline metrics (articles, comments, AI costs) move to a new **Admin** sub-tab inside `/reports`.

---

## 2. Architecture

### 2.1 New files

| Path | Purpose |
|------|---------|
| `src/features/user-home/components/UserDashboard.tsx` | Main page component (single scroll) |
| `src/features/user-home/components/KbRepoList.tsx` | Read-only repo health list |
| `src/features/user-home/components/CareerDataBreakdown.tsx` | Entry-type chips + latest import summary |
| `src/features/user-home/components/ResumeFilesList.tsx` | Simplified import history list |
| `src/features/user-home/components/KbQuickActions.tsx` | 4 action buttons |

### 2.2 Modified files

| Path | Change |
|------|--------|
| `src/app/_dashboard.overview.tsx` | Swap `DashboardOverview` → `UserDashboard` |
| `src/features/reports/components/ReportContainer.tsx` | Add **Admin** tab containing the existing `DashboardOverview` |

### 2.3 Untouched files

`DashboardOverview`, `Stats`, `GitHubRepoChip`, `GitHubSyncStatusBadge`, `DashboardPage`, `Button`, all server functions, all query keys — reused as-is.

---

## 3. Data Sources

All data is fetched inside `UserDashboard` and passed as props to child components. No child fetches its own data.

| Hook / Server fn | Data |
|-----------------|------|
| `Route.useRouteContext().me` | User name, plan — already in route context, zero extra request |
| `useGitHubConnectedRepos()` | Repo list with `syncStatus`, `lastSyncedAt` |
| `useGitHubInstallation()` | Whether GitHub App is installed |
| `listResumeImportsFn()` | PDF upload records: filename, status, `careerEntriesCreated[]`, `embeddingsCreatedCount` |
| `listCareerEntriesFn({ data: {} })` | All career entries — counted client-side by `entryType` |
| `getResumesFn()` | Resume templates count |

Query keys used: `adminKeys.github.connectedRepos()`, `adminKeys.resumeImports.list()`, `adminKeys.resumeImports.entries()`, `adminKeys.resumes.list()`.

---

## 4. Page Layout (single scroll, no tabs)

```
┌─ DashboardPage wrapper ──────────────────────────────────────────┐
│  title="Knowledge Base"                                          │
│  description="Your AI agent's data health at a glance."         │
│  actions=<Button → /ai-agent>Run AI Agent</Button>              │
│                                                                  │
│  ┌─ Hero Stats (Stats component, 4 cards) ──────────────────┐   │
│  │  Connected Repos · Career Entries · Resume Uploads · KB  │   │
│  │  Ready (derived bool → "Ready" / "Needs setup")          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ KbRepoList ──────────────────────────────────────────────┐  │
│  │  Section heading: "Connected Repositories"                │  │
│  │  "Manage →" link → /settings/github?tab=repositories     │  │
│  │  Per repo: GitHubRepoChip + GitHubSyncStatusBadge +      │  │
│  │  last synced time + doc count placeholder (—)            │  │
│  │  Empty state: "No repos connected" + link to /settings   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ CareerDataBreakdown ─────────────────────────────────────┐  │
│  │  Section heading: "Career Data"                           │  │
│  │  "View imports →" link → /settings/github?tab=resumes    │  │
│  │  Entry type chips: X Experience · Y Education · Z Skills  │  │
│  │    · N Certifications · N Projects · N Achievements       │  │
│  │  Latest import row: filename, status badge, embeddings    │  │
│  │  Empty state: "No career data" + upload CTA              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ ResumeFilesList ─────────────────────────────────────────┐  │
│  │  Section heading: "Resume Files"                          │  │
│  │  "Upload →" link → /settings/github?tab=resumes          │  │
│  │  Per import: filename, status badge (Processed/Failed/    │  │
│  │  Processing), entries extracted count, date              │  │
│  │  Max 3 shown + "View all →" if more                     │  │
│  │  Empty state: "No uploads yet" + CTA                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ KbQuickActions ──────────────────────────────────────────┐  │
│  │  4 cards: Run AI Agent · Upload Resume ·                  │  │
│  │  Connect Repo · View Applications                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Hero Stats Derivation

| Card | Value | Sub-label |
|------|-------|-----------|
| Connected Repositories | `repos.length` | `X synced · Y pending` |
| Career Entries | sum of all `CareerEntry[]` | `X experience · Y education · Z skills` |
| Resume Uploads | `resumeImports.length` | `X processed · Y failed` |
| KB Ready | `"Ready"` if ≥1 repo synced OR ≥1 import completed, else `"Needs setup"` | `changeType: 'positive'/'negative'` |

Loading state: all cards show `"…"` until queries settle.

---

## 6. Component Details

### 6.1 KbRepoList

- Props: `connectedRepos: ConnectedRepo[] | undefined`, `isLoading: boolean`
- Renders repos in the same visual style as `GitHubConnectedRepos` but **read-only** (no Re-sync / Remove buttons)
- Shows `GitHubRepoChip` + `GitHubSyncStatusBadge` + last synced time formatted as `"12 May, 14:03"`
- Doc count column reserved: shows `—` until backend exposes `chunkCount` on `ConnectedRepo`
- Section has a `"Manage →"` link to `/settings/github?tab=repositories`

### 6.2 CareerDataBreakdown

- Props: `entries: CareerEntry[]`, `latestImport: ResumeImportRecord | undefined`, `isLoading: boolean`
- Counts by `entryType` client-side
- Chips rendered as `inline-flex` pill badges (same style as skill chips in `ImportCareerStep`)
- Latest import row: `originalFilename` truncated + `ImportStatus` badge + `embeddingsCreatedCount` if > 0
- Empty state when `entries.length === 0`

### 6.3 ResumeFilesList

- Props: `imports: ResumeImportRecord[]`, `isLoading: boolean`
- Shows at most 3 rows; if more, shows `"View all N →"` link
- Status icons: `CheckCircle2` (processed), `Loader2` (processing), `AlertCircle` (failed) — same as `_dashboard.settings.github.tsx`
- `careerEntriesCreated.length` shown as `"N entries"` sub-label

### 6.4 KbQuickActions

- 4 `Link`-wrapped cards, same visual style as Quick Actions in `DashboardOverview`
- Routes: `/ai-agent`, `/settings/github?tab=resumes`, `/settings/github?tab=repositories`, `/applications`

---

## 7. Reports page — Admin sub-tab

Add an **Admin** tab to `ReportContainer`'s existing tab list. Tab content renders the existing `DashboardOverview` component unchanged. No props needed — it self-fetches.

Tab order: `all · pipelines · chatbot · selfhealing · prompt-quality · admin`

---

## 8. Known API Gaps (deferred)

| Gap | Workaround now | Future fix |
|-----|---------------|-----------|
| No `chunkCount` on `ConnectedRepo` | Show `—` in doc count column | Add field to `GET /repos` response in admin-api |
| No per-repo quality score | Omit column entirely | Add `GET /repos/:name/quality` endpoint |
| `listCareerEntriesFn` returns full records | Count client-side | Add `GET /career-entries/summary` endpoint returning counts only |

---

## 9. Styling Conventions

- Dark theme: `bg-zinc-900`, `border-white/10`, text `zinc-100/zinc-400/zinc-500/zinc-600`
- Section cards: `rounded-xl border border-white/10`
- Section headings: `text-sm font-semibold text-zinc-100`
- Sub-labels / links: `text-xs text-zinc-500` / `text-xs text-teal-400 hover:text-teal-300`
- Consistent with `_dashboard.settings.github.tsx` and `ImportCareerStep.tsx`

---

## 10. Out of Scope

- No mutations on this page (no re-sync, no delete, no upload inline)
- No pagination — data sets are small per user
- No role gating — all authenticated users see this dashboard
- No real-time WebSocket — polling via existing `useGitHubConnectedRepos` refetch interval
