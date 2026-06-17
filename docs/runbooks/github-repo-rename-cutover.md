# Runbook — GitHub repo rename re-key: deploy, backfill, and end-to-end test

Operational guide for shipping and testing the "rename handling / re-key on `github_repo_id`" work across **ai-applications** (ingestion, shared, platform-rds-bootstrap) and **tucaken-app** (admin-api). Implements spec `docs/superpowers/specs/2026-06-17-github-repo-rename-handling-design.md`; plan `docs/superpowers/plans/2026-06-17-github-repo-rename-handling.md`.

## What you can test after a normal (non-destructive) deploy

After steps 1–6 below, the full rename flow is live and safe — **both** the legacy `(user_id, provider, full_name)` unique and the new `(user_id, github_repo_id)` unique coexist, so nothing about the existing connect path breaks. Migration **086** (the legacy-unique drop) and the admin-api `ON CONFLICT` flip are the *final* hardening and are NOT required to test renames; they are step 8.

## Deploy order (each step is safe to stop at)

The ordering exists because the admin-api dual-write and the worker both reference the `github_repo_id` column, so the **column must exist in the DB before that code deploys**, and the destructive drop must come last.

1. **ai-applications PR1 — adapter hardening.** No schema dependency. Deploy any time. Removes the `"batch is not iterable"` crash class immediately.

2. **ai-applications migration 084** (`084_github_repo_id_nullable.sql`). Adds nullable `github_repo_id` + `(user_id, github_repo_id)` indexes to `repositories` + 19 repo-scoped tables. Apply via the platform-rds-bootstrap deploy (the `apply-migrations` K8s Job in `.github/workflows/deploy-platform-rds-bootstrap.yml`).
   - **Validate first in a rolled-back txn against dev RDS:**
     ```bash
     psql "$DEV_DATABASE_URL" <<'SQL'
     BEGIN;
     \i applications/platform-rds-bootstrap/migrations/084_github_repo_id_nullable.sql
     \d+ repositories
     ROLLBACK;
     SQL
     ```
     Expect: `github_repo_id | bigint`, no errors.

3. **ai-applications PR3 backfill** — run AFTER 084 is applied to the target DB. Resolves each repo by name (following GitHub's 301 for already-renamed repos) and fills `github_repo_id` everywhere; idempotent and re-runnable; flags (does not fail on) 404s. Heals `cdk-monitoring` → `tucaken-infra`.
   ```bash
   cd /path/to/ai-applications
   DATABASE_URL="$DEV_DATABASE_URL" GITHUB_TOKEN="$DEV_GH_TOKEN" \
     npx tsx scripts/backfill-github-repo-id.ts
   ```
   Output: `[backfill] resolved=N unresolved=M`. Each unresolved repo is logged with a `UNRESOLVED` warning (404 — deleted/revoked; flagged, not failed).
   - **Re-run** to confirm idempotency → `resolved=0`.

4. **Verify backfill is complete (gate for 085):**
   ```bash
   psql "$DEV_DATABASE_URL" -c \
     "SELECT count(*) AS missing FROM repositories WHERE provider='github' AND github_repo_id IS NULL;"
   ```
   Expect `missing = 0`. If non-zero, list them and decide before proceeding:
   ```bash
   psql "$DEV_DATABASE_URL" -c \
     "SELECT user_id, full_name FROM repositories WHERE provider='github' AND github_repo_id IS NULL;"
   ```
   (A non-zero count is fine to leave until step 7 — it only *blocks 085*, not the rename feature. 085's guard will abort loudly if you skip this.)

5. **ai-applications PR5b** (worker self-heal + dual-write) and **tucaken-app PR4 + PR5a** (webhook, reconcile, dual-write on connect, `GITHUB_REPO_ID` env). Deploy AFTER 084 (they write the column). admin-api deploys via its Argo Rollouts blueGreen; the worker image via its Job pipeline. Both are additive — `COALESCE(EXCLUDED.github_repo_id, …)` means a pre-backfill (null-id) write never clobbers a known id.

6. **Subscribe the GitHub App to `repository` events** (config, not code). App slug is **`tucaken`**.
   - UI: https://github.com/settings/apps/tucaken → **Permissions & events** → **Subscribe to events** → tick **Repository** → Save.
   - The webhook also needs `GITHUB_WEBHOOK_SECRET` set for admin-api (already required by the existing installation/push handlers).
   - Without this subscription, renames still self-heal on the next sync (PR5b), just not in real time.

7. **ai-applications migration 085** (`085_github_repo_id_cutover.sql`) — apply only after step 4 shows `missing = 0`. Enforces `NOT NULL` + creates the unique `(user_id, github_repo_id)` index on `repositories`. **Non-destructive** — it does NOT drop the legacy unique. Validate in a rolled-back txn first:
   ```bash
   psql "$DEV_DATABASE_URL" <<'SQL'
   BEGIN;
   \i applications/platform-rds-bootstrap/migrations/085_github_repo_id_cutover.sql
   \d repositories
   ROLLBACK;
   SQL
   ```
   Expect: `github_repo_id` `not null`; `uq_repositories_user_ghid` present; the old `_key` unique still present (intentionally).

8. **FINAL hardening — migration 086 + admin-api `ON CONFLICT` flip (do together, last).** Optional for testing; only needed to make `full_name` a pure label.
   - **086** (`086_drop_legacy_name_unique.sql`) drops `repositories_user_id_provider_full_name_key`.
   - That key is the `ON CONFLICT` target of `connectRepoWithDefaultProject` (`admin-api/src/routes/github.ts`). **Deploying 086 before flipping admin-api breaks every connect/resync INSERT.** Required order: ship the admin-api flip first, then apply 086.
   - The flip is NOT a trivial one-liner: changing `ON CONFLICT (user_id, provider, full_name)` to `ON CONFLICT (user_id, github_repo_id)` requires every insert on that path to supply a **non-null** id. The connect path does (via `buildRepoIdMap`), but the **defer-sync path currently writes a null id** — handle that first (e.g. resolve the id before insert on the defer path, or keep a fallback). Treat this as its own small PR with its own tests before applying 086. Confirm the constraint name against `\d repositories` on the live DB.

## Manual end-to-end test (after steps 1–7)

1. Connect a dev repo through the app; confirm the row carries the id:
   ```bash
   psql "$DEV_DATABASE_URL" -c \
     "SELECT full_name, github_repo_id FROM repositories WHERE full_name = 'owner/test-repo';"
   ```
2. Note the embeddings count for that repo (must be unchanged by a rename):
   ```bash
   psql "$DEV_DATABASE_URL" -c \
     "SELECT count(*) FROM document_embeddings WHERE github_repo_id = <id>;"
   ```
3. **Real-time path:** rename the repo on GitHub (`owner/test-repo` → `owner/test-repo-renamed`). Within seconds the admin-api log shows:
   `[github/webhook] repository.renamed: reconciled repo <id> -> owner/test-repo-renamed for user <uid>`
   Confirm the label refreshed everywhere and embeddings are untouched:
   ```bash
   psql "$DEV_DATABASE_URL" -c \
     "SELECT full_name FROM repositories WHERE github_repo_id = <id>;"          -- new name
   psql "$DEV_DATABASE_URL" -c \
     "SELECT count(*) FROM document_embeddings WHERE github_repo_id = <id>;"     -- same count
   ```
4. **Self-heal path (missed webhook):** rename a second repo but do NOT rely on the webhook (e.g. temporarily unsubscribe). Trigger a sync. The worker resolves by id, calls `reconcileRepoName`, refreshes the label, and the sync succeeds.
5. **Crash-fix path:** revoke access to / delete a connected repo, trigger a sync. Expect `repo_sync_state.status = 'error'` with the friendly "no longer accessible on GitHub … reconnect it" message — no crash, no `"batch is not iterable"`.

## Rollback

- Migrations 084/085 are additive — reverse with `DROP INDEX uq_repositories_user_ghid; ALTER TABLE repositories ALTER COLUMN github_repo_id DROP NOT NULL;` and drop the columns/indexes if needed.
- 086 reverse: `ALTER TABLE repositories ADD CONSTRAINT repositories_user_id_provider_full_name_key UNIQUE (user_id, provider, full_name);`
- The application code (dual-write, webhook, self-heal) is backward-compatible with a null `github_repo_id`, so rolling back the migrations does not require rolling back the code.
