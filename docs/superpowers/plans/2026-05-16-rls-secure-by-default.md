# RLS Secure-by-Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Postgres Row Level Security an actually-enforced, default safety net for every user-scoped query across admin-api and the resume-import-processor, instead of an opt-in layer that is silently bypassed today.

**Architecture:** Every connection runs as the RDS master superuser `postgres` (via Bitnami single-user PgBouncer — confirmed; the client cannot authenticate as a different backend role through it). RLS is therefore enforced *only* inside a transaction that does `SET LOCAL ROLE tucaken_app` + `SET LOCAL app.current_user_id` (superuser → non-superuser within the txn → RLS applies). We do **not** change the connection user or PgBouncer (that approach is foreclosed by the single-user pooler and is high-risk). Instead we (1) add RLS to the 4 unprotected user tables, (2) give the processor a `withUser()`-equivalent, (3) move every user-scoped raw-pool query in admin-api under `withUser()`, and (4) keep an explicit, audited superuser escape hatch for legitimately global/system queries.

**Tech Stack:** Postgres 15 + RLS, node-pg, Hono (admin-api), TypeScript K8s Jobs (resume-import-processor), Jest (admin-api), Vitest (tucaken-app), Helm/ESO (kubernetes-bootstrap), platform-rds-bootstrap migration runner.

**Repos touched:**
- `ai-applications/applications/platform-rds-bootstrap` (branch `feat/rag-sp2-app-wiring`) — RLS migration
- `ai-applications/applications/resume-import-processor` — RLS context wrapper
- `tucaken-app/admin-api` (branch `main`) — raw-pool → withUser refactor + escape hatch

---

## Design Decisions (read before any task)

**D1 — Why not "connect as tucaken_app".** `platform-rds-credentials` resolves from CDK `Credentials.fromGeneratedSecret('postgres')` → `{username:"postgres"}`. Bitnami PgBouncer (`charts/platform-rds/chart/templates/pgbouncer-deployment.yaml`) sets `POSTGRESQL_USERNAME=postgres`, no `auth_query`/`auth_user`. It opens **one** backend identity (`postgres`) for all clients. Giving the app a `tucaken_app` password changes nothing server-side. Rejected. The only mechanism that works here is `SET LOCAL ROLE tucaken_app` per transaction.

**D2 — PgBouncer is transaction-pooling.** Session-level `SET ROLE`/`SET app.current_user_id` does NOT survive across transactions (server conn returned to pool at COMMIT). Every RLS-scoped unit of work MUST be `BEGIN; SET LOCAL ROLE tucaken_app; SET LOCAL app.current_user_id=...; <queries>; COMMIT`. admin-api's existing `withUser()` already does exactly this — it is the canonical pattern. The processor must adopt the same shape.

**D3 — Fail-closed is already correct.** Policies use `current_setting('app.current_user_id', true)::uuid`; unset → NULL → 0 rows / blocked write. So a missed `SET LOCAL` = no data (loud failure in tests), never a silent cross-user leak. This is why the migration (Phase 1) is safe to ship first: it is inert for superuser/raw-pool callers and only "turns on" as callers migrate.

**D4 — Escape hatch.** Legitimately global/system queries MUST stay on the raw superuser pool and MUST be explicit. Canonical keep-superuser list (do NOT wrap these):
- Provisioning: `lib/repositories/users.ts` `upsertUser()` (creates the row before withUser is possible), `userExistsByEmail()`; `middleware/user-provision.ts`.
- Pre-auth: `routes/public.ts` (signup email check), `routes/observability.ts`/health `SELECT 1`.
- Global content: all `articles` reads/writes (`lib/repositories/articles.ts`, `routes/articles.ts`).
- Admin cross-user analytics: `getPromptQualityStats` (`prompt-observability.ts:96`, `routes/prompt-feedback.ts:77`), `getUsageSummary` unfiltered (`bedrock-usage.ts:72`, `routes/bedrock-usage.ts:43`).
- GitHub webhooks (HMAC-auth, no Cognito sub): `routes/github.ts` webhook handlers (`installation.deleted`, `push`) + `lookupUserByInstallation`.
- Quota ledger atomic ops where cross-row WHERE is required: `github.ts` `checkAndIncrementQuota`/`decrementQuota` (decision: keep superuser; document inline).

**D5 — JOIN safety verified.** RLS-policy coverage already exists for the global/secondary sides of user JOINs: `coaching_content_isolation` (migration 003, EXISTS-subquery to job_applications.user_id), `repository_profiles` (migration 014). No new policies needed for existing JOINs. The 4 NEW tables get policies in Phase 1.

**D6 — Defensive UUID guard.** `withUser()` interpolates `userId` into `SET LOCAL app.current_user_id = '${userId}'`. Add a UUID-format assertion at the boundary (defence-in-depth; today safe because provisioning derives it from the DB).

---

## File Structure

| Repo / File | Responsibility |
|---|---|
| `platform-rds-bootstrap/migrations/021_rls_pipeline_tables.sql` | **Create.** ENABLE RLS + `*_isolation` policies for `resume_imports`, `user_career_history`, `experience_embeddings`, `prompt_invocations`, `resume_import_corrections`. |
| `resume-import-processor/src/db/with-user.ts` | **Create.** Processor-side `withUser()` equivalent (BEGIN; SET LOCAL ROLE; SET LOCAL app.current_user_id; fn; COMMIT). |
| `resume-import-processor/src/run-import.ts` / `run-enrichment.ts` / `enrichment.ts` / `embed.ts` | **Modify.** Route every DB unit-of-work through the new wrapper with `env.userId`. |
| `applications/shared/src/rds/bedrock-cost.ts` | **Modify.** `recordBedrockCost` must accept/operate inside the caller's RLS client (not open its own bypassing path). |
| `admin-api/src/lib/pg.ts` | **Modify.** Add UUID guard to `withUser()`; add `assertSystemQuery()` doc marker helper for escape-hatch sites. |
| `admin-api/src/lib/repositories/*.ts`, `admin-api/src/routes/*.ts` | **Modify.** Move user-scoped raw-pool queries under `withUser()`; annotate keep-superuser sites. |
| `admin-api/__tests__/lib/rls.test.ts` | **Create.** Regression test: representative user-scoped repo fn rejects/ô isolates without `app.current_user_id`. |

---

## PHASE 1 — RLS migration (platform-rds-bootstrap). Inert until callers switch; ship first.

### Task 1: Add RLS to the 4 unprotected user tables

**Files:**
- Create: `ai-applications/applications/platform-rds-bootstrap/migrations/021_rls_pipeline_tables.sql`

- [ ] **Step 1: Verify `resume_import_corrections` has `user_id`**

Run: `grep -n "user_id" ai-applications/applications/platform-rds-bootstrap/migrations/016_resume_import_corrections.sql`
Expected: a line `user_id UUID NOT NULL REFERENCES users(id) ...` (confirmed in prior audit). If absent, scope that table via its `import_id` FK instead (see Step 2 alt policy).

- [ ] **Step 2: Write the migration**

```sql
-- =============================================================================
-- Migration 021 — RLS for the resume-import pipeline tables
--
-- Closes the audit gap: these user-scoped tables had no RLS while every other
-- user table (migrations 003/005/007/014/015) did. Same pattern as 003:
-- ENABLE RLS + an isolation policy keyed on the app.current_user_id GUC.
-- current_setting(...,true) returns NULL when unset → policy false → fail
-- closed (zero rows / blocked write). Superuser/owner still bypass (bootstrap
-- Job, admin analytics paths) — intended.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY is idempotent; policies are wrapped
-- in DROP POLICY IF EXISTS first (same convention as migration 003).
-- =============================================================================

ALTER TABLE resume_imports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_career_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_embeddings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_invocations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_import_corrections  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resume_imports_isolation            ON resume_imports;
CREATE POLICY resume_imports_isolation ON resume_imports
  USING      (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS user_career_history_isolation       ON user_career_history;
CREATE POLICY user_career_history_isolation ON user_career_history
  USING      (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS experience_embeddings_isolation     ON experience_embeddings;
CREATE POLICY experience_embeddings_isolation ON experience_embeddings
  USING      (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS prompt_invocations_isolation        ON prompt_invocations;
CREATE POLICY prompt_invocations_isolation ON prompt_invocations
  USING      (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS resume_import_corrections_isolation ON resume_import_corrections;
CREATE POLICY resume_import_corrections_isolation ON resume_import_corrections
  USING      (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- =============================================================================
-- Verification
-- =============================================================================
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('resume_imports','user_career_history',
--     'experience_embeddings','prompt_invocations','resume_import_corrections');
-- SELECT polname, tablename FROM pg_policies WHERE policyname LIKE '%_isolation';
```

> NOTE: `prompt_invocations` rows are also written by article-pipeline / job-strategist / ingestion Jobs via `recordBedrockCost`. Those connect as superuser → bypass RLS → unaffected by this policy. Only non-superuser (`SET ROLE tucaken_app`) readers/writers are constrained. This is correct: admin cost analytics stays on the superuser path (D4).

- [ ] **Step 3: Render/validate the migration runs in order**

Run: `cd ai-applications/applications/platform-rds-bootstrap && ls migrations | tail -3`
Expected: `019_…`, `020_query_path_indexes.sql`, `021_rls_pipeline_tables.sql` (021 sorts last → applied last).

- [ ] **Step 4: Typecheck the runner (unchanged, sanity only)**

Run: `cd ai-applications/applications/platform-rds-bootstrap && npx tsc --noEmit 2>&1 | grep -i "error TS" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 5: Commit**

```bash
cd ai-applications/applications/platform-rds-bootstrap
git add migrations/021_rls_pipeline_tables.sql
git commit -m "feat(rds): enable RLS on the resume-import pipeline tables

resume_imports, user_career_history, experience_embeddings,
prompt_invocations, resume_import_corrections had no RLS while every
other user table did. Add ENABLE RLS + isolation policies (same
fail-closed app.current_user_id pattern as migration 003). Inert for
superuser/raw-pool callers; enforced once callers adopt SET LOCAL ROLE."
```

**CHECKPOINT 1:** Deploy Phase 1 alone to dev. The bootstrap Job applies 021. Verify: app + import pipeline still work (all callers are superuser today → RLS inert). Verify `pg_policies` shows the 5 new policies. Do NOT proceed until confirmed inert in dev.

---

## PHASE 2 — resume-import-processor RLS context

### Task 2: Create the processor `withUser()` wrapper

**Files:**
- Create: `ai-applications/applications/resume-import-processor/src/db/with-user.ts`
- Test: `ai-applications/applications/resume-import-processor/src/db/__tests__/with-user.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { withUser } from '../with-user'

function fakePool(calls: string[]) {
  const client = {
    query: vi.fn(async (q: string) => { calls.push(q); return { rows: [] } }),
    release: vi.fn(),
  }
  return { client, pool: { connect: vi.fn(async () => client) } as any }
}

describe('processor withUser', () => {
  it('wraps fn in BEGIN; SET LOCAL ROLE; SET LOCAL app.current_user_id; COMMIT', async () => {
    const calls: string[] = []
    const { pool, client } = fakePool(calls)
    const out = await withUser(pool, '11111111-1111-1111-1111-111111111111', async (db) => {
      await db.query('SELECT 1'); return 42
    })
    expect(out).toBe(42)
    expect(calls[0]).toBe('BEGIN')
    expect(calls[1]).toBe('SET LOCAL ROLE tucaken_app')
    expect(calls[2]).toContain("SET LOCAL app.current_user_id = '11111111-1111-1111-1111-111111111111'")
    expect(calls).toContain('SELECT 1')
    expect(calls.at(-1)).toBe('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })

  it('ROLLBACK + rethrow on error', async () => {
    const calls: string[] = []
    const { pool } = fakePool(calls)
    await expect(withUser(pool, '11111111-1111-1111-1111-111111111111', async () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(calls).toContain('ROLLBACK')
    expect(calls).not.toContain('COMMIT')
  })

  it('rejects a non-UUID userId before opening a transaction', async () => {
    const calls: string[] = []
    const { pool } = fakePool(calls)
    await expect(withUser(pool, "x'; DROP TABLE users;--", async () => 1))
      .rejects.toThrow(/invalid userId/i)
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd ai-applications/applications/resume-import-processor && npx vitest run src/db/__tests__/with-user.test.ts`
Expected: FAIL — `Cannot find module '../with-user'`.

- [ ] **Step 3: Implement the wrapper**

```ts
/**
 * @format
 * Processor-side RLS context. Identical contract to admin-api's withUser():
 * one transaction per unit of work (PgBouncer is transaction-pooled, so
 * session-level SET would not survive — SET LOCAL inside a txn is mandatory).
 */
import type { Pool, PoolClient } from 'pg'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function withUser<T>(
  pool: Pool,
  userId: string,
  fn: (db: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(userId)) {
    throw new Error(`invalid userId (not a UUID): ${userId}`)
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE tucaken_app')
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`)
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd ai-applications/applications/resume-import-processor && npx vitest run src/db/__tests__/with-user.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
cd ai-applications/applications/resume-import-processor
git add src/db/with-user.ts src/db/__tests__/with-user.test.ts
git commit -m "feat(processor): add RLS withUser() transaction wrapper"
```

### Task 3: Route processor units-of-work through `withUser()`

**Files (Modify):** `src/run-import.ts`, `src/run-enrichment.ts`, `src/enrichment.ts`, `src/embed.ts`, `applications/shared/src/rds/bedrock-cost.ts`

**Pattern:** Each currently does `pool.query(...)` / passes `pool` down. Convert each discrete unit (a status update, an insert batch, an enrich-one-entry iteration) to run inside `withUser(pool, env.userId, async (db) => { ... use db not pool ... })`. `recordBedrockCost(pool, …)` becomes `recordBedrockCost(db, …)` — it must accept a `PoolClient` (the RLS-scoped client) and never open its own pool connection (that would bypass RLS).

- [ ] **Step 1: Failing integration-ish test for one unit (status update)**

Create `src/__tests__/rls-import.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
// Mock pg Pool; assert updateImportStatus runs inside withUser (BEGIN/SET LOCAL/COMMIT)
// and that env.userId is the GUC value. (Mirror Task 2 fakePool harness.)
```
(Author the assertion against the real `updateImportStatus` call path; expect FAIL because it currently uses bare `pool.query`.)

- [ ] **Step 2: Run, verify fail.** Run: `npx vitest run src/__tests__/rls-import.test.ts` → FAIL.

- [ ] **Step 3: Refactor `run-import.ts`.** Wrap the 4 `resume_imports` UPDATEs (lines ~144, ~200, ~366, ~398) and the `user_career_history` INSERT (line ~166) in `withUser(pool, env.userId, db => …)`. Replace `recordBedrockCost(pool, …)` calls (≈288, ≈356) with the in-txn `db`.

- [ ] **Step 4: Refactor `run-enrichment.ts` / `enrichment.ts` / `embed.ts`.** Each per-entry iteration becomes one `withUser(pool, env.userId, db => enrichAndEmbedOne(db, …))`. All `user_career_history` UPDATEs and the `experience_embeddings` INSERT use `db`. `recordBedrockCost` uses `db`.

- [ ] **Step 5: Change `recordBedrockCost` signature** in `applications/shared/src/rds/bedrock-cost.ts` from `(pool: Pool, …)` to `(db: Pick<PoolClient,'query'>, …)`; update all callers (run-import, run-enrichment, enrichment, embed; and any non-RLS caller — article-pipeline/job-strategist — passes its own raw client, still superuser, fine).

- [ ] **Step 6: Run processor test suite.** Run: `cd ai-applications/applications/resume-import-processor && npx vitest run` → PASS. Run shared: `cd ../shared && npx vitest run` → PASS.

- [ ] **Step 7: Typecheck.** `npx tsc --noEmit` in processor and shared → CLEAN.

- [ ] **Step 8: Commit**

```bash
git add -A applications/resume-import-processor applications/shared/src/rds/bedrock-cost.ts
git commit -m "feat(processor): run pipeline DB writes under RLS withUser()"
```

**CHECKPOINT 2:** Deploy Phase 2 to dev. Trigger a real resume import end-to-end. Verify: import succeeds, `user_career_history`/`experience_embeddings`/`prompt_invocations` rows are written for that user, NO rows leak/observe across users. If the import silently writes zero rows → `app.current_user_id` not set on a path → STOP, fix before proceeding (fail-closed working as designed).

---

## PHASE 3 — admin-api: raw-pool → withUser, + escape-hatch hardening

### Task 4: Harden `withUser()` (UUID guard) + escape-hatch marker

**Files:** Modify `admin-api/src/lib/pg.ts`; Test `admin-api/__tests__/lib/pg.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from '@jest/globals'
import { withUser, _resetPool } from '../../src/lib/pg.js'
describe('withUser UUID guard', () => {
  it('throws on non-UUID before connecting', async () => {
    await expect(
      withUser({ connect: async () => { throw new Error('should not connect') } } as any,
               "x'; DROP TABLE users;--", async () => 1),
    ).rejects.toThrow(/invalid userId/i)
  })
})
```

- [ ] **Step 2: Run, verify fail.** `cd admin-api && NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/lib/pg.test.ts` → FAIL.

- [ ] **Step 3: Implement guard.** In `pg.ts` add the `UUID_RE` constant and, as the first line of `withUser()`, `if (!UUID_RE.test(userId)) throw new Error(\`invalid userId (not a UUID): ${userId}\`)`. Add an exported no-op `systemQuery<T>(reason: string, fn: ()=>T): T { return fn() }` used to *explicitly mark* every keep-superuser call site (greppable audit marker; does not change behaviour).

- [ ] **Step 4: Run, verify pass.** Same command → PASS.

- [ ] **Step 5: Commit.** `git add admin-api/src/lib/pg.ts admin-api/__tests__/lib/pg.test.ts && git commit -m "feat(admin-api): UUID-guard withUser() + systemQuery() audit marker"`

### Task 5: RLS regression test (proves enforcement, guards the refactor)

**Files:** Create `admin-api/__tests__/lib/rls.test.ts`

- [ ] **Step 1: Write the test** — with a mock client recording queries, assert a representative refactored repository fn (e.g. `listResumeImports`) is invoked via `withUser` so the recorded query stream begins `BEGIN / SET LOCAL ROLE tucaken_app / SET LOCAL app.current_user_id / …`. (This test goes RED now and GREEN as Task 6 clusters land; keep it in the suite as the refactor's safety net.)
- [ ] **Step 2: Run → FAIL** (function still on raw pool).
- [ ] **Step 3: (no impl here — Task 6 makes it pass).**
- [ ] **Step 4: Commit the test** `git add admin-api/__tests__/lib/rls.test.ts && git commit -m "test(admin-api): RLS enforcement regression for user-scoped repos"`

### Task 6: Move user-scoped raw-pool queries under `withUser()` (cluster by file)

**Canonical transformation (apply per function — same shape every time):**

Before:
```ts
export async function listResumeImports(pool: Queryable, userId: string) {
  const { rows } = await pool.query('SELECT … FROM resume_imports WHERE user_id=$1 …', [userId])
  return rows
}
```
After (repository takes the RLS client; the route wraps once):
```ts
// repository: accept the withUser PoolClient as `db`; drop the explicit
// user_id WHERE — RLS now enforces it (keep it too as belt-and-braces only
// where the query also keys on it for the index; harmless).
export async function listResumeImports(db: Queryable, userId: string) {
  const { rows } = await db.query('SELECT … FROM resume_imports WHERE user_id=$1 …', [userId])
  return rows
}
// route:
return withUser(getPool(config), userId, (db) => listResumeImports(db, userId))
```

**Clusters (each = its own commit; run admin-api Jest after each):**

- [ ] **6a — resume-imports.** `routes/resume-imports.ts` (≈245,248,302,416,428,437,461,473,488,502,515) + `lib/repositories/career-history.ts` (all `resume_imports`/`user_career_history`/`resume_import_corrections` fns ≈145–578). Wrap each route handler body in `withUser(getPool(config), userId, db => …)`; thread `db` into the repo fns. Keep `updateCareerEntry`'s internal `BEGIN…` — instead make it accept `db` and drop its own `pool.connect()`/transaction (withUser already provides the txn). Commit: `refactor(admin-api): RLS-scope resume-import routes`.
- [ ] **6b — applications.** `lib/repositories/applications.ts` (38,64,76,84,93,100). Routes already use `withUser` (routes/applications.ts) — change the repo fns to take `db: Queryable` and pass the withUser client through instead of `getPool`. Commit: `refactor(admin-api): RLS-scope application repo queries`.
- [ ] **6c — resumes.** `lib/repositories/resumes.ts` (45,69,78,85,93,108-113). Same: routes pass the withUser `db`. Keep `setActiveResume`'s two UPDATEs inside the single withUser txn (atomic one-active invariant — already transactional via withUser). Commit: `refactor(admin-api): RLS-scope resume repo queries`.
- [ ] **6d — github.** `routes/github.ts` user-scoped sites (72,89,107-129,156,183,192,202-213,280,469,534,620,675,732) + repo fns. Wrap authenticated handlers in `withUser`. KEEP superuser + mark with `systemQuery('github webhook: HMAC-auth, no cognito sub', …)`: webhook handlers (846,913,921), `lookupUserByInstallation` (296), `checkAndIncrementQuota`/`decrementQuota` (241,261) — comment why. Commit: `refactor(admin-api): RLS-scope github routes; mark webhook/quota system paths`.
- [ ] **6e — pipelines / pipeline-runs / me / prompt-feedback (user insert).** `routes/pipelines.ts` already withUser-wrapped → just thread `db` into `pipeline-runs.ts` (58,66) instead of `getPool`. `routes/me.ts:43` `getUserPlanStatus`: wrap in `withUser` (it reads `users` by the caller's own id — RLS `users_isolation` allows self). `routes/prompt-feedback.ts:53` `createPromptFeedback` (user-owned insert) → withUser. Commit: `refactor(admin-api): RLS-scope pipelines/me/prompt-feedback user paths`.
- [ ] **6f — escape-hatch annotation pass.** Wrap every D4 keep-superuser site in `systemQuery('<reason>', () => …)` (no behaviour change) so `grep -rn systemQuery src` is the auditable allowlist. Add `requireAdminGroup()` middleware to `routes/bedrock-usage.ts` and the `getPromptQualityStats` route if not already gated (defence-in-depth for the cross-user analytics that stays superuser). Commit: `refactor(admin-api): mark + admin-gate all superuser escape-hatch queries`.

After **each** 6x: `cd admin-api && NODE_OPTIONS='--experimental-vm-modules' npx jest 2>&1 | grep -E "Test Suites:|Tests:"` — must stay green; the Task 5 RLS test should flip to PASS as its target cluster (6a) lands. Also `npx tsc --noEmit | grep "error TS" || echo CLEAN`.

- [ ] **Final Step (Task 6): full suite + typecheck green, then push.**

Run: `cd admin-api && NODE_OPTIONS='--experimental-vm-modules' npx jest` → all green; `npx tsc --noEmit` → CLEAN.

**CHECKPOINT 3:** Deploy Phase 3 to dev. Smoke every authenticated surface (resumes, applications, resume-import, github connect, pipelines, me). Specifically verify two users cannot see each other's resumes/imports/applications (manual two-account test). A blank list / 0 rows where data should exist ⇒ a path missing `withUser` ⇒ fail-closed working; fix before prod. Admin analytics (finops, prompt quality) still returns cross-user data (superuser path intact).

---

## Rollout / rollback

- **Order is mandatory:** Phase 1 → C1 → Phase 2 → C2 → Phase 3 (clusters) → C3. Phase 1 is inert; Phases 2–3 only "activate" their own callers. A regression in Phase 3 cluster N does not affect cluster <N.
- **Rollback:** app-level — `argo rollouts undo` the affected service (RLS migration stays; superuser/raw paths still work, so an older image is compatible — the policies only constrain `SET ROLE tucaken_app` sessions, which old code never used). DB — policies are additive; to fully disable, a follow-up migration `ALTER TABLE … DISABLE ROW LEVEL SECURITY` (never drop columns).
- **Update** `tucaken-app/production-deployment-check-list.md` §1 once C3 passes: RLS is now DB-enforced by default, not opt-in.

---

## Self-review notes

- Spec coverage: 5 unprotected tables → Task 1. Opt-in→default → Tasks 2–6. UUID-interpolation risk (D6) → Task 4. Pre-auth/global/admin exceptions (D4) → Task 6f + keep-list. JOIN safety (D5) → verified, no task needed. PgBouncer constraint (D1/D2) → Architecture + Task 2/3 transactional shape.
- Type consistency: `withUser(pool, userId, fn(db))` identical signature in both repos; repos uniformly take `db: Queryable`; `recordBedrockCost(db, …)` changed once (Task 3 Step 5) and all callers updated same step.
- No placeholders: migration SQL, wrapper code, and tests are complete. Task 6 is mechanical repetition of one shown transformation across an enumerated, file:line-referenced call-site list (per-site code identical by construction — not a divergent-logic placeholder).
- Known residual: admin-api repo fns are called from BOTH routes (wrap) and a few already-withUser routes; Task 6b/6c/6e explicitly switch those from `getPool` to the passed `db` so they are never double-wrapped.
