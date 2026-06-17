# Design — GitHub repository rename handling (re-key on immutable id)

- **Date:** 2026-06-17
- **Status:** Approved (design); pending implementation plan
- **Repos:** `ai-applications` (ingestion, shared, platform-rds-bootstrap), `tucaken-app` (admin-api)
- **Motivating incident:** A connected repo was renamed on GitHub (`cdk-monitoring` -> `tucaken-infra`). The old `full_name` now resolves to a 301 redirect; `GitHubAdapter` returned the redirect body and callers crashed (`"batch is not iterable"`, `Cannot read properties of undefined (reading 'filter')`). All stored data (~2017 embeddings, file-state, profiles, evidence, sync-state, the `repositories` record) remained under the stale name.

## Problem

Every repo-scoped table keys on the mutable `repo_full_name` string. GitHub's immutable numeric repo `id` is fetched (and even returned to the frontend) but never persisted. A rename therefore:

1. **Breaks ingestion** — the worker fetches GitHub by `full_name`; the old name 301-redirects, the adapter mishandles the redirect body, and the job crashes instead of failing cleanly.
2. **Orphans data** — ~18 tables still reference the old `full_name`; queries by the new name return nothing, and re-connecting would duplicate rather than reconcile.

This is a general, multi-user failure mode: any user renaming (or transferring) a connected repo hits it.

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Identity model | **Full re-key on `github_repo_id`** | The immutable id eliminates the rename/transfer problem class entirely; `full_name` becomes a label. |
| Rollout | **Phased dual-write** | Reversible at each step across ~18 live tables + two repos; `NOT NULL` only after verified backfill. |
| Detection | **Webhook + sync-time self-heal** | Instant UI correctness via webhook; every sync self-heals by resolving by id, so a missed webhook still recovers. |
| `full_name` | **Kept on every table as a display label** | UI continues to show `owner/name`; the string is refreshed on rename, never joined on. |

## Section 1 — Data model

`(user_id, github_repo_id)` becomes the canonical key for all repo-scoped data. `repo_full_name` is retained on every table as a denormalised display label, refreshed on rename, never joined on.

- `repositories` gains `github_repo_id BIGINT` (the immutable anchor). New unique `(user_id, github_repo_id)`; the old `(user_id, provider, full_name)` unique is dropped after cutover.
- Repo-scoped tables gain `github_repo_id BIGINT`: `document_embeddings`, `repo_file_state`, `repo_sync_state`, `repository_profiles`, `repo_profile`, `repo_commits`, `repo_pull_requests`, `repo_evidence_quality`, `evidence_provenance`, `ai_evidence`, `ai_scanned_commits`, `dsa_evidence`, `dsa_scanned_commits`, `technology_evidence`, `technology_parity_runs`, `story_candidates`, `ingestion_audit_log`, `retrieval_probe_history`, and `prompt_invocations` (`repo_name` column).
- GitHub `id` is 64-bit -> `BIGINT`. Denormalising `repo_full_name` on every table (already the pattern for `repo_commits`/`repo_pull_requests`) avoids a join to display a name in list/log queries.

## Section 2 — Detection & reconciliation

Two paths converge on one tested routine.

**A. Real-time webhook** (`tucaken-app` admin-api, `routes/github.ts`)
- GitHub App subscribes to `repository` events. New handler branch for `action in {renamed, transferred}`.
- Payload provides `repository.id` (anchor), `repository.full_name` (new), `changes.repository.name.from` (old). Match the stored row by `github_repo_id`; refresh `full_name`.
- Reuse the existing HMAC-SHA256 signature verification.

**B. Sync-time self-heal** (`ai-applications` `GitHubAdapter`)
- The worker resolves by id: `GET /repositories/{github_repo_id}` always returns the current `full_name`. If it differs from the stored label, reconcile before fetching files/commits.

**Shared routine** — one function, called by both:

```
reconcileRepoName(userId, githubRepoId, newFullName):
  in a single transaction, idempotent (no-op if already current):
    UPDATE repositories + every denormalised label column
      SET repo_full_name = newFullName
      WHERE user_id = $userId AND github_repo_id = $githubRepoId
```

Because data keys on `github_repo_id`, reconciliation only refreshes the display label — it never moves embeddings or touches the hot path. `transferred` (owner change) is the same code path for free.

## Section 3 — Adapter hardening (crash fix)

Independent of the rename feature; a bad GitHub response must never throw a cryptic error.

- **Redirect handling in `this.get`.** GitHub returns 301 for a renamed repo with body `{message, url, documentation_url}` where `url = https://api.github.com/repositories/{id}`. On 3xx, follow `Location` (capped at <=3 hops); on a true 404, throw a typed `RepoNotFoundError`.
- **Shape guards.** `listFiles` and `listCommits` assert array / `.tree` shape before iterating; on mismatch throw a typed `GitHubResponseShapeError` naming the endpoint — never `for...of` an object.
- **`resolveById(githubRepoId)`** helper: `GET /repositories/{id}` -> `{ full_name, default_branch, id }`. The primitive self-heal uses.
- **Typed errors -> graceful status.** `run-ingestion` catches `RepoNotFoundError` and writes `repo_sync_state.status = 'error'` with a clear message instead of crashing.

Redirect-hop cap prevents loops hanging the worker.

## Section 4 — Migration & backfill (phased dual-write)

Migrations in `applications/platform-rds-bootstrap/migrations/` (next free numbers, idempotent DDL), deployed via the artifact-handoff pipeline fixed in PR #250.

**Phase 1 — add + backfill (nullable)**
- Migration `084`: add `github_repo_id BIGINT NULL` to `repositories` + all repo-scoped tables; non-unique `(user_id, github_repo_id)` indexes.
- Backfill task: for each `repositories` row, resolve the id via GitHub (`GET /repos/{full_name}`, following the 301 for renamed repos — how `cdk-monitoring` resolves to its id and current name `tucaken-infra`). Propagate the id to every denormalised table by `(user_id, old full_name)`. Repos that 404 (deleted/revoked) are flagged, not failed.

**Phase 2 — dual-write (one release)**
- admin-api + ingestion write both `github_repo_id` and `full_name` on every insert/upsert.
- Webhook handler + self-heal adapter (Sections 2-3) ship here.

**Phase 3 — verify + cut over**
- Assert 100% backfilled (log any nulls — no silent gaps). Migration `085`: `NOT NULL` + unique `(user_id, github_repo_id)` on `repositories`; flip reads/joins to id; drop the old `full_name` unique. `full_name` remains as label.

Healing `cdk-monitoring` -> `tucaken-infra` falls out of the Phase 1 backfill automatically (resolve by id via the redirect; Phase 2 self-heal refreshes the label). No bespoke SQL — it is the first case the general mechanism handles.

## Section 5 — Decomposition & testing

Multi-PR across two repos; each PR independently shippable, tested, reversible.

**PR sequence**
1. `ai-applications` — adapter hardening (Section 3). Ships first; stops crashes, no schema dependency. Unit tests: mocked 301-rename body, 404, non-array, valid.
2. `ai-applications` — migration 084 (Phase 1 DDL). Validated in a rolled-back txn against dev RDS.
3. `ai-applications` — backfill task (Phase 1): resolve-by-redirect, propagate id; idempotent, re-runnable; logs unresolved repos. Heals `cdk-monitoring`.
4. `tucaken-app` — webhook + dual-write (Phase 2): `repository.renamed/transferred` handler, `reconcileRepoName`, admin-api writes `github_repo_id`; GitHub App subscribes to `repository` events.
5. `ai-applications` — ingestion dual-write + self-heal (Phase 2): worker writes id, resolves by id, refreshes label.
6. `ai-applications` — migration 085 + cutover (Phase 3): verify, `NOT NULL`, unique on id, flip joins.

**Testing**
- Unit: `GitHubAdapter` (mocked HTTP), `reconcileRepoName` (idempotency, transferred case), webhook signature + dispatch.
- Integration: backfill against a seeded dev-like DB; rename webhook -> label refreshed, embeddings untouched.
- Live verification (dev cluster): heal `cdk-monitoring`, confirm id populated + name -> `tucaken-infra`, then a resync succeeds.
- Each migration validated in a rolled-back txn before merge.

PR 1 delivers value alone — the crash class is gone even if the re-key stalled. The phased order means no release ever requires the column before it is backfilled.

## Out of scope

- Repo **deletion** handling beyond flagging (separate concern).
- Non-GitHub providers (`provider` column exists but only `github` is implemented).
- Retroactive re-embedding — re-key preserves all embeddings; no content reprocessing.
