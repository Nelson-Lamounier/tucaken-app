# Admin per-user repos/RAG + user activity panels

Date: 2026-06-25
Repo: tucaken-app (UI + admin-api)
Branch: feat/admin-user-repos-and-activity-panels

## Problem

The Resume-Readiness diagnostic (overall N/100 + five sub-metrics: RAG depth,
Profile depth, Resume coverage, Direction, Reconciliation) is not yet
trustworthy for end users — its reconciliation/profile-depth signals carry
proven false negatives sourced from a lossy rollup aggregation. Until the
underlying data matures, the diagnostic must not be shown to end users, but the
admin must keep visibility to monitor and iterate.

Separately, the admin has no view of a user's synced repositories or their RAG
quality metrics (kb-quality / retrieval), which are needed to diagnose readiness
across the user base (Free, Pro, Premium).

## Scope

In scope (this spec):
1. **Admin** — within the existing admin Users view, add a per-user synced-repository
   list (dropdown/expandable) and a dedicated repo-detail route showing that
   repo's RAG metrics. The per-user diagnostic readiness stays admin-visible.
2. **User** — gate the Resume-Readiness diagnostic panel behind `role=admin` so
   end users no longer see it; replace it for end users with a new activity
   panel: applications + resumes generated per day (last 30 days), bar chart +
   total tiles.
3. Two new admin-api endpoints backing the above.

Out of scope (separate follow-ups):
- The ontology-gap control-data capture (paused earlier brainstorm).
- Free-tier-at-onboarding enrichment strategy.
- Re-introducing the readiness panel to end users (gated on data maturity).

## Architecture (follows existing conventions)

- admin-api: Hono routers under `/api/admin/*`, gated by `requireAdminGroup()`
  (Cognito `admin` group), Zod-validated queries, response `{ data } | { error }`.
- Frontend: TanStack `createServerFn` + `apiFetch` (`src/server/_api-client.ts`,
  injects session JWT + OTel) + React Query; admin routes guarded at the edge by
  `requireAdmin()` and route `beforeLoad` `context.isAdmin`.

### Endpoint 1 — admin: per-user repositories + RAG metrics

`GET /api/admin/users/:userId/repositories` (requireAdminGroup)

```sql
SELECT s.repo_full_name,
       p.classification,
       p.extraction_status,
       s.sync_status,
       s.kb_quality_score,
       s.kb_quality_breakdown,
       s.retrieval_score,
       s.retrieval_breakdown,
       s.chunk_count,
       s.file_count,
       s.embedded_count,
       s.last_synced_at
FROM repo_sync_state s
LEFT JOIN repository_profiles p
  ON p.repo_full_name = s.repo_full_name AND p.user_id = s.user_id
WHERE s.user_id = $1::uuid
ORDER BY s.kb_quality_score DESC NULLS LAST, s.repo_full_name;
```

Returns `{ repositories: RepoRagSummary[] }`. The list view renders score columns;
the dedicated repo-detail route renders the full `kb_quality_breakdown` /
`retrieval_breakdown` JSON.

### Endpoint 1b — admin: per-user readiness diagnostic (full)

`GET /api/admin/users/:userId/diagnostic` (requireAdminGroup)

Returns `{ diagnostic, refreshedAt }` from `user_profile_rollup` for the target
user. The existing `GET /profile/summary` only returns the *caller's own* rollup
(via `requireUserId`); admins need to read an arbitrary user's diagnostic to keep
the FULL Resume-Readiness panel — every metric currently displayed (overall
N/100 + the "On track"/"Solid foundation" framing + all five sub-metrics:
RAG depth, Profile depth, Resume coverage, Direction, Reconciliation + each
component's blockers). The admin user-detail renders the SAME existing
`KbScorePanel` + `KbReadinessPanel`/`DiagnosticPanel` components, unchanged, fed
by this endpoint — nothing is dropped for the admin.

### Endpoint 2 — user: applications + resumes generated per day

`GET /activity/daily?days=30` (authenticated user; `userId` from verified claims)

Two grouped reads, merged into a dense 30-day series in the handler:

```sql
-- applications
SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
FROM job_applications WHERE user_id = $1::uuid
  AND created_at >= now() - ($2 || ' days')::interval
GROUP BY day;
-- resumes (note: resumes.generated_at, resumes.user_id — direct, no join needed)
SELECT (generated_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
FROM resumes WHERE user_id = $1::uuid
  AND generated_at >= now() - ($2 || ' days')::interval
GROUP BY day;
```

Returns `{ days: [{ date, applications, resumes }], totals: { applications, resumes } }`,
zero-filled for missing days so the chart has a continuous axis.

## Frontend components

- `src/features/admin-users/components/UserRepositoriesList.tsx` — expandable
  per-user repo list (dropdown), score badges, link to the repo-detail route.
- New admin route `/admin/users/$userId/repos/$repo` (repo encoded) →
  `RepoRagDetail` panel: kb-quality + retrieval scores and their breakdowns.
- `src/features/user-home/components/ActivityPanel.tsx` — 30-day bar chart
  (applications vs resumes) + two total tiles. Reuses the existing motion/chart
  styling (SURFACE card, motion bars) from StageGlancePanel.
- Gate the Resume-Readiness diagnostic (`DiagnosticPanel`/`KbReadinessPanel`,
  currently `onboarding/ReviewStep.tsx:274`) behind `isAdmin`; render
  `ActivityPanel` for non-admin users in its place.

## Data fetch (frontend)

New `createServerFn` wrappers in `src/server/`:
- `getUserRepositoriesFn` (admin; `requireAdmin()`) → `apiFetch('/users/:id/repositories')`.
- `getDailyActivityFn` (user; `requireAuth()`) → `apiFetch('/activity/daily?days=30')`.
Consumed via React Query hooks mirroring `useProfileSummary` / `getApplicationsFn`.

## Error handling

- Endpoints fail closed on missing/invalid auth claims; admin endpoints 403 for
  non-admins. No-data → empty arrays / zero-filled series (panels render an
  honest empty state, never error).
- Frontend queries render skeleton → empty-state, never throw.

## Testing

- admin-api: unit-test both route handlers (auth gate, SQL shape via mocked pool,
  zero-fill/merge logic for the activity series).
- Frontend: render tests for `ActivityPanel` (empty + populated) and the admin
  gate (diagnostic hidden for non-admin, shown for admin).
- Lint + typecheck clean (UI + admin-api) before commit.

## Verification

- Live dev DB confirmed table/columns: `resumes(user_id, generated_at,
  job_application_id)`, `job_applications(user_id, created_at)`,
  `repo_sync_state(kb_quality_score, retrieval_score, *_breakdown, last_synced_at,
  no classification)`, `repository_profiles(classification, repo_full_name,
  user_id)`.
- Manual check on dev: admin sees repo list + RAG detail for a known user;
  non-admin user sees ActivityPanel, not the diagnostic.
