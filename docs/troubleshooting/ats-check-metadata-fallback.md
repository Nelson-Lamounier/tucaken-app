---
title: ATS check panel missing when resumes.ats_check_json is null
type: troubleshooting
tags: [resumes, ats, data-fallback, postgres, json]
sources:
  - admin-api/src/routes/applications.ts
  - src/features/applications/stages/workspaces/AppliedWorkspace.tsx
  - src/features/applications/stages/components/AtsPanel.tsx
  - src/lib/types/applications.types.ts
  - "git commit 519c21e (PR #97)"
created: 2026-06-16
updated: 2026-06-16
---

## Symptom

The ATS check panel disappears from an application's Applied workspace even
though the strategist pipeline ran to completion. The rest of the analysis
(fit, research, recruiter snapshot, JD understanding) still renders, but the
applicant-tracking-system assessment block is simply absent.

The Applied workspace renders the panel conditionally — when `atsCheck` is
falsy, no panel is mounted at all
([AppliedWorkspace.tsx#L310](../../src/features/applications/stages/workspaces/AppliedWorkspace.tsx),
`const atsCheck = detail.analysis?.atsCheck`, and
[#L336](../../src/features/applications/stages/workspaces/AppliedWorkspace.tsx),
`{atsCheck ? <AtsPanel ats={atsCheck} /> : null}`). So a null `atsCheck` value
manifests purely as a missing section, with no error surfaced to the user.

## Root cause

The detail endpoint sourced `atsCheck` solely from the persisted `resumes`
row. Before PR #97 the mapping read:

```ts
// admin-api/src/routes/applications.ts (pre-fix)
atsCheck: resumeResult.rows[0]?.ats_check_json ?? null,
```

`resumeResult` selects the most recent `resumes` row for the application
(`SELECT id, content_json, ats_check_json, generated_at FROM resumes WHERE
job_application_id = $1 ORDER BY generated_at DESC LIMIT 1` —
[applications.ts#L387-L390](../../admin-api/src/routes/applications.ts)). When
the RLS-scoped write that persists that row was lost, `ats_check_json` is null,
so `atsCheck` resolves to null and the panel vanishes (commit 519c21e).

The ATS data, however, is also stashed a second time on the strategist
pipeline run, under `pipeline_runs.metadata.analysis.atsCheck` (added on the
job-strategist side, per commit 519c21e). The pre-fix mapping never consulted
that copy, so a missing `resumes` write meant the data was effectively
unreachable by the UI even though it existed in the run metadata.

## How to diagnose

1. Confirm the panel-render guard is the proximate cause: `atsCheck` being
   falsy short-circuits the JSX at
   [AppliedWorkspace.tsx#L336](../../src/features/applications/stages/workspaces/AppliedWorkspace.tsx).
   The shape the panel expects is `AtsCheckResult`
   ([applications.types.ts#L563](../../src/lib/types/applications.types.ts)):
   `machineReadable`, `standardSectionsDetected`, `contactDetected`,
   `parseBreakers`, `jdKeywordCoverage`, `status`, `passed`, `issues`.

2. Check the persisted resume row for the application
   (`pipeline_runs.metadata.analysis.atsCheck` is the fallback source; the
   primary is the `resumes` table):

   ```sql
   SELECT id, generated_at, (ats_check_json IS NULL) AS ats_is_null
   FROM resumes
   WHERE job_application_id = '<slug>'
   ORDER BY generated_at DESC
   LIMIT 1;
   ```

   If `ats_is_null` is `true` (or no row exists), the primary source is empty.

3. Check whether the strategist run still holds the copy under run metadata:

   ```sql
   SELECT (metadata #> '{analysis,atsCheck}') IS NOT NULL AS has_meta_ats
   FROM pipeline_runs
   WHERE pipeline_type = 'strategist'
     AND reference_id = '<slug>'
     AND status = 'complete'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

   If `has_meta_ats` is `true` while the resumes row is null, you are hitting
   exactly the lost-write case the fallback was built for. (`rawAnalysis` in
   the route is `latestAnalysis?.metadata?.['analysis']` —
   [applications.ts#L418](../../admin-api/src/routes/applications.ts).)

## How to fix

PR #97 (commit 519c21e) makes the detail mapping prefer the persisted column
and fall back to the run-metadata copy:

```ts
// admin-api/src/routes/applications.ts#L474
atsCheck: resumeResult.rows[0]?.ats_check_json ?? rawAnalysis['atsCheck'] ?? null,
```

With the fix in place, the panel renders from
`pipeline_runs.metadata.analysis.atsCheck` whenever the `resumes` write was
lost, so a transient persistence failure no longer hides the assessment. The
change is a one-line edit to the analysis mapping in `applications.ts`; no UI
or schema change is required because the run-metadata copy already conforms to
the `AtsCheckResult` shape the panel reads.

## How to prevent

- Keep a second authoritative copy of analysis artefacts in the strategist run
  metadata so the UI degrades gracefully when an RLS-scoped write to a
  domain table is lost. PR #97 relies on the job-strategist already writing
  `metadata.analysis.atsCheck` for this reason (commit 519c21e).
- Prefer the validated domain column first and treat the metadata copy as a
  fallback (`A ?? B ?? null`), so the canonical source still wins when present
  ([applications.ts#L474](../../admin-api/src/routes/applications.ts)).
- When a render gate hides a whole panel on a falsy value
  ([AppliedWorkspace.tsx#L336](../../src/features/applications/stages/workspaces/AppliedWorkspace.tsx)),
  audit every upstream source that can leave that value null — a missing
  write in one of several tables can silently remove user-facing content with
  no error.

<!--
  Evidence trail (verified 2026-06-16):
  - git show -s --format='%b' 519c21e / 21741c1 — PR #97 commit body: ATS panel
    reads atsCheck from persisted resumes row; RLS-scoped write lost => column
    null => panel disappears; fall back to pipeline_runs.metadata.analysis.atsCheck.
  - git show 519c21e -- admin-api/src/routes/applications.ts — single-line diff
    at L474 changing `?? null` to `?? rawAnalysis['atsCheck'] ?? null`.
  - admin-api/src/routes/applications.ts: L387-L390 resumes SELECT;
    L384 ats_check_json column; L418 rawAnalysis = metadata.analysis; L474 fix.
  - src/features/applications/stages/workspaces/AppliedWorkspace.tsx L310, L336 —
    atsCheck binding + conditional render guard.
  - src/features/applications/stages/components/AtsPanel.tsx L1-L9 — panel reads
    detail.analysis.atsCheck (resumes.ats_check_json).
  - src/lib/types/applications.types.ts L510, L563 — atsCheck?: AtsCheckResult,
    AtsCheckResult shape (machineReadable, standardSectionsDetected,
    contactDetected, parseBreakers, jdKeywordCoverage, status, passed, issues).
-->
