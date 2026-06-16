---
title: Duplicate ingestion Jobs for the same repo
type: troubleshooting
tags: [ingestion, concurrency, race-condition, postgres, kubernetes]
sources:
  - admin-api/src/routes/github.ts
created: 2026-06-16
updated: 2026-06-16
---

## Symptom

Two ingestion Jobs are dispatched for the same `(user_id, repo_full_name)` at
nearly the same time. Triggers seen in practice: a user double-clicking "add
repo", or a GitHub push webhook firing while a manual sync for the same repo is
already in flight. The two Jobs then run the same pipeline concurrently and race
their writes for that repo. A duplicate dispatch also risks double-charging the
monthly ingestion quota.

## Root cause

Job dispatch is fire-and-forget — a route writes `repo_sync_state` and calls
`createNamespacedJob`, with no database-level lock serialising concurrent
dispatches for the same key. The guards that exist are **non-atomic** and only
cover some paths:

- The push webhook reads `sync_status` and skips if it is already `pending` or
  `syncing` ([github.ts](../../admin-api/src/routes/github.ts#L1308-L1318)) — a
  read-then-act check with a TOCTOU window between the read and the subsequent
  `markRepoPending`.
- `markRepoPending` upserts unconditionally:
  `INSERT … ON CONFLICT (user_id, repo_full_name) DO UPDATE SET sync_status = 'pending'`
  ([github.ts](../../admin-api/src/routes/github.ts#L230-L237)). It does **not**
  refuse the update when a sync is already active, so it cannot itself act as a
  claim/lock.
- The manual `POST /connected-repos` path performs a quota check, then marks
  pending and dispatches, with **no in-flight status guard at all**
  ([github.ts](../../admin-api/src/routes/github.ts#L896-L961)) — two concurrent
  requests can both pass.

So protection against duplicates today is partial: the webhook is guarded by a
status read plus a cooldown, while the manual add path relies on the quota
counter and the UI preventing re-clicks.

## Mitigations currently in the codebase

These are what actually limits duplicates on the current branch:

- **Webhook status skip** — push events for a repo already `pending`/`syncing`
  return early ([github.ts](../../admin-api/src/routes/github.ts#L1315-L1318)).
- **Push cooldown** — a 30-minute `PUSH_COOLDOWN_MS` window keyed on
  `last_sync_triggered_at` suppresses rapid re-syncs from successive pushes
  ([github.ts](../../admin-api/src/routes/github.ts#L59),
  [#L1320-L1326](../../admin-api/src/routes/github.ts#L1320-L1326)).
- **Quota gate** — every dispatch path runs `checkAndIncrementQuota` before
  dispatch; the manual path decrements the counter again if dispatch fails so a
  user does not lose a credit on error
  ([github.ts](../../admin-api/src/routes/github.ts#L932-L961)).
- **Worker-side hash dedup** — incremental re-index passes `forceReindex=false`
  so the worker skips unchanged chunks, bounding the damage of a duplicate run
  ([github.ts](../../admin-api/src/routes/github.ts#L1346)).

## How to diagnose

Confirm whether two Jobs exist for one repo and inspect the row's state:

```bash
# Jobs for a user/repo (labels are sanitised: owner-repo, user id)
kubectl get jobs -n <ingestion-namespace> \
  -l app=ingestion-worker --show-labels | grep <repo-slug>

# The authoritative state row (PK is the dedup key)
psql "$PG_URL" -c "SELECT sync_status, last_sync_triggered_at, updated_at \
  FROM repo_sync_state WHERE user_id = '<uuid>' AND repo_full_name = '<owner/repo>';"
```

A repo stuck in `pending`/`syncing` with an old `updated_at` indicates a Job that
died without writing a terminal status — the next dispatch attempt for that repo
is what tends to produce a visible duplicate.

## How to fix

For a stuck row blocking or shadowing dispatch, the app exposes a recovery path
rather than a manual DB edit: the frontend calls
`POST /connected-repos/mark-timed-out` after its 10-minute polling timeout, which
flips stale `pending`/`syncing` rows to `error`
([github.ts](../../admin-api/src/routes/github.ts#L1006-L1037)); the user can then
`POST /connected-repos/:fullName/retry` to re-dispatch
([github.ts](../../admin-api/src/routes/github.ts#L1046-L1069)). If two Jobs are
already running, let them complete — the worker's hash dedup means the second run
is largely a no-op on unchanged chunks — then verify the final `sync_status`.

## How to prevent

Close the remaining race with an **atomic claim** instead of read-then-mark:
make the pending upsert conditional so only one caller can transition the row
into an active state, e.g.

```sql
INSERT INTO repo_sync_state (user_id, repo_full_name, sync_status)
VALUES ($1, $2, 'pending')
ON CONFLICT (user_id, repo_full_name) DO UPDATE
  SET sync_status = 'pending'
  WHERE repo_sync_state.sync_status NOT IN ('pending', 'syncing')
RETURNING xmax;
```

A caller that gets no row back lost the race and must not dispatch. Applying this
in `markRepoPending` (or a dedicated claim helper) and gating **every** dispatch
site on its result — including the currently unguarded manual `POST
/connected-repos` — removes the TOCTOU window for all paths. A prior attempt at
this approach (a `sync-state.ts` claim module, PR #113 / commit `1b48657`) is
**not present on the current branch**, so the hardening above remains
outstanding.

<!--
Evidence trail (auto-generated):
- Source: admin-api/src/routes/github.ts (read on 2026-06-16: lines 59,230-237,896-962,1006-1037,1308-1346)
- Verified absent on 2026-06-16: admin-api/src/lib/sync-state.ts and tryClaimSyncSlot/isSyncInFlight
  (git grep + git merge-base --is-ancestor 1b48657 HEAD → not an ancestor)
- Incident (historical, not in HEAD): commit 1b48657 message — double-click / webhook+manual
  race spawned two Jobs racing writes on document_embeddings
-->
