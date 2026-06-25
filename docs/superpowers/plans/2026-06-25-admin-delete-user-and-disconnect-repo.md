# Admin: Delete User Account & Disconnect Repository — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin delete another user's account (soft-delete with 30-day grace, or immediate hard-delete) and remove a user's GitHub repository connection as a standalone action, from the admin Users view.

**Architecture:** Three new admin-api endpoints on the already-guarded `/api/admin/users/*` router, plus two SSR server functions and UI controls. The hard-delete sequence (GitHub revoke -> Cognito delete -> DB delete) is extracted into one shared `purgeUser()` helper reused by both the new endpoint and the existing daily sweep, so the security-critical ordering has a single source of truth.

**Tech Stack:** Hono (admin-api), TanStack Start `createServerFn` + TanStack Query (frontend), Zod, Headless UI dialog, Jest (admin-api tests), Vitest (frontend tests).

## Global Constraints

- Package manager: **Yarn 4 only**. `yarn workspace admin-api test`, `yarn typecheck`, `yarn lint`, `yarn test`. Never npm/npx.
- admin-api tests use **Jest** (`@jest/globals`, fake-pool pattern). Frontend tests use **Vitest**.
- Prose / copy in **English (UK)**; product name **Tucaken**, never "agent". No non-ASCII diacritics.
- TypeScript quality (SonarQube): no nested ternaries (S3358) — guard clauses; catch as `unknown`; `Number.*` not globals; `Set.has()` for allow-lists; no `console.*` in app code (use Pino `logger`); stable React keys; `crypto.randomUUID()` not `Math.random()`.
- New UI components: default `rounded-md`; correct in light + dark; reuse `src/components/ui` primitives.
- Cyclomatic complexity <= 10 per function (ESLint `complexity`).
- UI is never access control — every server boundary re-checks auth and validates with Zod.
- Work happens only in the worktree `tucaken-app-wt-account-deletion` on branch `feat/admin-account-deletion`. Never `git checkout` another branch here.
- Run `yarn typecheck && yarn lint` after each task; the relevant test command before each commit.

## Existing building blocks (do not re-implement)

| Symbol | File |
|---|---|
| `softDeleteUser(pool, userId, reason)` -> `Promise<boolean>` | `admin-api/src/lib/repositories/users.ts:407` |
| `hardDeleteUser(pool, userId)` -> `Promise<void>` | `admin-api/src/lib/repositories/users.ts:469` |
| `getAdminUserById(pool, userId)` (returns `{ role, ... }`) | `admin-api/src/lib/repositories/users.ts` |
| `revokeGitHubInstallationForUser(pool, appId, privateKey, userId)` -> `RevokeOutcome` | `admin-api/src/lib/github-uninstall.ts:28` |
| `adminDisableUser(userPoolId, region, sub)` / `adminDeleteUser(...)` | `admin-api/src/lib/cognito-admin.ts:39/66` |
| `deleteConnection(pool, userId)` (cascades repos/embeddings/oauth) | `admin-api/src/routes/github.ts:126` |
| `requireUserId(ctx)` -> caller `users.id` | `admin-api/src/lib/types.ts:26` |
| `apiFetch<T>(path, opts)` (supports `method: 'DELETE'`, `pathTemplate`) | `src/server/_api-client.ts:57` |
| `requireAdmin()` SSR guard | `src/server/auth-guard.ts` |
| `adminKeys.users.all` query key | `src/lib/api/query-keys.ts:85` |
| `ChangeRolePlanModal` (Headless UI dialog pattern to mirror) | `src/features/admin-users/components/ChangeRolePlanModal.tsx` |

`RevokeOutcome = 'revoked' | 'not_connected' | 'not_configured' | 'failed'`.

---

## Task 1: Extract `purgeUser()` helper + refactor the sweep

Single source of truth for the hard-delete sequence. The sweep currently inlines it at `account-sweep.ts:99-118`.

**Files:**
- Create: `admin-api/src/lib/purge-user.ts`
- Create (test): `admin-api/__tests__/lib/purge-user.test.ts`
- Modify: `admin-api/src/scripts/account-sweep.ts` (replace inline sequence with the helper)

**Interfaces:**
- Produces:
  ```ts
  export interface PurgeUserDeps {
    pool: import('pg').Pool
    cognito: import('@aws-sdk/client-cognito-identity-provider').CognitoIdentityProviderClient
    userPoolId: string
    region: string
    githubAppId: string | undefined
    githubPrivateKey: string | undefined
  }
  export interface PurgeOutcome {
    githubUninstall: import('./github-uninstall.js').RevokeOutcome
    cognitoDeleted: boolean
    dbDeleted: boolean
  }
  export async function purgeUser(deps: PurgeUserDeps, userId: string, cognitoSub: string): Promise<PurgeOutcome>
  ```
  Order: GitHub revoke (best-effort, never throws) -> `adminDeleteUser` (Cognito; idempotent) -> `hardDeleteUser` (DB). Cognito + DB failures propagate (caller decides). GitHub outcome is captured, never throws.

- [ ] **Step 1: Write the failing test**

`admin-api/__tests__/lib/purge-user.test.ts`:
```ts
/** @format */
import { describe, it, expect, jest } from '@jest/globals'

const revokeMock = jest.fn<() => Promise<string>>()
const adminDeleteMock = jest.fn<() => Promise<void>>()
const hardDeleteMock = jest.fn<() => Promise<void>>()

jest.unstable_mockModule('../../src/lib/github-uninstall.js', () => ({
  revokeGitHubInstallationForUser: revokeMock,
}))
jest.unstable_mockModule('../../src/lib/cognito-admin.js', () => ({
  adminDeleteUser: adminDeleteMock,
}))
jest.unstable_mockModule('../../src/lib/repositories/users.js', () => ({
  hardDeleteUser: hardDeleteMock,
}))

const { purgeUser } = await import('../../src/lib/purge-user.js')

const deps = {
  pool: {} as never,
  cognito: {} as never,
  userPoolId: 'pool-1',
  region: 'eu-west-1',
  githubAppId: 'app-1',
  githubPrivateKey: 'key-1',
}

describe('purgeUser', () => {
  it('revokes GitHub, deletes Cognito, then deletes DB — in that order', async () => {
    const order: string[] = []
    revokeMock.mockImplementation(async () => { order.push('github'); return 'revoked' })
    adminDeleteMock.mockImplementation(async () => { order.push('cognito') })
    hardDeleteMock.mockImplementation(async () => { order.push('db') })

    const out = await purgeUser(deps, 'user-1', 'sub-1')

    expect(order).toEqual(['github', 'cognito', 'db'])
    expect(out).toEqual({ githubUninstall: 'revoked', cognitoDeleted: true, dbDeleted: true })
  })

  it('still deletes Cognito + DB when GitHub revoke reports failure (best-effort)', async () => {
    revokeMock.mockResolvedValue('failed')
    adminDeleteMock.mockResolvedValue(undefined)
    hardDeleteMock.mockResolvedValue(undefined)

    const out = await purgeUser(deps, 'user-1', 'sub-1')

    expect(out.githubUninstall).toBe('failed')
    expect(out.cognitoDeleted).toBe(true)
    expect(out.dbDeleted).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test purge-user`
Expected: FAIL — cannot find module `../../src/lib/purge-user.js`.

- [ ] **Step 3: Write the implementation**

`admin-api/src/lib/purge-user.ts`:
```ts
/**
 * @format
 * Single source of truth for the hard-delete sequence. Reused by the daily
 * account-sweep (loops over expired soft-deletes) and the admin "purge now"
 * endpoint (one user, synchronous outcome).
 *
 * Order is load-bearing: revoke the GitHub App BEFORE the DB row (and its
 * oauth_connections) cascade away — once gone, installation_id is lost and the
 * App is orphaned on GitHub. GitHub revoke is best-effort (never throws); the
 * reconciliation sweep is the backstop. Cognito + DB failures propagate so the
 * caller can abort and leave the row soft-deleted for a later retry.
 */
import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import type { Pool } from 'pg'

import { adminDeleteUser } from './cognito-admin.js'
import type { RevokeOutcome } from './github-uninstall.js'
import { revokeGitHubInstallationForUser } from './github-uninstall.js'
import { hardDeleteUser } from './repositories/users.js'

export interface PurgeUserDeps {
  pool: Pool
  cognito: CognitoIdentityProviderClient
  userPoolId: string
  region: string
  githubAppId: string | undefined
  githubPrivateKey: string | undefined
}

export interface PurgeOutcome {
  githubUninstall: RevokeOutcome
  cognitoDeleted: boolean
  dbDeleted: boolean
}

export async function purgeUser(
  deps: PurgeUserDeps,
  userId: string,
  cognitoSub: string,
): Promise<PurgeOutcome> {
  const githubUninstall = await revokeGitHubInstallationForUser(
    deps.pool, deps.githubAppId, deps.githubPrivateKey, userId,
  )
  await adminDeleteUser(deps.userPoolId, deps.region, cognitoSub)
  await hardDeleteUser(deps.pool, userId)
  return { githubUninstall, cognitoDeleted: true, dbDeleted: true }
}
```

Note: the sweep's existing `deleteFromCognito` calls `AdminDeleteUser` with `Username: user.id` (the DB UUID). `adminDeleteUser` in `cognito-admin.ts` takes a `sub`. The sweep refactor (Step 5) must pass the **Cognito sub**, not `user.id`. `findUsersForHardDelete` does not currently return the sub — extend the sweep's candidate query to join `user_identities` for `cognito_sub` (see Step 5). This corrects a latent mismatch where the sweep deleted by UUID rather than sub.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace admin-api test purge-user`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor the sweep to use `purgeUser` + pass the Cognito sub**

In `admin-api/src/scripts/account-sweep.ts`:

5a. Extend the candidate query so each row carries its Cognito sub. In `admin-api/src/lib/repositories/users.ts`, change `findUsersForHardDelete` to also select the sub:
```ts
// add to the SELECT: join user_identities for the first sub
`SELECT u.id, u.email, u.deleted_at, u.stripe_customer_id, u.stripe_subscription_id,
        (SELECT ui.cognito_sub FROM user_identities ui WHERE ui.user_id = u.id LIMIT 1) AS cognito_sub
   FROM users u
  WHERE u.deleted_at IS NOT NULL
    AND u.deleted_at < NOW() - ($1 || ' days')::INTERVAL`
```
and add `cognitoSub: string | null` to the returned row mapping (`cognitoSub: r.cognito_sub`). Update the function's return type accordingly.

5b. Replace the inline sequence (lines ~99-118) with:
```ts
import { purgeUser } from '../lib/purge-user.js'
// ...
const deps = {
  pool, cognito, userPoolId,
  region: process.env['AWS_REGION'] ?? 'eu-west-1',
  githubAppId: GITHUB_APP_ID, githubPrivateKey: GITHUB_PRIVATE_KEY,
}
for (const user of candidates) {
  const ctx = { id: user.id, email: user.email, deletedAt: user.deletedAt }
  if (DRY_RUN) { console.log('[dry-run] would purge', ctx); continue }
  if (!user.cognitoSub) {
    result.skipped.push({ id: user.id, reason: 'no cognito_sub' })
    continue
  }
  try {
    const outcome = await purgeUser(deps, user.id, user.cognitoSub)
    result.purged.push(user.id)
    console.log('purged', { ...ctx, ...outcome })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.skipped.push({ id: user.id, reason: msg })
    console.error('purge_failed', { ...ctx, err: msg })
  }
}
```
Delete the now-unused local `deleteFromCognito` helper and its now-unused imports (`AdminDeleteUserCommand`, `UserNotFoundException`) **only if** nothing else in the file uses them. Keep the `// eslint-disable-next-line no-console` comments on the `console.*` lines (this is an ops script, console is permitted there).

- [ ] **Step 6: Verify sweep still behaves identically (dry-run)**

Run: `yarn typecheck`
Then: `GRACE_DAYS=0 yarn dlx tsx admin-api/src/scripts/account-sweep.ts --dry-run`
Expected: typecheck passes; dry-run prints `[dry-run] would purge ...` lines and a `sweep summary` with no thrown errors (it connects to whatever PG env is set; if no DB locally, an inability-to-connect error is acceptable evidence the code path compiles — note it).

- [ ] **Step 7: Commit**

```bash
git add admin-api/src/lib/purge-user.ts admin-api/__tests__/lib/purge-user.test.ts admin-api/src/scripts/account-sweep.ts admin-api/src/lib/repositories/users.ts
git commit -m "refactor(admin-api): extract purgeUser() helper shared by sweep and admin purge"
```

---

## Task 2: `DELETE /api/admin/users/:userId` (soft + hard delete)

**Files:**
- Modify: `admin-api/src/routes/admin-users.ts` (add the route + Zod body + guards)
- Create (test): `admin-api/__tests__/routes/admin-users-delete.test.ts`

**Interfaces:**
- Consumes: `purgeUser`, `PurgeUserDeps` (Task 1); `softDeleteUser`, `getAdminUserById`; `adminDisableUser`; `requireUserId`.
- Produces (HTTP):
  - `DELETE /api/admin/users/:userId` body `{ mode: 'soft' | 'hard', reason?: string }`
  - soft -> `{ ok: true, mode: 'soft', alreadyDeleted: boolean }`
  - hard -> `{ ok: true, mode: 'hard', outcome: PurgeOutcome }`
  - guards -> `403 { error: 'CannotDeleteSelf' | 'CannotDeleteAdmin' }`
  - `400` invalid UUID / body; `404 { error: 'NotFound' }`.

The handler must stay under cyclomatic complexity 10 — extract the soft path and the hard path into module-scope helper functions `handleSoftDelete` and `handleHardDelete`; the route body is guard clauses + a 2-branch dispatch.

- [ ] **Step 1: Write the failing test**

`admin-api/__tests__/routes/admin-users-delete.test.ts`:
```ts
/** @format */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { Hono } from 'hono'

const softDeleteUser = jest.fn<() => Promise<boolean>>()
const getAdminUserById = jest.fn<() => Promise<{ role: string } | null>>()
const adminDisableUser = jest.fn<() => Promise<void>>()
const purgeUser = jest.fn<() => Promise<unknown>>()
const getPool = jest.fn(() => ({
  query: jest.fn(async () => ({ rows: [{ cognito_sub: 'sub-target' }] })),
}))

jest.unstable_mockModule('../../src/lib/repositories/users.js', () => ({
  softDeleteUser, getAdminUserById,
  // re-export the other named members the router imports, as no-op mocks:
  listUsers: jest.fn(), adminUpdateUser: jest.fn(), restoreSoftDeletedUser: jest.fn(),
}))
jest.unstable_mockModule('../../src/lib/cognito-admin.js', () => ({
  adminDisableUser, adminEnableUser: jest.fn(),
}))
jest.unstable_mockModule('../../src/lib/purge-user.js', () => ({ purgeUser }))
jest.unstable_mockModule('../../src/lib/pg.js', () => ({ getPool }))

const { createAdminUsersRouter } = await import('../../src/routes/admin-users.js')

const TARGET = '11111111-1111-1111-1111-111111111111'
const CALLER = '22222222-2222-2222-2222-222222222222'
const cfg = { cognitoUserPoolId: 'pool', awsRegion: 'eu-west-1', githubAppId: 'a', githubPrivateKey: 'k' } as never

function appWithCaller(callerId: string) {
  const app = new Hono()
  app.use('*', async (c, next) => { c.set('userId', callerId); await next() })
  app.route('/', createAdminUsersRouter(cfg))
  return app
}

beforeEach(() => { jest.clearAllMocks(); getAdminUserById.mockResolvedValue({ role: 'user' }) })

describe('DELETE /:userId', () => {
  it('soft-deletes: disables Cognito and sets deleted_at', async () => {
    softDeleteUser.mockResolvedValue(true)
    const res = await appWithCaller(CALLER).request(`/${TARGET}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'soft', reason: 'spam' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, mode: 'soft', alreadyDeleted: false })
    expect(adminDisableUser).toHaveBeenCalledTimes(1)
    expect(softDeleteUser).toHaveBeenCalledWith(expect.anything(), TARGET, 'spam')
  })

  it('hard-deletes via purgeUser and returns the outcome', async () => {
    purgeUser.mockResolvedValue({ githubUninstall: 'revoked', cognitoDeleted: true, dbDeleted: true })
    const res = await appWithCaller(CALLER).request(`/${TARGET}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'hard' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, mode: 'hard', outcome: { githubUninstall: 'revoked' } })
    expect(purgeUser).toHaveBeenCalledTimes(1)
  })

  it('refuses to delete your own account (403)', async () => {
    const res = await appWithCaller(TARGET).request(`/${TARGET}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'soft' }),
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'CannotDeleteSelf' })
  })

  it('refuses to delete another admin (403)', async () => {
    getAdminUserById.mockResolvedValue({ role: 'admin' })
    const res = await appWithCaller(CALLER).request(`/${TARGET}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'soft' }),
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'CannotDeleteAdmin' })
  })

  it('404 when the user does not exist', async () => {
    getAdminUserById.mockResolvedValue(null)
    const res = await appWithCaller(CALLER).request(`/${TARGET}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'soft' }),
    })
    expect(res.status).toBe(404)
  })

  it('400 on malformed UUID', async () => {
    const res = await appWithCaller(CALLER).request('/not-a-uuid', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'soft' }),
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test admin-users-delete`
Expected: FAIL — route returns 404 for all (handler not defined yet).

- [ ] **Step 3: Implement the route**

In `admin-api/src/routes/admin-users.ts`, add imports:
```ts
import { adminDisableUser } from '../lib/cognito-admin.js'
import { purgeUser } from '../lib/purge-user.js'
import { getAdminUserById, softDeleteUser } from '../lib/repositories/users.js' // extend existing import list
import { requireUserId } from '../lib/types.js'
```
Add the Zod body near the other schemas:
```ts
const DeleteBody = z.object({
  mode: z.enum(['soft', 'hard']),
  reason: z.string().max(500).optional(),
})

const PRIVILEGED_ROLES = new Set(['admin', 'super_admin'])
```
Add two module-scope helpers (keep the route body flat / complexity <= 10):
```ts
async function firstCognitoSub(pool: import('pg').Pool, userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ cognito_sub: string }>(
    `SELECT cognito_sub FROM user_identities WHERE user_id = $1 LIMIT 1`,
    [userId],
  )
  return rows[0]?.cognito_sub ?? null
}

async function handleSoftDelete(
  config: AdminApiConfig, pool: import('pg').Pool, userId: string, reason: string | null,
): Promise<{ ok: true; mode: 'soft'; alreadyDeleted: boolean }> {
  const sub = await firstCognitoSub(pool, userId)
  if (sub) await adminDisableUser(config.cognitoUserPoolId, config.awsRegion, sub)
  const deleted = await softDeleteUser(pool, userId, reason)
  logger.warn({ event: 'admin_user_soft_deleted', userId, reason }, 'admin soft-deleted user')
  return { ok: true, mode: 'soft', alreadyDeleted: !deleted }
}
```
Then the route, mounted before `router.get('/')` so static segments are unaffected:
```ts
router.delete('/:userId', async (ctx) => {
  const userId = ctx.req.param('userId')
  if (!UUID_RE.test(userId)) return ctx.json({ error: 'Invalid userId' }, 400)

  const callerId = requireUserId(ctx)
  if (!callerId) return ctx.json({ error: 'Unauthenticated' }, 401)
  if (callerId === userId) return ctx.json({ error: 'CannotDeleteSelf' }, 403)

  let raw: unknown
  try { raw = await ctx.req.json() } catch { return ctx.json({ error: 'Invalid JSON body' }, 400) }
  const parsed = DeleteBody.safeParse(raw)
  if (!parsed.success) return ctx.json({ error: 'Validation failed', issues: parsed.error.issues }, 400)

  const pool = getPool(config)
  const target = await getAdminUserById(pool, userId)
  if (!target) return ctx.json({ error: 'NotFound', userId }, 404)
  if (PRIVILEGED_ROLES.has(target.role)) return ctx.json({ error: 'CannotDeleteAdmin' }, 403)

  if (parsed.data.mode === 'soft') {
    return ctx.json(await handleSoftDelete(config, pool, userId, parsed.data.reason ?? null))
  }

  const sub = await firstCognitoSub(pool, userId)
  if (!sub) return ctx.json({ error: 'NoCognitoIdentity', userId }, 409)
  const outcome = await purgeUser(
    {
      pool,
      cognito: getCognitoClient(config.awsRegion),
      userPoolId: config.cognitoUserPoolId,
      region: config.awsRegion,
      githubAppId: config.githubAppId,
      githubPrivateKey: config.githubPrivateKey,
    },
    userId, sub,
  )
  logger.warn({ event: 'admin_user_hard_deleted', userId, outcome }, 'admin hard-deleted user')
  return ctx.json({ ok: true, mode: 'hard', outcome })
})
```
`purgeUser` needs a `CognitoIdentityProviderClient`. Add a tiny cached factory at the top of the file (mirrors `cognito-admin.ts`'s lazy client):
```ts
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
let _cognito: CognitoIdentityProviderClient | null = null
function getCognitoClient(region: string): CognitoIdentityProviderClient {
  if (!_cognito) _cognito = new CognitoIdentityProviderClient({ region })
  return _cognito
}
```
(If `getAdminUserById`'s return type does not currently expose `role`, widen the test's mock to the real shape and read `target.role`; the repository's `AdminUserDetail`/row already includes `role` per migration 006 — confirm and use it directly.)

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace admin-api test admin-users-delete`
Expected: PASS (6 tests). Then `yarn typecheck` and `yarn workspace admin-api lint` (or root `yarn lint`).

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/routes/admin-users.ts admin-api/__tests__/routes/admin-users-delete.test.ts
git commit -m "feat(admin-api): DELETE /users/:id with soft and hard delete modes"
```

---

## Task 3: `DELETE /api/admin/users/:userId/github` (standalone disconnect)

**Files:**
- Modify: `admin-api/src/routes/github.ts` (export `deleteConnection` — currently module-private)
- Modify: `admin-api/src/routes/admin-users.ts` (add the route)
- Create (test): `admin-api/__tests__/routes/admin-users-github.test.ts`

**Interfaces:**
- Consumes: `deleteConnection(pool, userId)` (export it), `revokeGitHubInstallationForUser`.
- Produces: `DELETE /api/admin/users/:userId/github` -> `{ ok: true, disconnected: boolean, githubUninstall: RevokeOutcome }`. `disconnected: false` when there was no connection (no-op). `400` bad UUID, `404` user not found.

- [ ] **Step 1: Export `deleteConnection`**

In `admin-api/src/routes/github.ts` line 126, change `async function deleteConnection` to `export async function deleteConnection`. (Self-service caller in the same file is unaffected.)

- [ ] **Step 2: Write the failing test**

`admin-api/__tests__/routes/admin-users-github.test.ts`:
```ts
/** @format */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { Hono } from 'hono'

const revoke = jest.fn<() => Promise<string>>()
const deleteConnection = jest.fn<() => Promise<void>>()
const getAdminUserById = jest.fn<() => Promise<{ role: string } | null>>()
const getPool = jest.fn(() => ({ query: jest.fn(async () => ({ rows: [] })) }))

jest.unstable_mockModule('../../src/lib/github-uninstall.js', () => ({ revokeGitHubInstallationForUser: revoke }))
jest.unstable_mockModule('../../src/routes/github.js', () => ({ deleteConnection, createGithubRouter: jest.fn() }))
jest.unstable_mockModule('../../src/lib/repositories/users.js', () => ({
  getAdminUserById, softDeleteUser: jest.fn(), listUsers: jest.fn(),
  adminUpdateUser: jest.fn(), restoreSoftDeletedUser: jest.fn(),
}))
jest.unstable_mockModule('../../src/lib/pg.js', () => ({ getPool }))

const { createAdminUsersRouter } = await import('../../src/routes/admin-users.js')

const TARGET = '11111111-1111-1111-1111-111111111111'
const cfg = { cognitoUserPoolId: 'pool', awsRegion: 'eu-west-1', githubAppId: 'a', githubPrivateKey: 'k' } as never

function app() {
  const a = new Hono()
  a.use('*', async (c, next) => { c.set('userId', '22222222-2222-2222-2222-222222222222'); await next() })
  a.route('/', createAdminUsersRouter(cfg))
  return a
}

beforeEach(() => { jest.clearAllMocks(); getAdminUserById.mockResolvedValue({ role: 'user' }) })

describe('DELETE /:userId/github', () => {
  it('revokes the App and clears the connection', async () => {
    revoke.mockResolvedValue('revoked')
    const res = await app().request(`/${TARGET}/github`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, disconnected: true, githubUninstall: 'revoked' })
    expect(deleteConnection).toHaveBeenCalledTimes(1)
  })

  it('reports disconnected:false when there was no connection', async () => {
    revoke.mockResolvedValue('not_connected')
    const res = await app().request(`/${TARGET}/github`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, disconnected: false, githubUninstall: 'not_connected' })
  })

  it('404 when the user does not exist', async () => {
    getAdminUserById.mockResolvedValue(null)
    const res = await app().request(`/${TARGET}/github`, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn workspace admin-api test admin-users-github`
Expected: FAIL — 404 (route not defined).

- [ ] **Step 4: Implement the route**

In `admin-api/src/routes/admin-users.ts` add imports:
```ts
import { revokeGitHubInstallationForUser } from '../lib/github-uninstall.js'
import { deleteConnection } from './github.js'
```
Add the route (after the delete route from Task 2):
```ts
router.delete('/:userId/github', async (ctx) => {
  const userId = ctx.req.param('userId')
  if (!UUID_RE.test(userId)) return ctx.json({ error: 'Invalid userId' }, 400)

  const pool = getPool(config)
  const target = await getAdminUserById(pool, userId)
  if (!target) return ctx.json({ error: 'NotFound', userId }, 404)

  const githubUninstall = await revokeGitHubInstallationForUser(
    pool, config.githubAppId, config.githubPrivateKey, userId,
  )
  // Always clear DB rows even if revoke was best-effort 'failed' — the row
  // delete is the user-visible disconnect; orphaned installs are reconciled.
  await deleteConnection(pool, userId)
  const disconnected = githubUninstall !== 'not_connected'
  logger.warn({ event: 'admin_user_github_disconnected', userId, githubUninstall }, 'admin disconnected GitHub')
  return ctx.json({ ok: true, disconnected, githubUninstall })
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn workspace admin-api test admin-users-github`
Expected: PASS (3 tests). Then `yarn typecheck`.

- [ ] **Step 6: Commit**

```bash
git add admin-api/src/routes/github.ts admin-api/src/routes/admin-users.ts admin-api/__tests__/routes/admin-users-github.test.ts
git commit -m "feat(admin-api): DELETE /users/:id/github standalone repo disconnect"
```

---

## Task 4: Server functions (SSR edge)

**Files:**
- Modify: `src/server/admin-users.ts`
- Create (test): `src/server/__tests__/admin-users-delete.test.ts` (Vitest — schema validation only; the handlers are thin forwarders behind `requireAdmin`)

**Interfaces:**
- Produces:
  ```ts
  export const deleteAdminUserSchema: z.ZodType<{ id: string; mode: 'soft' | 'hard'; reason?: string }>
  export const deleteAdminUserFn // POST -> DELETE /users/:id
  export const disconnectAdminUserGithubFn // POST -> DELETE /users/:id/github
  ```

- [ ] **Step 1: Write the failing test**

`src/server/__tests__/admin-users-delete.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { deleteAdminUserSchema } from '../admin-users'

describe('deleteAdminUserSchema', () => {
  it('accepts a soft delete with a reason', () => {
    const r = deleteAdminUserSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111', mode: 'soft', reason: 'spam',
    })
    expect(r.success).toBe(true)
  })
  it('accepts a hard delete with no reason', () => {
    const r = deleteAdminUserSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111', mode: 'hard',
    })
    expect(r.success).toBe(true)
  })
  it('rejects a bad mode', () => {
    const r = deleteAdminUserSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111', mode: 'purge',
    })
    expect(r.success).toBe(false)
  })
  it('rejects a non-uuid id', () => {
    const r = deleteAdminUserSchema.safeParse({ id: 'nope', mode: 'soft' })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/server/__tests__/admin-users-delete.test.ts`
Expected: FAIL — `deleteAdminUserSchema` is not exported.

- [ ] **Step 3: Implement**

Append to `src/server/admin-users.ts`:
```ts
export const deleteAdminUserSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(['soft', 'hard']),
  reason: z.string().max(500).optional(),
})

export const deleteAdminUserFn = createServerFn({ method: 'POST' })
  .inputValidator(deleteAdminUserSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const { id, mode, reason } = data
    return apiFetch<
      | { ok: true; mode: 'soft'; alreadyDeleted: boolean }
      | { ok: true; mode: 'hard'; outcome: { githubUninstall: string; cognitoDeleted: boolean; dbDeleted: boolean } }
    >(`/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      pathTemplate: '/users/:id',
      body: JSON.stringify({ mode, ...(reason ? { reason } : {}) }),
    })
  })

export const disconnectAdminUserGithubFn = createServerFn({ method: 'POST' })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    return apiFetch<{ ok: true; disconnected: boolean; githubUninstall: string }>(
      `/users/${encodeURIComponent(data.id)}/github`,
      { method: 'DELETE', pathTemplate: '/users/:id/github' },
    )
  })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/server/__tests__/admin-users-delete.test.ts`
Expected: PASS (4 tests). Then `yarn typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/server/admin-users.ts src/server/__tests__/admin-users-delete.test.ts
git commit -m "feat(admin): server fns for delete user and disconnect github"
```

---

## Task 5: Query hooks

**Files:**
- Modify: `src/features/admin-users/hooks/use-admin-users.ts`

**Interfaces:**
- Produces: `useDeleteAdminUser()` and `useDisconnectAdminUserGithub()` — TanStack `useMutation`s that invalidate `adminKeys.users.all` on success and `notifyError` on failure (mirrors `useRestoreAdminUser`).

- [ ] **Step 1: Implement (no separate unit test — covered via the UI test in Task 6 and typecheck)**

Add imports + hooks to `use-admin-users.ts`:
```ts
import { deleteAdminUserFn, disconnectAdminUserGithubFn } from '@/server/admin-users'

export function useDeleteAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; mode: 'soft' | 'hard'; reason?: string }) =>
      deleteAdminUserFn({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users.all })
    },
    onError: (err) => notifyError(err),
  })
}

export function useDisconnectAdminUserGithub() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string }) => disconnectAdminUserGithubFn({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users.all })
    },
    onError: (err) => notifyError(err),
  })
}
```

- [ ] **Step 2: Verify + commit**

Run: `yarn typecheck`
```bash
git add src/features/admin-users/hooks/use-admin-users.ts
git commit -m "feat(admin): mutation hooks for delete user and disconnect github"
```

---

## Task 6: UI — Delete modal, Disconnect action, wire into row actions

**Files:**
- Create: `src/features/admin-users/components/DeleteUserModal.tsx`
- Create (test): `src/features/admin-users/components/__tests__/DeleteUserModal.test.tsx` (Vitest + Testing Library)
- Modify: `src/features/admin-users/components/UserRowActions.tsx` (add Delete + Disconnect buttons)
- Modify: `src/features/admin-users/components/AdminUsersList.tsx` (own modal open state, render `DeleteUserModal`, pass handlers) — follow how it already wires `ChangeRolePlanModal`/view/restore.

**Interfaces:**
- Consumes: `useDeleteAdminUser`, `useDisconnectAdminUserGithub` (Task 5); `AdminUserSummary`.
- Produces: `DeleteUserModal({ user, open, onClose })`. Soft/hard radio (`mode` state). Hard requires typing `user.email` exactly to enable the destructive confirm. Soft shows an optional reason input. Disconnect is a simpler confirm — reuse `DeleteUserModal` with a `variant: 'disconnect'` prop OR a separate confirm; this plan uses one component with a `variant` discriminator to avoid duplication.

The component must avoid nested ternaries (S3358) and keep each function under complexity 10 — split the soft body, hard body, and disconnect body into small render helpers or separate `{cond && ...}` blocks.

- [ ] **Step 1: Write the failing test**

`src/features/admin-users/components/__tests__/DeleteUserModal.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const deleteMutate = vi.fn()
const disconnectMutate = vi.fn()
vi.mock('../../hooks/use-admin-users', () => ({
  useDeleteAdminUser: () => ({ mutate: deleteMutate, isPending: false }),
  useDisconnectAdminUserGithub: () => ({ mutate: disconnectMutate, isPending: false }),
}))

import { DeleteUserModal } from '../DeleteUserModal'

const user = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'jo@example.com', fullName: 'Jo', role: 'user', plan: 'free',
  subscriptionStatus: null, trialEndsAt: null, deletedAt: null, createdAt: '2026-01-01',
} as never

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => { deleteMutate.mockClear(); disconnectMutate.mockClear() })

describe('DeleteUserModal (delete variant)', () => {
  it('keeps hard-delete confirm disabled until the email is typed', () => {
    wrap(<DeleteUserModal variant="delete" user={user} open onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText(/permanently/i)) // pick hard mode
    const confirm = screen.getByRole('button', { name: /delete account/i })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/type the email/i), { target: { value: 'jo@example.com' } })
    expect(confirm).toBeEnabled()
  })

  it('soft-deletes with the reason on confirm', () => {
    wrap(<DeleteUserModal variant="delete" user={user} open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'spam' } })
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    expect(deleteMutate).toHaveBeenCalledWith(
      { id: user.id, mode: 'soft', reason: 'spam' },
      expect.anything(),
    )
  })
})

describe('DeleteUserModal (disconnect variant)', () => {
  it('disconnects github on confirm', () => {
    wrap(<DeleteUserModal variant="disconnect" user={user} open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))
    expect(disconnectMutate).toHaveBeenCalledWith({ id: user.id }, expect.anything())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/features/admin-users/components/__tests__/DeleteUserModal.test.tsx`
Expected: FAIL — cannot find `../DeleteUserModal`.

- [ ] **Step 3: Implement `DeleteUserModal`**

`src/features/admin-users/components/DeleteUserModal.tsx` (mirror `ChangeRolePlanModal`'s Headless UI structure; `rounded-md`; light + dark; UK copy; product name "Tucaken"; no nested ternaries):
```tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop } from '@headlessui/react'
import { AlertTriangle } from 'lucide-react'
import { useDeleteAdminUser, useDisconnectAdminUserGithub } from '../hooks/use-admin-users'
import type { AdminUserSummary } from '../types'

type Variant = 'delete' | 'disconnect'

interface Props {
  readonly user: AdminUserSummary
  readonly variant: Variant
  readonly open: boolean
  readonly onClose: () => void
}

const DESTRUCTIVE_BTN =
  'rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50'
const CANCEL_BTN =
  'rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10'

function DisconnectBody({ user, onClose }: { user: AdminUserSummary; onClose: () => void }) {
  const { mutate, isPending } = useDisconnectAdminUserGithub()
  const handle = () => mutate({ id: user.id }, { onSuccess: () => onClose() })
  return (
    <>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        Remove the GitHub repository connection for {user.email}? Their connected repositories will be
        unlinked from Tucaken. The account itself is not deleted.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
        <button type="button" disabled={isPending} onClick={handle} className={DESTRUCTIVE_BTN}>
          {isPending ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
    </>
  )
}

function DeleteBody({ user, onClose }: { user: AdminUserSummary; onClose: () => void }) {
  const [mode, setMode] = useState<'soft' | 'hard'>('soft')
  const [reason, setReason] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const { mutate, isPending } = useDeleteAdminUser()

  const hardLocked = mode === 'hard' && confirmEmail !== user.email
  const handle = () => {
    const vars = mode === 'soft'
      ? { id: user.id, mode, reason: reason || undefined }
      : { id: user.id, mode }
    mutate(vars, { onSuccess: () => onClose() })
  }

  return (
    <>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
      <fieldset className="mt-4 space-y-2">
        <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input type="radio" name="mode" checked={mode === 'soft'} onChange={() => setMode('soft')} className="mt-1" />
          <span>Soft delete — 30-day grace window, restorable. Login is disabled immediately.</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input type="radio" name="mode" checked={mode === 'hard'} onChange={() => setMode('hard')} className="mt-1" aria-label="Permanently delete now" />
          <span>Permanently delete now — irreversible. Purges the account and revokes GitHub.</span>
        </label>
      </fieldset>

      {mode === 'soft' && (
        <label className="mt-4 block text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Reason (optional)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-800"
          />
        </label>
      )}

      {mode === 'hard' && (
        <div className="mt-4 space-y-2">
          <div className="flex items-start gap-2 rounded-md border border-red-600/20 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>This permanently deletes the account and cannot be undone.</span>
          </div>
          <label className="block text-sm">
            <span className="text-zinc-600 dark:text-zinc-300">Type the email to confirm</span>
            <input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-800"
            />
          </label>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
        <button type="button" disabled={isPending || hardLocked} onClick={handle} className={DESTRUCTIVE_BTN}>
          {isPending ? 'Deleting...' : 'Delete account'}
        </button>
      </div>
    </>
  )
}

export function DeleteUserModal({ user, variant, open, onClose }: Props) {
  const title = variant === 'disconnect' ? 'Disconnect GitHub' : 'Delete account'
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm dark:bg-zinc-900/60" />
      <div className="fixed inset-0 z-10 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</DialogTitle>
          {variant === 'disconnect' && <DisconnectBody user={user} onClose={onClose} />}
          {variant === 'delete' && <DeleteBody user={user} onClose={onClose} />}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/features/admin-users/components/__tests__/DeleteUserModal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire buttons into `UserRowActions` and the list**

In `UserRowActions.tsx`, extend `Props` with `onDelete: () => void` and `onDisconnect: () => void`, and add two buttons (icons `Trash2` and `Unplug` from lucide-react) using the existing `BTN` class. Keep the existing view/edit/restore buttons. Example additions:
```tsx
<button type="button" aria-label="Disconnect GitHub" title="Disconnect GitHub" className={BTN} onClick={onDisconnect}>
  <Unplug className="size-4" />
</button>
<button type="button" aria-label="Delete user" title="Delete user" className={`${BTN} hover:text-red-600`} onClick={onDelete}>
  <Trash2 className="size-4" />
</button>
```
In `AdminUsersList.tsx`, add state mirroring the existing modal wiring:
```tsx
const [deleteUser, setDeleteUser] = useState<AdminUserSummary | null>(null)
const [disconnectUser, setDisconnectUser] = useState<AdminUserSummary | null>(null)
```
pass `onDelete={() => setDeleteUser(user)}` and `onDisconnect={() => setDisconnectUser(user)}` into `UserRowActions`, and render:
```tsx
{deleteUser && (
  <DeleteUserModal variant="delete" user={deleteUser} open onClose={() => setDeleteUser(null)} />
)}
{disconnectUser && (
  <DeleteUserModal variant="disconnect" user={disconnectUser} open onClose={() => setDisconnectUser(null)} />
)}
```
(Read `AdminUsersList.tsx` first to match its exact prop-passing and import style.)

- [ ] **Step 6: Verify the whole feature**

Run: `yarn typecheck && yarn lint && yarn test`
Then UI smoke: `yarn dev`, open `/admin/users` as an admin, exercise: soft delete (row shows restore after), hard delete (email-gated confirm), disconnect GitHub. Verify both light + dark.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin-users/components/DeleteUserModal.tsx src/features/admin-users/components/__tests__/DeleteUserModal.test.tsx src/features/admin-users/components/UserRowActions.tsx src/features/admin-users/components/AdminUsersList.tsx
git commit -m "feat(admin): delete user + disconnect github controls in Users view"
```

---

## Task 7: Full verification + finish

- [ ] **Step 1: Run the whole gate across both workspaces**

```bash
yarn typecheck
yarn lint
yarn test
yarn workspace admin-api test
```
Expected: all green.

- [ ] **Step 2: Re-confirm the sweep dry-run path still compiles/runs**

Run: `GRACE_DAYS=0 yarn dlx tsx admin-api/src/scripts/account-sweep.ts --dry-run`
Expected: prints dry-run lines + summary (or a clean DB-connection error if no local PG).

- [ ] **Step 3: Hand off**

Use `superpowers:finishing-a-development-branch` to choose merge / PR / cleanup. PR body in impact-bullet form (see `impact-commits` skill); UK English; no `Co-Authored-By` trailer.

---

## Self-Review

**Spec coverage:**
- Goal 1 (admin delete, soft + hard) -> Tasks 1, 2, 4, 6. ✔
- Goal 2 (standalone disconnect) -> Tasks 3, 4, 5, 6. ✔
- Goal 3 (reuse, single purge ordering) -> Task 1 `purgeUser`. ✔
- Spec Decision 1 (shared helper + sweep refactor + dry-run verify) -> Task 1. ✔
- Spec Decision 2 (two endpoints, guards: self, admin-target; partial-failure reporting; idempotent disconnect) -> Tasks 2, 3. ✔
- Spec Decision 3 (server fns) -> Task 4. ✔
- Spec Decision 4 (UI: soft/hard radio, reason, type-email confirm, disconnect confirm, query invalidation, rounded-md, light/dark) -> Task 6. ✔
- Testing section -> Jest endpoint tests (Tasks 1-3), Vitest schema + component tests (Tasks 4, 6). ✔

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✔

**Type consistency:** `purgeUser(deps, userId, cognitoSub)` / `PurgeOutcome { githubUninstall, cognitoDeleted, dbDeleted }` consistent across Tasks 1, 2, 4. `deleteAdminUserFn` body `{ mode, reason? }` matches the endpoint Zod `DeleteBody`. `RevokeOutcome` values consistent. `DeleteUserModal({ user, variant, open, onClose })` consistent between Task 6 implementation, test, and list wiring. ✔

**Known correction folded in:** the existing sweep deleted Cognito by `user.id` (UUID), but `adminDeleteUser` expects the Cognito `sub`. Task 1 Step 5 fixes this by sourcing `cognito_sub` from `user_identities`. Flag for reviewer attention.
