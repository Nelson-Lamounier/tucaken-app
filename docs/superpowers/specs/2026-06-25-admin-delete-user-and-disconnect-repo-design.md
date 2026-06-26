# Admin: delete user account and disconnect repository connection

Date: 2026-06-25
Status: Approved (design) — pending implementation plan

## Problem

The admin Users view ([/_dashboard/admin/users](../../../src/app/_dashboard/admin/users/route.tsx))
lists Free/Pro/Premium users and supports view, role/plan update, and **restore**.
It cannot yet **delete** a user account, nor **remove a user's GitHub repository
connection**. Both teardown primitives already exist in admin-api but are only
reachable by the daily sweep (hard-delete) or by the user themselves
(self-service GitHub disconnect). The gap is an **admin acting on another user**.

## Goals

1. Admin can delete another user's account, choosing **soft-delete** (30-day
   grace, restorable) or **immediate hard-delete** (irreversible purge).
2. Admin can remove another user's GitHub repository connection as a
   **standalone** action, without deleting the account.
3. Reuse existing teardown machinery; do not duplicate the security-critical
   purge ordering.

## Non-goals

- Bulk/multi-select deletion. One user at a time.
- Changing the self-service deletion or the daily sweep behaviour (beyond the
  refactor in Decision 1).
- Stripe customer deletion (the sweep already documents why this is out of
  scope; the admin hard-delete keeps the same stance).

## Existing building blocks (reused)

| Primitive | Location |
|---|---|
| `softDeleteUser(pool, userId, reason)` — sets `deleted_at`, idempotent | [users.ts:407](../../../admin-api/src/lib/repositories/users.ts) |
| `hardDeleteUser(pool, userId)` — DELETE, children cascade | [users.ts:469](../../../admin-api/src/lib/repositories/users.ts) |
| `restoreSoftDeletedUser` + `POST /:userId/restore` | [admin-users.ts:69](../../../admin-api/src/routes/admin-users.ts) |
| `revokeGitHubInstallationForUser(pool, appId, key, userId)` — best-effort, never throws | [github-uninstall.ts:28](../../../admin-api/src/lib/github-uninstall.ts) |
| `adminDisableUser` / `adminDeleteUser` / `adminEnableUser` (Cognito) | [cognito-admin.js:39/66/85](../../../admin-api/src/lib/cognito-admin.js) |
| Sweep purge ordering: GitHub revoke -> Cognito delete -> DB delete | [account-sweep.ts:99-118](../../../admin-api/src/scripts/account-sweep.ts) |
| `requireAdminGroup()` gate on `/api/admin/users/*` | [admin-api/src/index.ts:180](../../../admin-api/src/index.ts) |
| `requireAdmin()` SSR guard + `apiFetch` BFF forward pattern | [src/server/admin-users.ts](../../../src/server/admin-users.ts) |

## Decision 1 — shared `purgeUser()` helper (Option A)

Extract the hard-delete sequence currently inlined in `account-sweep.ts` into a
single function, the one source of truth for purge ordering:

```
admin-api/src/lib/purge-user.ts
  purgeUser(pool, cognito, cfg, user) -> { githubUninstall, cognito, db }
```

Order (unchanged from the sweep — GitHub before DB so `installation_id`
survives until revoke):

1. `revokeGitHubInstallationForUser(...)` (best-effort, never throws; outcome
   captured)
2. `adminDeleteUser(...)` on Cognito (idempotent: `UserNotFoundException` ->
   success)
3. `hardDeleteUser(pool, user.id)` — children cascade

- **Sweep** (`account-sweep.ts`) is refactored to call `purgeUser()` inside its
  candidate loop. Its existing skip-on-error / retry-tomorrow semantics are
  preserved by keeping the try/catch in the loop.
- **Admin endpoint** calls `purgeUser()` once and returns the structured
  outcome so the UI can report partial failure (e.g. DB deleted but GitHub
  revoke failed -> reconciliation backstop will catch it).

Verification: re-run `GRACE_DAYS=0 npx tsx admin-api/src/scripts/account-sweep.ts --dry-run`
to confirm the sweep still behaves identically after the refactor.

## Decision 2 — admin-api endpoints

All mounted on the existing `/api/admin/users` router, already gated by
`requireAdminGroup()`.

### `DELETE /api/admin/users/:userId`

Body (Zod): `{ mode: 'soft' | 'hard', reason?: string }`.

- **Guards** (return 403): caller cannot delete **their own** account
  (`userId === ctx user sub`-mapped id); cannot **hard-delete another admin**
  (look up target `role`; refuse if `admin`/`super_admin`). Soft-delete of an
  admin is also refused for safety — keep it simple: no admin may be deleted
  through this endpoint by another admin; demote first.
- **soft**: `adminDisableUser(...)` then `softDeleteUser(pool, userId, reason)`.
  Idempotent. Returns `{ ok: true, mode: 'soft', alreadyDeleted: boolean }`.
- **hard**: `purgeUser(...)`. Returns `{ ok: true, mode: 'hard', outcome: {...} }`
  with the per-step result; `200` even on best-effort GitHub failure, but the
  body flags it so the UI can surface a warning (mirrors the restore endpoint's
  `warning` pattern).
- `400` malformed UUID / invalid body; `404` if user not found.

### `DELETE /api/admin/users/:userId/github`

Standalone repo disconnect, no account change.

1. `revokeGitHubInstallationForUser(...)` (best-effort).
2. `DELETE FROM oauth_connections WHERE user_id = $1 AND provider = 'github'`
   (repositories cascade via FK). Reuse / lift the existing `deleteConnection`
   helper from `github.ts` rather than re-writing the SQL.

Returns `{ ok: true, disconnected: boolean, githubUninstall: RevokeOutcome }`.
`disconnected: false` when there was no connection (no-op, still `200`).

## Decision 3 — server functions (SSR edge)

Add to [src/server/admin-users.ts](../../../src/server/admin-users.ts),
following the existing `requireAdmin()` -> `apiFetch` pattern:

- `deleteAdminUserFn` — `createServerFn({ method: 'POST' })`, validator
  `{ id: uuid, mode: 'soft'|'hard', reason?: string }`, forwards
  `DELETE /users/:id`.
- `disconnectAdminUserGithubFn` — validator `{ id: uuid }`, forwards
  `DELETE /users/:id/github`.

(POST transport at the server-fn layer is fine; the BFF call uses the DELETE
method via `apiFetch`.)

## Decision 4 — UI

In the admin-users feature (mirror the existing list/detail components; reuse
`src/components/ui` primitives, `rounded-md`, both light/dark):

- **Delete control** (row action and/or detail panel): opens a modal with a
  soft/hard radio. Soft shows an optional reason field. **Hard** requires
  typing the target user's email to enable the destructive confirm button, and
  shows an irreversible-action warning. On success: toast + invalidate the
  admin-users list query (and detail query).
- **Disconnect GitHub control**: plain confirm dialog ("Remove GitHub
  connection for <email>? Their repositories will be unlinked."). On success:
  toast + invalidate queries. Hidden/disabled when the user has no connection
  if that state is available to the UI; otherwise a no-op `disconnected: false`
  is reported gracefully.

Guard clauses after hooks; no nested ternaries (SonarQube S3358); stable keys.

## Error handling

- All endpoints validate input with Zod at the boundary.
- Self-delete and admin-target guards enforced server-side (UI is never the
  access control).
- Hard-delete reports partial external-system failure rather than rolling back
  a completed DB delete (cannot un-delete); GitHub revoke failure is logged and
  surfaced, reconciliation sweep is the backstop.
- Soft-delete and disconnect are idempotent; double-clicks degrade to
  `alreadyDeleted` / `disconnected: false`.

## Testing (Vitest)

admin-api endpoint tests:
- soft branch: disables Cognito + sets `deleted_at`; second call -> `alreadyDeleted: true`.
- hard branch: invokes `purgeUser` order; partial GitHub failure still `200` with flag.
- self-delete guard -> 403; admin-target guard -> 403.
- disconnect with a connection -> removes rows; without -> `disconnected: false`.
- malformed UUID / bad body -> 400.

Refactor safety: existing sweep test (or dry-run) still green after `purgeUser`
extraction.

## Out of scope / follow-ups

- Bulk deletion, audit-log UI, email notification to the deleted user.

## Worktree

Implemented in an isolated worktree, not the primary `main` checkout:
`git worktree add ../tucaken-app-wt-account-deletion feat/admin-account-deletion`
(path + branch to be confirmed by the user before creation).
