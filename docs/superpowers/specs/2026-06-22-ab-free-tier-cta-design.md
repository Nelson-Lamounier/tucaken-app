# Free/Paid Tier A/B CTA on the Resume Builder

- **Date:** 2026-06-22
- **Status:** Design approved, awaiting spec review
- **Owner:** Nelson Lamounier
- **Repo:** tucaken-app (frontend + admin-api)
- **Relates to:** ai-applications PR #326 (the `MODE='free'` engine — already built)

## Problem

ai-applications now has a free-tier resume pipeline behind `MODE='free'` (PR #326).
To compare it against the paid pipeline (`MODE='standard'`), we need a way to
dispatch either variant **on demand from the Resume Builder UI** — an A/B harness.
This must be available **only to the test user** (`lamounier_88@hotmail.com`) and
must not change anything for normal users.

Today: the Resume Builder dispatches a single pipeline; the frontend never sends
`mode`; admin-api reads `mode` from the body but applies **no validation** and
passes it straight to the Job as the `MODE` env var.

## Goals

- A CTA on the Resume Builder, **visible only to allowlisted test users**, that
  dispatches either the **free** or the **paid** pipeline for the same JD.
- The variant is recorded per run so the two can be compared.
- Free-tier dispatch is **enforced server-side** (the frontend check is
  convenience only and is spoofable).
- Zero behaviour change for non-allowlisted users.

## Non-goals

- The ai-applications engine (done, PR #326).
- The production plan-based gate (`users.plan` → free) — this is an explicit A/B
  harness for the test user, not the rollout.
- Any new analytics surface — the existing `metadata.mode` per run is the variant
  key; comparison is a query, not new UI.

## The gate — one source of truth in the backend

- New admin-api env var **`AB_FREE_TIER_EMAILS`** — a comma-separated allowlist of
  emails permitted to use free mode (initially `lamounier_88@hotmail.com`).
- A shared pure helper **`isFreeTierAllowed(email: string | null | undefined): boolean`**
  (parses the env once; case-insensitive; trims; empty/absent env → no one allowed).
  Used by BOTH the `me` endpoint and the dispatch route — single definition.
- No email is hardcoded in the frontend. The frontend learns its eligibility from
  the `me` endpoint.

## Components

### 1. admin-api — `isFreeTierAllowed` helper + `me.abFreeTier`

- Add `isFreeTierAllowed(email)` (e.g. `admin-api/src/lib/ab-free-tier.ts`).
- Extend the `me` route (`admin-api/src/routes/me.ts`) response with
  **`abFreeTier: boolean`** = `isFreeTierAllowed(payload['email'])`. The email
  claim is already read there for the `email` field.

### 2. admin-api — dispatch enforcement (`routes/pipelines.ts` strategist-job)

- After `const mode = body.mode?.trim() || 'standard'`:
  - If `mode === 'free'`: resolve the authenticated user's email — prefer the
    verified JWT `email` claim (already available to the route via the auth
    middleware/payload); fall back to `SELECT email FROM users WHERE id = $1`
    when the claim is absent.
  - If the email is **not** allowlisted → set `mode = 'standard'` and
    `log.warn({ userId, requestedMode: 'free' }, 'free-tier dispatch downgraded — not allowlisted')`.
    Fail-safe: never reject; the run proceeds as paid.
  - Allowlisted → keep `mode = 'free'`.
- Everything downstream is unchanged: `{ name: 'MODE', value: mode }` already
  flows to the Job.

### 3. Frontend — `me` type + `mode` plumbing

- Add `abFreeTier: boolean` to `MeResponse` (`src/server/me.ts`) and any `me`
  type the UI reads.
- Add `mode?: 'free' | 'standard'` to:
  - `AnalyseTriggerBody` (`src/lib/types/applications.types.ts`),
  - `analyseTriggerSchema` (`src/server/pipelines.ts`) — a `z.enum(['free','standard']).optional()`,
  - the request body built in `triggerApplicationsAnalysisFn` (`src/server/pipelines.ts`)
    — include `mode` only when present.

### 4. Frontend — the two-button CTA (`features/applications/components/NewAnalysisPanel.tsx`)

- Read `me` (via the existing `getMeFn`/`adminKeys.me.detail()` query) → `me.abFreeTier`.
- When `me.abFreeTier === true`: replace the single **"Start Analysis"** button
  with **two** submit buttons — **"Generate — Free tier"** (`mode: 'free'`) and
  **"Generate — Paid tier"** (`mode: 'standard'`). Both run the SAME validation
  (`resumeId` set, company, role, JD ≥ `MIN_JD_LENGTH`) and the SAME
  `trigger.mutate` path; only the `mode` differs. The dispatched mode is included
  in the `trigger.mutate` body.
- When `me.abFreeTier` is false/undefined: render today's single button unchanged
  (no `mode` sent → admin-api defaults to `'standard'`).
- The existing `testMode` client-side mock checkbox is untouched (separate concern).

## Data flow

```
NewAnalysisPanel (me.abFreeTier?)
  └─ "Generate — Free tier"  → trigger.mutate({ ..., mode: 'free' })
  └─ "Generate — Paid tier"  → trigger.mutate({ ..., mode: 'standard' })
        │
        ▼  triggerApplicationsAnalysisFn  (POST /api/admin/pipelines/strategist-job, body incl. mode)
        ▼  admin-api strategist-job:
             mode = body.mode || 'standard'
             if mode==='free' && !isFreeTierAllowed(email) → mode='standard' + log.warn
             dispatch K8s Job with MODE=mode
        ▼  ai-applications run-pipeline → free or paid path; records metadata.mode
```

## Error handling

- Missing/empty `AB_FREE_TIER_EMAILS` → `isFreeTierAllowed` returns false for
  everyone → CTA hidden, free dispatch downgraded. Safe default.
- `me` email claim absent → `abFreeTier` false; dispatch falls back to the users
  table lookup, and if still absent → downgrade. Never throws.
- A spoofed `mode: 'free'` from a non-allowlisted user → silently downgraded to
  `'standard'` + logged. No 4xx.

## Testing

- **admin-api unit:** `isFreeTierAllowed` (allowlisted, case-insensitive, trimmed,
  not-listed, empty env, null email); the dispatch downgrade (mode='free' + not
  allowlisted → mode becomes 'standard' + warn; allowlisted → stays 'free').
- **frontend:** `NewAnalysisPanel` renders two tier buttons only when
  `abFreeTier`; the free button dispatches `mode: 'free'`, the paid button
  `mode: 'standard'`; a non-eligible user sees the single unchanged button.
- Follow existing test patterns in each package (admin-api Jest/vitest; frontend
  component tests).

## Acceptance criteria

- `me` returns `abFreeTier` driven by `AB_FREE_TIER_EMAILS`.
- The test user sees two tier buttons; each dispatches the correct `mode`; the run
  records `metadata.mode` accordingly.
- A non-allowlisted user (or a spoofed free request) always runs `'standard'`.
- Normal users' Resume Builder is visually and behaviourally unchanged.
- Lint + typecheck clean in both packages; no new analytics surface.

## Rollout note

`AB_FREE_TIER_EMAILS` must be set on the admin-api deployment (initially
`lamounier_88@hotmail.com`) for the CTA to appear and free dispatch to be
permitted. Until ai-applications PR #326 is merged + the job-strategist image
deployed, a free dispatch will run on whatever image is live (free path requires
that image).
