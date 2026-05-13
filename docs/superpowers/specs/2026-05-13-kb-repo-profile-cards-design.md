# KB Repo Profile Cards — Design Spec

**Date:** 2026-05-13
**Status:** approved

## Problem

The Knowledge Base dashboard currently shows connected repositories with only sync status and last-synced time. The ingestion pipeline already writes `quality_score`, `quality_breakdown`, `classification`, and a full AI-extracted profile (`one_liner`, `domain`, `tech_stack`, `complexity`, `confidence`) into `repository_profiles`. None of this reaches the UI.

## Goal

Surface per-repo profile quality data — especially the weighted quality score — in the KB dashboard via rich profile cards that replace the current compact list.

---

## Architecture

### 1. admin-api — extend `GET /github/connected-repos`

**File:** `admin-api/src/routes/github.ts`

Extend `listConnectedRepos` to LEFT JOIN `repository_profiles`. All profile columns are nullable — a repo not yet profiled returns nulls and renders in a pending state.

```sql
SELECT r.full_name, r.default_branch, r.index_status, r.added_at,
       s.sync_status, s.last_synced_at, s.file_count, s.chunk_count, s.error_message,
       p.quality_score, p.quality_breakdown, p.classification, p.extraction_status,
       p.extracted->>'one_liner'        AS one_liner,
       p.extracted->>'domain'           AS domain,
       p.extracted->'tech_stack'        AS tech_stack,
       p.extracted->>'complexity'       AS complexity,
       (p.extracted->>'confidence')::float AS confidence
FROM repositories r
LEFT JOIN repo_sync_state s
  ON s.user_id = r.user_id AND s.repo_full_name = r.full_name
LEFT JOIN repository_profiles p
  ON p.user_id = r.user_id AND p.repo_full_name = r.full_name
WHERE r.user_id = $1::uuid AND r.provider = 'github'
ORDER BY r.added_at DESC
```

Extend `ConnectedRepoRow` interface with all new nullable columns. Map them in the route handler alongside existing sync fields:

```ts
qualityScore:      r.quality_score   ?? null,
qualityBreakdown:  r.quality_breakdown ?? null,
classification:    r.classification  ?? null,
extractionStatus:  r.extraction_status ?? null,
oneLiner:          r.one_liner        ?? null,
domain:            r.domain           ?? null,
techStack:         r.tech_stack       ?? null,   // pg parses JSONB → string[] automatically
complexity:        r.complexity       ?? null,
confidence:        r.confidence       ?? null,
```

**Test file:** `admin-api/__tests__/routes/github.test.ts`

- Extend `connectedRepoRow` fixture with representative profile values (`quality_score: 0.80`, `classification: 'project'`, `one_liner`, `tech_stack` JSON array, etc.)
- Add assertion: `GET /connected-repos` returns `qualityScore`, `classification`, `oneLiner`, `techStack`
- Add case: repo with all profile fields null (no profile yet) — response fields are null, not missing

---

### 2. Frontend types — `src/lib/types/github.types.ts`

Extend `ConnectedRepo` with optional profile fields. All optional because repos without a completed profile will have nulls.

```ts
export interface ScoreBreakdown {
  has_readme:    number
  has_manifest:  number
  has_ci:        number
  has_changelog: number
  has_tests:     number
  commit_count:  number
  confidence:    number
}

export type RepoClassification =
  | 'project' | 'fork' | 'tutorial'
  | 'abandoned' | 'noise' | 'stale'

export interface ConnectedRepo {
  // ... existing fields unchanged ...
  readonly qualityScore?:     number | null
  readonly qualityBreakdown?: ScoreBreakdown | null
  readonly classification?:   RepoClassification | null
  readonly extractionStatus?: string | null
  readonly oneLiner?:         string | null
  readonly domain?:           string | null
  readonly techStack?:        string[] | null
  readonly complexity?:       string | null
  readonly confidence?:       number | null
}
```

---

### 3. UI — replace `KbRepoList` with `RepoProfileCards`

**File:** `src/features/user-home/components/RepoProfileCards.tsx`
**Delete:** `src/features/user-home/components/KbRepoList.tsx`
**Update import in:** `src/features/user-home/components/UserDashboard.tsx`

#### Card anatomy

```
┌─────────────────────────────────────────────────────────┐
│ [owner/repo chip]  [project ●]              [Re-index →] │
│ "One-liner description from AI extraction"               │
│                                                          │
│ Quality Score ──────────────────────────── 80%           │
│ [README ✓][Manifest ✓][CI ✓][Changelog ✗][Tests ✗]       │
│ [Commits ✓][Confidence ✓]                                │
│                                                          │
│ [web]  [TypeScript] [React] [TanStack]   moderate        │
│                                                          │
│ ● complete · synced 12 May, 14:32                        │
└─────────────────────────────────────────────────────────┘
```

#### Classification badge colors

| Value       | Color  |
|-------------|--------|
| `project`   | teal   |
| `stale`     | amber  |
| `fork`      | zinc   |
| `noise`     | zinc   |
| `abandoned` | red    |
| `tutorial`  | purple |

#### Score bar

- Width driven by `qualityScore * 100`%
- Color: ≥0.7 → teal, 0.4–0.69 → amber, <0.4 → red
- Signal pills: label + ✓/✗ icon, strikethrough or muted for false signals

#### States

| State | Trigger | Rendering |
|-------|---------|-----------|
| No profile | `extractionStatus` is null | Score area replaced by "Profile extraction pending — re-index to generate" muted text |
| Pending/extracting | `extractionStatus === 'pending' \| 'extracting'` | Skeleton pulse in score area |
| Failed | `extractionStatus === 'failed'` | "Extraction failed" red text in score area |
| Complete | `extractionStatus === 'completed' \| 'ready_for_review'` | Full card |

#### Loading state (data fetching)

Render 2 skeleton card placeholders (same height as a full card) while `isLoading` is true.

#### Empty state

Same empty state as current `KbRepoList`: dashed border card with GitBranch icon + "Connect your first repo →" link.

---

## Data flow

```
DB: repository_profiles (quality_score, quality_breakdown, classification, extracted)
  └── LEFT JOIN in listConnectedRepos (admin-api)
        └── GET /api/admin/github/connected-repos
              └── getGitHubConnectedReposFn (server fn)
                    └── useGitHubConnectedRepos hook
                          └── RepoProfileCards component
```

No new query keys, no new server functions, no new hooks — the existing `useGitHubConnectedRepos` already fetches everything once the JOIN is extended.

---

## Files changed

| File | Change |
|------|--------|
| `admin-api/src/routes/github.ts` | Extend query, `ConnectedRepoRow`, route mapping |
| `admin-api/__tests__/routes/github.test.ts` | Extend fixture, add 2 assertions |
| `src/lib/types/github.types.ts` | Add `ScoreBreakdown`, `RepoClassification`, optional profile fields on `ConnectedRepo` |
| `src/features/user-home/components/KbRepoList.tsx` | Delete |
| `src/features/user-home/components/RepoProfileCards.tsx` | New component |
| `src/features/user-home/components/UserDashboard.tsx` | Swap import |

No changes to hero stats, `CareerDataBreakdown`, `ResumeFilesList`, `KbQuickActions`, query keys, or server functions.
