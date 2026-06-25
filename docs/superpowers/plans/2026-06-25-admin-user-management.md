# Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only Users feature to the dashboard that lists all users across tiers (Free/Pro/Premium) with view-detail, restore-deleted, and change-role/plan actions, mirroring the Job Applications list UI.

**Architecture:** A new admin-api repository layer + Hono routes (already gated by `requireAdminGroup()`) expose list/detail/update over the `users` table, bypassing RLS by querying the superuser pool directly. The frontend mirrors the `applications` feature slice: `createServerFn` (guarded by `requireAdmin()`) → `useQuery` hooks → a grid-table list with a tier dropdown, ⌘K search, pagination, and row-action modals.

**Tech Stack:** TanStack Start/Router/Query, React 19, Zustand, Zod, Hono (admin-api), `pg`. Frontend tests = **Vitest**; admin-api tests = **Jest** (`@jest/globals`, `jest.unstable_mockModule`).

## Global Constraints

- Package manager: **Yarn 4 only**. Run scripts with `yarn <script>`; never npm/npx.
- Before any task is "done": `yarn typecheck && yarn lint` (and the task's tests). Lint must be zero errors; cyclomatic complexity cap = 10.
- SonarCloud rules (all mandatory): no nested ternaries (`S3358`) — use early returns/helpers; no redundant casts / `as any` (`S4325`); `Set.has()` for membership allow-lists (`S7776`); `Number.parseInt`/`Number.isNaN` (`S7773`); stable React keys = DB id, never index (`S6479`); `crypto.randomUUID()` not `Math.random()` (`S2245`); no `console.*` in app code (use Pino `src/lib/observability`); optional chaining over `&&` (`S6582`).
- All SQL parameterised (`$1`, `$2`) — no string concatenation. RLS exception: admin list/detail/update query `getPool(config)` directly (NOT `withUser`).
- Every server boundary validates input with Zod. Client errors never leak stack traces/internal IDs.
- New route is **directory-based** (`src/app/_dashboard/admin/users/route.tsx`). No new flat-file routes.
- Default corner radius `rounded-md`. Every component renders in light + dark mode.
- Prose/copy in English (UK), no diacritics. Product name "Tucaken", never "agent".
- Commits follow the `git-commit` skill; **never** include a `Co-Authored-By` trailer.
- `plan` is Stripe-owned: an admin plan override is a manual escape hatch written with `plan_events.reason = 'admin_manual_override'`; the UI warns it may be reverted by Stripe. `role` is RDS-owned and freely mutable. No Stripe API calls in v1.

---

## Phase A — admin-api backend (Jest)

All files under `admin-api/`. The router `createAdminUsersRouter` is already mounted at `/api/admin/users` and the whole prefix is behind `requireAdminGroup()` (see `admin-api/src/index.ts:179`), so new routes inherit the admin gate. Repo functions take `Queryable = Pick<Pool,'query'>` and are unit-tested with inline fake pools.

### Task 1: `listUsers` repository function

**Files:**
- Modify: `admin-api/src/lib/repositories/users.ts` (add export at end)
- Test: `admin-api/src/lib/repositories/list-users.test.ts` (create)

**Interfaces:**
- Produces: `listUsers(pool: Queryable, opts: { tier: 'all'|'free'|'pro'|'premium'; limit: number; offset: number }): Promise<{ rows: AdminUserRow[]; total: number }>` and exported type `AdminUserRow`.

- [ ] **Step 1: Write the failing test**

```ts
// admin-api/src/lib/repositories/list-users.test.ts
import { jest } from '@jest/globals';
import { listUsers } from './users.js';

function poolReturning(...results: Array<{ rows: unknown[] }>) {
  const query = jest.fn<() => Promise<{ rows: unknown[] }>>();
  for (const r of results) query.mockResolvedValueOnce(r);
  return { query } as unknown as Pick<import('pg').Pool, 'query'>;
}

describe('listUsers', () => {
  it('returns rows + total and passes tier filter as a parameter', async () => {
    const pool = poolReturning(
      { rows: [{ total: '2' }] },
      {
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            email: 'a@x.com', full_name: 'A', role: 'user', plan: 'pro',
            subscription_status: 'active', trial_ends_at: null,
            deleted_at: null, created_at: new Date('2026-01-01T00:00:00Z'),
          },
        ],
      },
    );
    const result = await listUsers(pool, { tier: 'pro', limit: 50, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ email: 'a@x.com', plan: 'pro', role: 'user' });
  });

  it('omits the plan filter when tier is "all"', async () => {
    const query = jest.fn<() => Promise<{ rows: unknown[] }>>()
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = { query } as unknown as Pick<import('pg').Pool, 'query'>;
    await listUsers(pool, { tier: 'all', limit: 10, offset: 0 });
    // count query (1st call) carries no plan parameter
    const countParams = query.mock.calls[0][1] as unknown[];
    expect(countParams).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test list-users`
Expected: FAIL — `listUsers` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `admin-api/src/lib/repositories/users.ts`:

```ts
export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: 'user' | 'admin';
  plan: 'free' | 'pro' | 'premium';
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

const ADMIN_TIERS = new Set(['free', 'pro', 'premium']);

/**
 * Admin-only list of all users. MUST run on the superuser pool (NOT withUser)
 * so RLS does not restrict the result to a single row.
 */
export async function listUsers(
  pool: Pick<import('pg').Pool, 'query'>,
  opts: { tier: 'all' | 'free' | 'pro' | 'premium'; limit: number; offset: number },
): Promise<{ rows: AdminUserRow[]; total: number }> {
  const hasTier = opts.tier !== 'all' && ADMIN_TIERS.has(opts.tier);
  const where = hasTier ? 'WHERE plan = $1' : '';
  const countParams = hasTier ? [opts.tier] : [];

  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM users ${where}`,
    countParams,
  );
  const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);

  const limitIdx = hasTier ? '$2' : '$1';
  const offsetIdx = hasTier ? '$3' : '$2';
  const listParams = hasTier
    ? [opts.tier, opts.limit, opts.offset]
    : [opts.limit, opts.offset];

  const result = await pool.query<{
    id: string; email: string; full_name: string | null;
    role: string; plan: string; subscription_status: string | null;
    trial_ends_at: Date | null; deleted_at: Date | null; created_at: Date;
  }>(
    `SELECT id, email, full_name, role, plan, subscription_status,
            trial_ends_at, deleted_at, created_at
       FROM users
       ${where}
      ORDER BY created_at DESC
      LIMIT ${limitIdx} OFFSET ${offsetIdx}`,
    listParams,
  );

  const rows: AdminUserRow[] = result.rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    role: r.role === 'admin' ? 'admin' : 'user',
    plan: toPlan(r.plan),
    subscriptionStatus: r.subscription_status,
    trialEndsAt: r.trial_ends_at ? r.trial_ends_at.toISOString() : null,
    deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  }));
  return { rows, total };
}

function toPlan(value: string): 'free' | 'pro' | 'premium' {
  if (value === 'pro') return 'pro';
  if (value === 'premium') return 'premium';
  return 'free';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace admin-api test list-users`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/lib/repositories/users.ts admin-api/src/lib/repositories/list-users.test.ts
git commit -m "feat(admin-api): add listUsers repository function for admin user list"
```

---

### Task 2: `getAdminUserById` repository function

**Files:**
- Modify: `admin-api/src/lib/repositories/users.ts`
- Test: `admin-api/src/lib/repositories/get-admin-user.test.ts` (create)

**Interfaces:**
- Consumes: `AdminUserRow` (Task 1).
- Produces: `getAdminUserById(pool: Queryable, id: string): Promise<AdminUserDetailRow | null>` and exported type `AdminUserDetailRow` (extends `AdminUserRow` with Stripe + quota fields).

- [ ] **Step 1: Write the failing test**

```ts
// admin-api/src/lib/repositories/get-admin-user.test.ts
import { jest } from '@jest/globals';
import { getAdminUserById } from './users.js';

function poolReturning(...results: Array<{ rows: unknown[] }>) {
  const query = jest.fn<() => Promise<{ rows: unknown[] }>>();
  for (const r of results) query.mockResolvedValueOnce(r);
  return { query } as unknown as Pick<import('pg').Pool, 'query'>;
}

describe('getAdminUserById', () => {
  it('returns null when the user row is absent', async () => {
    const pool = poolReturning({ rows: [] });
    expect(await getAdminUserById(pool, 'missing')).toBeNull();
  });

  it('maps user row + quotas into AdminUserDetailRow', async () => {
    const pool = poolReturning(
      {
        rows: [{
          id: 'u1', email: 'a@x.com', full_name: 'A', role: 'admin', plan: 'premium',
          subscription_status: 'active', trial_ends_at: null, deleted_at: null,
          created_at: new Date('2026-01-01T00:00:00Z'),
          stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
          current_period_end: new Date('2026-02-01T00:00:00Z'), cancel_at_period_end: false,
        }],
      },
      { rows: [{ feature: 'resume_generations', period_month: '2026-06', count: 3 }] },
    );
    const detail = await getAdminUserById(pool, 'u1');
    expect(detail).not.toBeNull();
    expect(detail!.stripeCustomerId).toBe('cus_1');
    expect(detail!.quotas).toHaveLength(1);
    expect(detail!.quotas[0]).toMatchObject({ feature: 'resume_generations', count: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test get-admin-user`
Expected: FAIL — `getAdminUserById` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `admin-api/src/lib/repositories/users.ts`:

```ts
export interface AdminUserDetailRow extends AdminUserRow {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  quotas: { feature: string; periodMonth: string; count: number }[];
}

export async function getAdminUserById(
  pool: Pick<import('pg').Pool, 'query'>,
  id: string,
): Promise<AdminUserDetailRow | null> {
  const userResult = await pool.query<{
    id: string; email: string; full_name: string | null; role: string; plan: string;
    subscription_status: string | null; trial_ends_at: Date | null; deleted_at: Date | null;
    created_at: Date; stripe_customer_id: string | null; stripe_subscription_id: string | null;
    current_period_end: Date | null; cancel_at_period_end: boolean;
  }>(
    `SELECT id, email, full_name, role, plan, subscription_status, trial_ends_at,
            deleted_at, created_at, stripe_customer_id, stripe_subscription_id,
            current_period_end, cancel_at_period_end
       FROM users WHERE id = $1`,
    [id],
  );
  const u = userResult.rows[0];
  if (!u) return null;

  const quotaResult = await pool.query<{ feature: string; period_month: string; count: number }>(
    `SELECT feature, period_month, count
       FROM usage_quotas WHERE user_id = $1
      ORDER BY period_month DESC, feature ASC`,
    [id],
  );

  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    role: u.role === 'admin' ? 'admin' : 'user',
    plan: toPlan(u.plan),
    subscriptionStatus: u.subscription_status,
    trialEndsAt: u.trial_ends_at ? u.trial_ends_at.toISOString() : null,
    deletedAt: u.deleted_at ? u.deleted_at.toISOString() : null,
    createdAt: u.created_at.toISOString(),
    stripeCustomerId: u.stripe_customer_id,
    stripeSubscriptionId: u.stripe_subscription_id,
    currentPeriodEnd: u.current_period_end ? u.current_period_end.toISOString() : null,
    cancelAtPeriodEnd: u.cancel_at_period_end,
    quotas: quotaResult.rows.map((q) => ({
      feature: q.feature, periodMonth: q.period_month, count: Number(q.count),
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace admin-api test get-admin-user`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/lib/repositories/users.ts admin-api/src/lib/repositories/get-admin-user.test.ts
git commit -m "feat(admin-api): add getAdminUserById repository function with quotas"
```

---

### Task 3: `adminUpdateUser` repository function (role/plan + audit)

**Files:**
- Modify: `admin-api/src/lib/repositories/users.ts`
- Test: `admin-api/src/lib/repositories/admin-update-user.test.ts` (create)

**Interfaces:**
- Produces: `adminUpdateUser(client: PoolClient, id: string, patch: { role?: 'user'|'admin'; plan?: 'free'|'pro'|'premium' }): Promise<boolean>`. Writes a `plan_events` row when `plan` changes (`reason='admin_manual_override'`) and when `role` changes (`event_type='admin_role_change'`). Runs inside a transaction (caller passes a `PoolClient` already in `BEGIN`).

- [ ] **Step 1: Write the failing test**

```ts
// admin-api/src/lib/repositories/admin-update-user.test.ts
import { jest } from '@jest/globals';
import { adminUpdateUser } from './users.js';

function fakeClient() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    // first SELECT returns the current row
    if (sql.includes('SELECT plan, role')) {
      return { rows: [{ plan: 'free', role: 'user' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  return { client: { query } as unknown as import('pg').PoolClient, calls };
}

describe('adminUpdateUser', () => {
  it('updates plan and writes an admin_manual_override plan_events row', async () => {
    const { client, calls } = fakeClient();
    const ok = await adminUpdateUser(client, 'u1', { plan: 'pro' });
    expect(ok).toBe(true);
    const eventInsert = calls.find((c) => c.sql.includes('INTO plan_events'));
    expect(eventInsert).toBeDefined();
    expect(eventInsert!.params).toContain('admin_manual_override');
  });

  it('returns false and writes nothing when patch is empty', async () => {
    const { client, calls } = fakeClient();
    const ok = await adminUpdateUser(client, 'u1', {});
    expect(ok).toBe(false);
    expect(calls.some((c) => c.sql.includes('UPDATE users'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test admin-update-user`
Expected: FAIL — `adminUpdateUser` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `admin-api/src/lib/repositories/users.ts`:

```ts
export async function adminUpdateUser(
  client: import('pg').PoolClient,
  id: string,
  patch: { role?: 'user' | 'admin'; plan?: 'free' | 'pro' | 'premium' },
): Promise<boolean> {
  const wantsRole = patch.role !== undefined;
  const wantsPlan = patch.plan !== undefined;
  if (!wantsRole && !wantsPlan) return false;

  const current = await client.query<{ plan: string; role: string }>(
    `SELECT plan, role FROM users WHERE id = $1`,
    [id],
  );
  const before = current.rows[0];
  if (!before) return false;

  if (wantsRole && patch.role !== before.role) {
    await client.query(`UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1`, [id, patch.role]);
    await client.query(
      `INSERT INTO plan_events (user_id, event_type, from_plan, to_plan, reason)
       VALUES ($1, 'admin_role_change', $2, $3, $4)`,
      [id, before.role, patch.role, `admin set role ${before.role} -> ${patch.role}`],
    );
  }

  if (wantsPlan && patch.plan !== before.plan) {
    await client.query(`UPDATE users SET plan = $2, updated_at = NOW() WHERE id = $1`, [id, patch.plan]);
    await client.query(
      `INSERT INTO plan_events (user_id, event_type, from_plan, to_plan, reason)
       VALUES ($1, 'admin_manual_override', $2, $3, 'admin_manual_override')`,
      [id, before.plan, patch.plan],
    );
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace admin-api test admin-update-user`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/lib/repositories/users.ts admin-api/src/lib/repositories/admin-update-user.test.ts
git commit -m "feat(admin-api): add adminUpdateUser with plan_events audit"
```

---

### Task 4: GET `/api/admin/users` list route + GET `/:id` detail route

**Files:**
- Modify: `admin-api/src/routes/admin-users.ts`
- Test: `admin-api/src/routes/admin-users.list.test.ts` (create)

**Interfaces:**
- Consumes: `listUsers`, `getAdminUserById` (Tasks 1-2), `getPool` (`admin-api/src/lib/pg.ts`).
- Produces: `GET /api/admin/users?tier=&limit=&offset=` → `{ users: AdminUserRow[]; total: number }`; `GET /api/admin/users/:userId` → `{ user: AdminUserDetailRow }` or 404.

- [ ] **Step 1: Write the failing test**

```ts
// admin-api/src/routes/admin-users.list.test.ts
import { jest } from '@jest/globals';

const listUsersMock = jest.fn();
const getAdminUserByIdMock = jest.fn();
jest.unstable_mockModule('../lib/repositories/users.js', () => ({
  listUsers: listUsersMock,
  getAdminUserById: getAdminUserByIdMock,
  restoreSoftDeletedUser: jest.fn(),
}));
jest.unstable_mockModule('../lib/pg.js', () => ({ getPool: () => ({}) }));

const { createAdminUsersRouter } = await import('./admin-users.js');

const CONFIG = { /* minimal AdminApiConfig stub */ } as never;

describe('GET /api/admin/users', () => {
  it('returns 400 for an invalid tier', async () => {
    const app = createAdminUsersRouter(CONFIG);
    const res = await app.request('/?tier=gold');
    expect(res.status).toBe(400);
  });

  it('returns users + total for a valid request', async () => {
    listUsersMock.mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'a@x.com' }], total: 1 });
    const app = createAdminUsersRouter(CONFIG);
    const res = await app.request('/?tier=pro');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.users).toHaveLength(1);
  });

  it('returns 404 when detail user is missing', async () => {
    getAdminUserByIdMock.mockResolvedValueOnce(null);
    const app = createAdminUsersRouter(CONFIG);
    const res = await app.request('/11111111-1111-1111-1111-111111111111');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test admin-users.list`
Expected: FAIL — routes not defined (404 on `/?tier=pro`).

- [ ] **Step 3: Write minimal implementation**

In `admin-api/src/routes/admin-users.ts`, add Zod + imports at top and register the two routes inside `createAdminUsersRouter` before `return router`:

```ts
import { z } from 'zod';
import { listUsers, getAdminUserById, restoreSoftDeletedUser } from '../lib/repositories/users.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ListQuery = z.object({
  tier: z.enum(['all', 'free', 'pro', 'premium']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/admin/users
router.get('/', async (ctx) => {
  const parsed = ListQuery.safeParse({
    tier: ctx.req.query('tier'),
    limit: ctx.req.query('limit'),
    offset: ctx.req.query('offset'),
  });
  if (!parsed.success) {
    return ctx.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }
  const { rows, total } = await listUsers(getPool(config), parsed.data);
  return ctx.json({ users: rows, total });
});

// GET /api/admin/users/:userId
router.get('/:userId', async (ctx) => {
  const userId = ctx.req.param('userId');
  if (!UUID_RE.test(userId)) return ctx.json({ error: 'Invalid userId' }, 400);
  const user = await getAdminUserById(getPool(config), userId);
  if (!user) return ctx.json({ error: 'NotFound', userId }, 404);
  return ctx.json({ user });
});
```

(Remove the now-duplicate `restoreSoftDeletedUser` import if the file already imports it — keep a single import line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace admin-api test admin-users.list`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/routes/admin-users.ts admin-api/src/routes/admin-users.list.test.ts
git commit -m "feat(admin-api): add GET users list + detail admin routes"
```

---

### Task 5: PATCH `/api/admin/users/:id` (role/plan update)

**Files:**
- Modify: `admin-api/src/routes/admin-users.ts`
- Test: `admin-api/src/routes/admin-users.patch.test.ts` (create)

**Interfaces:**
- Consumes: `adminUpdateUser` (Task 3), `withTransaction`/`getPool`. Use a `PoolClient` from `getPool(config).connect()` wrapped in BEGIN/COMMIT (the repo fn does not open its own transaction).
- Produces: `PATCH /api/admin/users/:userId` body `{ role?, plan? }` → `{ ok: true, updated: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
// admin-api/src/routes/admin-users.patch.test.ts
import { jest } from '@jest/globals';

const adminUpdateUserMock = jest.fn();
jest.unstable_mockModule('../lib/repositories/users.js', () => ({
  listUsers: jest.fn(), getAdminUserById: jest.fn(),
  restoreSoftDeletedUser: jest.fn(), adminUpdateUser: adminUpdateUserMock,
}));
const connectMock = jest.fn(async () => ({
  query: jest.fn(async () => ({ rows: [], rowCount: 1 })),
  release: jest.fn(),
}));
jest.unstable_mockModule('../lib/pg.js', () => ({ getPool: () => ({ connect: connectMock }) }));

const { createAdminUsersRouter } = await import('./admin-users.js');
const CONFIG = {} as never;

describe('PATCH /api/admin/users/:userId', () => {
  it('rejects an invalid plan value with 400', async () => {
    const app = createAdminUsersRouter(CONFIG);
    const res = await app.request('/11111111-1111-1111-1111-111111111111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'gold' }),
    });
    expect(res.status).toBe(400);
  });

  it('applies a valid role change', async () => {
    adminUpdateUserMock.mockResolvedValueOnce(true);
    const app = createAdminUsersRouter(CONFIG);
    const res = await app.request('/11111111-1111-1111-1111-111111111111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace admin-api test admin-users.patch`
Expected: FAIL — PATCH route not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `createAdminUsersRouter` (and add `adminUpdateUser` to the existing repo import):

```ts
const UpdateBody = z.object({
  role: z.enum(['user', 'admin']).optional(),
  plan: z.enum(['free', 'pro', 'premium']).optional(),
}).refine((b) => b.role !== undefined || b.plan !== undefined, {
  message: 'At least one of role or plan is required',
});

router.patch('/:userId', async (ctx) => {
  const userId = ctx.req.param('userId');
  if (!UUID_RE.test(userId)) return ctx.json({ error: 'Invalid userId' }, 400);

  let raw: unknown;
  try { raw = await ctx.req.json(); } catch { return ctx.json({ error: 'Invalid JSON body' }, 400); }
  const parsed = UpdateBody.safeParse(raw);
  if (!parsed.success) return ctx.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);

  const pool = getPool(config);
  const client = await pool.connect();
  let updated = false;
  try {
    await client.query('BEGIN');
    updated = await adminUpdateUser(client, userId, parsed.data);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  logger.warn({ event: 'admin_user_updated', userId, patch: parsed.data, updated }, 'admin updated user');
  return ctx.json({ ok: true, updated });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace admin-api test admin-users.patch`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/routes/admin-users.ts admin-api/src/routes/admin-users.patch.test.ts
git commit -m "feat(admin-api): add PATCH admin user route for role/plan override"
```

---

## Phase B — frontend feature slice (Vitest)

All files under `src/`. Server fns guard with `requireAdmin()` (already exists in `src/server/auth-guard.ts`) and call `apiFetch` (default `apiPrefix='/api/admin'`).

### Task 6: Feature types + tier constants

**Files:**
- Create: `src/features/admin-users/types.ts`
- Create: `src/features/admin-users/components/AdminUserTypes.ts`

**Interfaces:**
- Produces: `AdminUserSummary`, `AdminUserDetail`, `UserTier`, `TIER_FILTER_OPTIONS`, `PLAN_COLOURS`, `PLAN_LABELS`, `ROLE_COLOURS`.

- [ ] **Step 1: Create `src/features/admin-users/types.ts`**

```ts
export type UserTier = 'free' | 'pro' | 'premium'
export type UserRole = 'user' | 'admin'

export interface AdminUserSummary {
  readonly id: string
  readonly email: string
  readonly fullName: string | null
  readonly role: UserRole
  readonly plan: UserTier
  readonly subscriptionStatus: string | null
  readonly trialEndsAt: string | null
  readonly deletedAt: string | null
  readonly createdAt: string
}

export interface UserQuota {
  readonly feature: string
  readonly periodMonth: string
  readonly count: number
}

export interface AdminUserDetail extends AdminUserSummary {
  readonly stripeCustomerId: string | null
  readonly stripeSubscriptionId: string | null
  readonly currentPeriodEnd: string | null
  readonly cancelAtPeriodEnd: boolean
  readonly quotas: readonly UserQuota[]
}
```

- [ ] **Step 2: Create `src/features/admin-users/components/AdminUserTypes.ts`**

```ts
import type { UserTier, UserRole } from '../types'

export const TIER_FILTER_OPTIONS: readonly { value: UserTier | 'all'; label: string }[] = [
  { value: 'all', label: 'All Users' },
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'premium', label: 'Premium' },
]

export const PLAN_LABELS: Record<UserTier, string> = {
  free: 'Free',
  pro: 'Pro',
  premium: 'Premium',
}

export const PLAN_COLOURS: Record<UserTier, string> = {
  free: 'bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/30',
  pro: 'bg-violet-50 text-violet-700 border-violet-600/20 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
  premium: 'bg-amber-50 text-amber-800 border-amber-600/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
}

export const ROLE_COLOURS: Record<UserRole, string> = {
  user: 'bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/30',
  admin: 'bg-teal-50 text-teal-700 border-teal-600/20 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/30',
}
```

- [ ] **Step 3: Verify typecheck**

Run: `yarn typecheck`
Expected: PASS (no usages yet, just declarations).

- [ ] **Step 4: Commit**

```bash
git add src/features/admin-users/types.ts src/features/admin-users/components/AdminUserTypes.ts
git commit -m "feat(admin-users): add feature types and tier constants"
```

---

### Task 7: Server functions

**Files:**
- Create: `src/server/admin-users.ts`
- Test: `src/server/__tests__/admin-users.test.ts`

**Interfaces:**
- Consumes: `AdminUserSummary`, `AdminUserDetail` (Task 6); `requireAdmin` (`./auth-guard`); `apiFetch` (`./_api-client`).
- Produces: `listAdminUsersFn`, `getAdminUserFn`, `updateAdminUserFn`, `restoreAdminUserFn`.

- [ ] **Step 1: Write the failing test (Zod schema validation)**

```ts
// src/server/__tests__/admin-users.test.ts
import { describe, it, expect } from 'vitest'
import { listAdminUsersSchema, updateAdminUserSchema } from '../admin-users'

describe('admin-users server fn schemas', () => {
  it('defaults tier to "all"', () => {
    expect(listAdminUsersSchema.parse({}).tier).toBe('all')
  })
  it('rejects an unknown tier', () => {
    expect(listAdminUsersSchema.safeParse({ tier: 'gold' }).success).toBe(false)
  })
  it('requires at least one of role/plan on update', () => {
    expect(updateAdminUserSchema.safeParse({ id: 'x' }).success).toBe(false)
    expect(updateAdminUserSchema.safeParse({ id: 'x', role: 'admin' }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test admin-users`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Create `src/server/admin-users.ts`**

```ts
/**
 * @format
 * Admin-only user management server functions.
 *
 * Every handler calls requireAdmin() — a fast-path Cognito `admin` group check
 * at the SSR edge — before forwarding to the admin-api BFF, which re-verifies
 * the JWT and re-checks the admin group. The UI is never the access control.
 */
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { AdminUserSummary, AdminUserDetail } from '@/features/admin-users/types'
import { requireAdmin } from './auth-guard'
import { apiFetch } from './_api-client'

export const listAdminUsersSchema = z
  .object({ tier: z.enum(['all', 'free', 'pro', 'premium']).default('all') })
  .default({ tier: 'all' })

const idSchema = z.object({ id: z.string().uuid() })

export const updateAdminUserSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(['user', 'admin']).optional(),
    plan: z.enum(['free', 'pro', 'premium']).optional(),
  })
  .refine((b) => b.role !== undefined || b.plan !== undefined, {
    message: 'At least one of role or plan is required',
  })

export const listAdminUsersFn = createServerFn({ method: 'GET' })
  .inputValidator(listAdminUsersSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const qs = data.tier !== 'all' ? `?tier=${encodeURIComponent(data.tier)}` : ''
    const body = await apiFetch<{ users: AdminUserSummary[]; total: number }>(
      `/users${qs}`,
      { pathTemplate: '/users' },
    )
    return body.users
  })

export const getAdminUserFn = createServerFn({ method: 'GET' })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const body = await apiFetch<{ user: AdminUserDetail }>(
      `/users/${encodeURIComponent(data.id)}`,
      { pathTemplate: '/users/:id' },
    )
    return body.user
  })

export const updateAdminUserFn = createServerFn({ method: 'POST' })
  .inputValidator(updateAdminUserSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const { id, ...patch } = data
    return apiFetch<{ ok: true; updated: boolean }>(`/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      pathTemplate: '/users/:id',
      body: JSON.stringify(patch),
    })
  })

export const restoreAdminUserFn = createServerFn({ method: 'POST' })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    return apiFetch<{ ok: true; restored?: boolean }>(
      `/users/${encodeURIComponent(data.id)}/restore`,
      { method: 'POST', pathTemplate: '/users/:id/restore' },
    )
  })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test admin-users`
Expected: PASS (3 tests). Then `yarn typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/server/admin-users.ts src/server/__tests__/admin-users.test.ts
git commit -m "feat(admin-users): add admin user server functions"
```

---

### Task 8: Query keys + Zustand UI store

**Files:**
- Modify: `src/lib/api/query-keys.ts` (add `users` block to `adminKeys`)
- Create: `src/lib/stores/admin-users-store.ts`

**Interfaces:**
- Produces: `adminKeys.users.list(tier)`, `adminKeys.users.detail(id)`, `useAdminUsersStore` (`activeTierFilter`, `searchQuery`, setters, `reset`).

- [ ] **Step 1: Add the users key block**

In `src/lib/api/query-keys.ts`, inside the `adminKeys` object (alongside `applications`):

```ts
  /** Admin user-management query keys */
  users: {
    all: ['admin', 'users'] as const,
    list: (tier: string) => ['admin', 'users', 'list', tier] as const,
    detail: (id: string) => ['admin', 'users', 'detail', id] as const,
  },
```

- [ ] **Step 2: Create `src/lib/stores/admin-users-store.ts`**

```ts
/**
 * Admin Users UI Store — Zustand
 *
 * Client-side UI state for the admin Users list (tier filter + search).
 * Server data lives in the TanStack Query cache, not here.
 */
import { create } from 'zustand'
import type { UserTier } from '@/features/admin-users/types'

interface AdminUsersUIStore {
  activeTierFilter: UserTier | 'all'
  searchQuery: string
  setTierFilter: (tier: UserTier | 'all') => void
  setSearchQuery: (query: string) => void
  reset: () => void
}

const INITIAL_STATE = {
  activeTierFilter: 'all' as const,
  searchQuery: '',
}

export const useAdminUsersStore = create<AdminUsersUIStore>((set) => ({
  ...INITIAL_STATE,
  setTierFilter: (tier) => set({ activeTierFilter: tier }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  reset: () => set(INITIAL_STATE),
}))
```

- [ ] **Step 3: Verify**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/query-keys.ts src/lib/stores/admin-users-store.ts
git commit -m "feat(admin-users): add query keys and Zustand UI store"
```

---

### Task 9: Data hooks

**Files:**
- Create: `src/features/admin-users/hooks/use-admin-users.ts`
- Test: `src/features/admin-users/hooks/__tests__/use-admin-users.test.tsx`

**Interfaces:**
- Consumes: server fns (Task 7); `adminKeys.users` (Task 8).
- Produces: `useAdminUsers(tier)`, `useAdminUser(id)`, `useUpdateAdminUser()`, `useRestoreAdminUser()`. No polling (user list is not a live pipeline). Mutations invalidate `adminKeys.users.all`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/admin-users/hooks/__tests__/use-admin-users.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/server/admin-users', () => ({
  listAdminUsersFn: vi.fn(async () => [{ id: 'u1', email: 'a@x.com', plan: 'pro', role: 'user' }]),
  getAdminUserFn: vi.fn(),
  updateAdminUserFn: vi.fn(),
  restoreAdminUserFn: vi.fn(),
}))

import { useAdminUsers } from '../use-admin-users'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useAdminUsers', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns the user list', async () => {
    const { result } = renderHook(() => useAdminUsers('all'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].email).toBe('a@x.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test use-admin-users`
Expected: FAIL — hook module missing.

- [ ] **Step 3: Create `src/features/admin-users/hooks/use-admin-users.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { notifyError } from '@/lib/errors/notify'
import type { AdminUserSummary, AdminUserDetail, UserTier, UserRole } from '../types'
import {
  listAdminUsersFn,
  getAdminUserFn,
  updateAdminUserFn,
  restoreAdminUserFn,
} from '@/server/admin-users'

export function useAdminUsers(tier: UserTier | 'all' = 'all') {
  return useQuery<AdminUserSummary[]>({
    queryKey: adminKeys.users.list(tier),
    queryFn: async () => {
      const data = await listAdminUsersFn({ data: { tier } })
      return Array.isArray(data) ? data : []
    },
  })
}

export function useAdminUser(id: string | null) {
  return useQuery<AdminUserDetail>({
    queryKey: adminKeys.users.detail(id ?? ''),
    queryFn: () => getAdminUserFn({ data: { id: id ?? '' } }),
    enabled: Boolean(id),
  })
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; role?: UserRole; plan?: UserTier }) =>
      updateAdminUserFn({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users.all })
    },
    onError: (err) => notifyError(err),
  })
}

export function useRestoreAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string }) => restoreAdminUserFn({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users.all })
    },
    onError: (err) => notifyError(err),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test use-admin-users`
Expected: PASS. Then `yarn typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-users/hooks/
git commit -m "feat(admin-users): add data hooks for list, detail, update, restore"
```

---

### Task 10: PlanBadge + RoleBadge presentational components

**Files:**
- Create: `src/features/admin-users/components/PlanBadge.tsx`
- Test: `src/features/admin-users/components/__tests__/PlanBadge.test.tsx`

**Interfaces:**
- Consumes: `PLAN_COLOURS`, `PLAN_LABELS`, `ROLE_COLOURS` (Task 6).
- Produces: `PlanBadge({ plan, deleted })`, `RoleBadge({ role })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/admin-users/components/__tests__/PlanBadge.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlanBadge, RoleBadge } from '../PlanBadge'

describe('PlanBadge', () => {
  it('renders the plan label', () => {
    render(<PlanBadge plan="premium" deleted={false} />)
    expect(screen.getByText('Premium')).toBeInTheDocument()
  })
  it('shows a Deleted label when deleted', () => {
    render(<PlanBadge plan="free" deleted />)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
  })
  it('RoleBadge renders the role', () => {
    render(<RoleBadge role="admin" />)
    expect(screen.getByText('admin')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test PlanBadge`
Expected: FAIL — component missing.

- [ ] **Step 3: Create `src/features/admin-users/components/PlanBadge.tsx`**

```tsx
import type { UserTier, UserRole } from '../types'
import { PLAN_COLOURS, PLAN_LABELS, ROLE_COLOURS } from './AdminUserTypes'

const DELETED_CLASS =
  'bg-red-50 text-red-700 border-red-600/20 line-through dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30'

export function PlanBadge({ plan, deleted }: { readonly plan: UserTier; readonly deleted: boolean }) {
  if (deleted) {
    return (
      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${DELETED_CLASS}`}>
        Deleted
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${PLAN_COLOURS[plan]}`}>
      {PLAN_LABELS[plan]}
    </span>
  )
}

export function RoleBadge({ role }: { readonly role: UserRole }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_COLOURS[role]}`}>
      {role}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test PlanBadge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-users/components/PlanBadge.tsx src/features/admin-users/components/__tests__/PlanBadge.test.tsx
git commit -m "feat(admin-users): add PlanBadge and RoleBadge components"
```

---

### Task 11: ChangeRolePlanModal (with Stripe-override warning)

**Files:**
- Create: `src/features/admin-users/components/ChangeRolePlanModal.tsx`
- Test: `src/features/admin-users/components/__tests__/ChangeRolePlanModal.test.tsx`

**Interfaces:**
- Consumes: `CustomDropDown` (`@/components/ui/CustomDropDown`); `useUpdateAdminUser` (Task 9); `AdminUserSummary` (Task 6).
- Produces: `ChangeRolePlanModal({ user, open, onClose })`. Shows the Stripe-override warning whenever the selected plan differs from the user's current plan AND the user has an active subscription.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/admin-users/components/__tests__/ChangeRolePlanModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChangeRolePlanModal } from '../ChangeRolePlanModal'
import type { AdminUserSummary } from '../../types'

vi.mock('../../hooks/use-admin-users', () => ({
  useUpdateAdminUser: () => ({ mutate: vi.fn(), isPending: false }),
}))

const USER: AdminUserSummary = {
  id: 'u1', email: 'a@x.com', fullName: 'A', role: 'user', plan: 'pro',
  subscriptionStatus: 'active', trialEndsAt: null, deletedAt: null, createdAt: '2026-01-01',
}

describe('ChangeRolePlanModal', () => {
  it('renders the current email when open', () => {
    render(<ChangeRolePlanModal user={USER} open onClose={() => {}} />)
    expect(screen.getByText(/a@x.com/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test ChangeRolePlanModal`
Expected: FAIL — component missing.

- [ ] **Step 3: Create the component**

Use Headless UI `Dialog` (the repo already depends on `@headlessui/react`; see `CommandPallete`/`CustomDropDown`). Hooks first, then guard return. Keep complexity ≤10 by extracting the warning condition.

```tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop } from '@headlessui/react'
import { AlertTriangle } from 'lucide-react'
import { CustomDropDown } from '@/components/ui/CustomDropDown'
import { useUpdateAdminUser } from '../hooks/use-admin-users'
import type { AdminUserSummary, UserTier, UserRole } from '../types'
import { PLAN_LABELS } from './AdminUserTypes'

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
] as const

const PLAN_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'premium', label: 'Premium' },
] as const

const ACTIVE_SUB = new Set(['active', 'trialing', 'past_due'])

interface Props {
  readonly user: AdminUserSummary
  readonly open: boolean
  readonly onClose: () => void
}

export function ChangeRolePlanModal({ user, open, onClose }: Props) {
  const [role, setRole] = useState<UserRole>(user.role)
  const [plan, setPlan] = useState<UserTier>(user.plan)
  const { mutate, isPending } = useUpdateAdminUser()

  const planChanged = plan !== user.plan
  const showStripeWarning = planChanged && ACTIVE_SUB.has(user.subscriptionStatus ?? '')
  const dirty = role !== user.role || planChanged

  const handleSave = () => {
    const patch: { id: string; role?: UserRole; plan?: UserTier } = { id: user.id }
    if (role !== user.role) patch.role = role
    if (planChanged) patch.plan = plan
    mutate(patch, { onSuccess: () => onClose() })
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm dark:bg-zinc-900/60" />
      <div className="fixed inset-0 z-10 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Manage access
          </DialogTitle>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>

          <div className="mt-4 space-y-4">
            <CustomDropDown
              label="Role"
              options={ROLE_OPTIONS}
              value={role}
              onChange={(v) => setRole(v as UserRole)}
            />
            <CustomDropDown
              label="Plan"
              options={PLAN_OPTIONS}
              value={plan}
              onChange={(v) => setPlan(v as UserTier)}
            />
          </div>

          {showStripeWarning && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-600/20 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                This user has an active subscription. Setting the plan to {PLAN_LABELS[plan]} is a
                manual override and will be reverted by the next Stripe webhook sync. Change the plan
                in Stripe to make it stick.
              </span>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!dirty || isPending}
              onClick={handleSave}
              className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test ChangeRolePlanModal`
Expected: PASS. Then `yarn typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-users/components/ChangeRolePlanModal.tsx src/features/admin-users/components/__tests__/ChangeRolePlanModal.test.tsx
git commit -m "feat(admin-users): add change role/plan modal with Stripe override warning"
```

---

### Task 12: UserDetailPanel (read-only drawer)

**Files:**
- Create: `src/features/admin-users/components/UserDetailPanel.tsx`
- Test: `src/features/admin-users/components/__tests__/UserDetailPanel.test.tsx`

**Interfaces:**
- Consumes: `useAdminUser` (Task 9); `PlanBadge`/`RoleBadge` (Task 10).
- Produces: `UserDetailPanel({ userId, open, onClose })`. Fetches detail by id; shows plan, role, trial/subscription dates, Stripe IDs, quotas.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/admin-users/components/__tests__/UserDetailPanel.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserDetailPanel } from '../UserDetailPanel'

vi.mock('../../hooks/use-admin-users', () => ({
  useAdminUser: () => ({
    data: {
      id: 'u1', email: 'a@x.com', fullName: 'A', role: 'user', plan: 'pro',
      subscriptionStatus: 'active', trialEndsAt: null, deletedAt: null, createdAt: '2026-01-01',
      stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1',
      currentPeriodEnd: null, cancelAtPeriodEnd: false, quotas: [],
    },
    isLoading: false,
  }),
}))

describe('UserDetailPanel', () => {
  it('shows the Stripe customer id', () => {
    render(<UserDetailPanel userId="u1" open onClose={() => {}} />)
    expect(screen.getByText('cus_1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test UserDetailPanel`
Expected: FAIL — component missing.

- [ ] **Step 3: Create the component**

Headless UI `Dialog` slide-over. Hooks first, then guard returns (`if (!userId) return null` AFTER the hook; loading skeleton). Render Stripe IDs and a quota list (stable key = `feature+periodMonth`, never index).

```tsx
'use client'

import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react'
import { Loader2 } from 'lucide-react'
import { useAdminUser } from '../hooks/use-admin-users'
import { PlanBadge, RoleBadge } from './PlanBadge'

interface Props {
  readonly userId: string | null
  readonly open: boolean
  readonly onClose: () => void
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">{value}</span>
    </div>
  )
}

export function UserDetailPanel({ userId, open, onClose }: Props) {
  const { data: user, isLoading } = useAdminUser(userId)

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm dark:bg-zinc-900/60" />
      <div className="fixed inset-y-0 right-0 flex max-w-full">
        <DialogPanel className="w-screen max-w-md overflow-y-auto border-l border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-8 animate-spin text-violet-400" />
            </div>
          )}
          {!isLoading && user && (
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {user.fullName ?? user.email}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
              <div className="mt-3 flex gap-2">
                <PlanBadge plan={user.plan} deleted={user.deletedAt !== null} />
                <RoleBadge role={user.role} />
              </div>
              <div className="mt-5 divide-y divide-zinc-100 dark:divide-white/5">
                <Row label="Subscription" value={user.subscriptionStatus ?? '—'} />
                <Row label="Trial ends" value={user.trialEndsAt ?? '—'} />
                <Row label="Period end" value={user.currentPeriodEnd ?? '—'} />
                <Row label="Cancel at period end" value={user.cancelAtPeriodEnd ? 'Yes' : 'No'} />
                <Row label="Stripe customer" value={user.stripeCustomerId ?? '—'} />
                <Row label="Stripe subscription" value={user.stripeSubscriptionId ?? '—'} />
                <Row label="Created" value={user.createdAt} />
              </div>
              {user.quotas.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Usage</h3>
                  <div className="mt-2 divide-y divide-zinc-100 dark:divide-white/5">
                    {user.quotas.map((q) => (
                      <Row key={`${q.feature}-${q.periodMonth}`} label={`${q.feature} (${q.periodMonth})`} value={String(q.count)} />
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-6 flex justify-end">
                <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10">
                  Close
                </button>
              </div>
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test UserDetailPanel`
Expected: PASS. Then `yarn typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-users/components/UserDetailPanel.tsx src/features/admin-users/components/__tests__/UserDetailPanel.test.tsx
git commit -m "feat(admin-users): add read-only user detail panel"
```

---

### Task 13: UserRowActions + UserListRow

**Files:**
- Create: `src/features/admin-users/components/UserRowActions.tsx`
- Create: `src/features/admin-users/components/UserListRow.tsx`
- Test: `src/features/admin-users/components/__tests__/UserListRow.test.tsx`

**Interfaces:**
- Consumes: `AdminUserSummary` (Task 6); `PlanBadge`/`RoleBadge` (Task 10).
- Produces: `UserRowActions({ user, onView, onEdit, onRestore })`; `UserListRow({ user, onView, onEdit, onRestore })`. Restore button only renders when `user.deletedAt !== null`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/admin-users/components/__tests__/UserListRow.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserListRow } from '../UserListRow'
import type { AdminUserSummary } from '../../types'

const base: AdminUserSummary = {
  id: 'u1', email: 'a@x.com', fullName: 'A', role: 'user', plan: 'pro',
  subscriptionStatus: 'active', trialEndsAt: null, deletedAt: null, createdAt: '2026-01-01',
}

function noop() {}

describe('UserListRow', () => {
  it('renders email and plan', () => {
    render(<UserListRow user={base} onView={noop} onEdit={noop} onRestore={noop} />)
    expect(screen.getByText('a@x.com')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
  })
  it('shows Restore only for a deleted user', () => {
    const { rerender } = render(<UserListRow user={base} onView={noop} onEdit={noop} onRestore={noop} />)
    expect(screen.queryByLabelText('Restore user')).not.toBeInTheDocument()
    rerender(<UserListRow user={{ ...base, deletedAt: '2026-02-01' }} onView={noop} onEdit={noop} onRestore={noop} />)
    expect(screen.getByLabelText('Restore user')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test UserListRow`
Expected: FAIL — components missing.

- [ ] **Step 3: Create `UserRowActions.tsx`**

```tsx
import { Eye, ShieldCheck, RotateCcw } from 'lucide-react'
import type { AdminUserSummary } from '../types'

const BTN =
  'inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100 transition-colors'

interface Props {
  readonly user: AdminUserSummary
  readonly onView: () => void
  readonly onEdit: () => void
  readonly onRestore: () => void
}

export function UserRowActions({ user, onView, onEdit, onRestore }: Props) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" aria-label="View user" title="View user" className={BTN} onClick={onView}>
        <Eye className="size-4" />
      </button>
      <button type="button" aria-label="Manage access" title="Manage access" className={BTN} onClick={onEdit}>
        <ShieldCheck className="size-4" />
      </button>
      {user.deletedAt !== null && (
        <button type="button" aria-label="Restore user" title="Restore user" className={BTN} onClick={onRestore}>
          <RotateCcw className="size-4" />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `UserListRow.tsx`**

```tsx
import type { AdminUserSummary } from '../types'
import { PlanBadge, RoleBadge } from './PlanBadge'
import { UserRowActions } from './UserRowActions'

interface Props {
  readonly user: AdminUserSummary
  readonly onView: (user: AdminUserSummary) => void
  readonly onEdit: (user: AdminUserSummary) => void
  readonly onRestore: (user: AdminUserSummary) => void
}

export function UserListRow({ user, onView, onEdit, onRestore }: Props) {
  return (
    <div className="grid grid-cols-1 items-start gap-2 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/5 sm:grid-cols-[1.5fr_1.5fr_8rem_6rem_8rem_auto] sm:items-center sm:gap-4">
      <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{user.email}</span>
      <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">{user.fullName ?? '—'}</span>
      <div className="justify-self-start"><PlanBadge plan={user.plan} deleted={user.deletedAt !== null} /></div>
      <div className="justify-self-start"><RoleBadge role={user.role} /></div>
      <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">{user.subscriptionStatus ?? '—'}</span>
      <div className="justify-self-end">
        <UserRowActions
          user={user}
          onView={() => onView(user)}
          onEdit={() => onEdit(user)}
          onRestore={() => onRestore(user)}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test + commit**

Run: `yarn test UserListRow` → PASS; then `yarn typecheck`.

```bash
git add src/features/admin-users/components/UserRowActions.tsx src/features/admin-users/components/UserListRow.tsx src/features/admin-users/components/__tests__/UserListRow.test.tsx
git commit -m "feat(admin-users): add user row and row actions components"
```

---

### Task 14: AdminUsersList container

**Files:**
- Create: `src/features/admin-users/components/AdminUsersList.tsx`
- Test: `src/features/admin-users/components/__tests__/AdminUsersList.test.tsx`

**Interfaces:**
- Consumes: `useAdminUsers`, `useRestoreAdminUser` (Task 9); `useAdminUsersStore` (Task 8); `CustomDropDown`, `CommandPallete`, `Pagination`; `TIER_FILTER_OPTIONS`, `PLAN_LABELS` (Task 6); `UserListRow` (Task 13); `UserDetailPanel` (Task 12); `ChangeRolePlanModal` (Task 11).
- Produces: `AdminUsersList()` — full list view mirroring `ApplicationsList`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/admin-users/components/__tests__/AdminUsersList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminUsersList } from '../AdminUsersList'

vi.mock('../../hooks/use-admin-users', () => ({
  useAdminUsers: () => ({
    data: [
      { id: 'u1', email: 'a@x.com', fullName: 'A', role: 'user', plan: 'pro',
        subscriptionStatus: 'active', trialEndsAt: null, deletedAt: null, createdAt: '2026-01-01' },
    ],
    isLoading: false,
    error: null,
  }),
  useRestoreAdminUser: () => ({ mutate: vi.fn() }),
  useUpdateAdminUser: () => ({ mutate: vi.fn(), isPending: false }),
  useAdminUser: () => ({ data: undefined, isLoading: false }),
}))

describe('AdminUsersList', () => {
  it('renders a user row', () => {
    render(<AdminUsersList />)
    expect(screen.getByText('a@x.com')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test AdminUsersList`
Expected: FAIL — component missing.

- [ ] **Step 3: Create `AdminUsersList.tsx`**

Mirror `ApplicationsList` structure: toolbar (tier `CustomDropDown` + ⌘K search button), loading/error/empty states, column headers, rows, pagination. State for `palleteOpen`, `currentPage`, `detailUserId`, `editUser`. Client-side search filters email/name. `ITEMS_PER_PAGE = 10`. Hooks first; no guard return before hooks.

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Users, Search, Loader2, AlertCircle } from 'lucide-react'
import { useAdminUsers, useRestoreAdminUser } from '../hooks/use-admin-users'
import { useAdminUsersStore } from '@/lib/stores/admin-users-store'
import { CustomDropDown } from '@/components/ui/CustomDropDown'
import { CommandPallete, type CommandPalleteItem } from '@/components/ui/CommandPallete'
import { Pagination } from '@/components/ui/Pagination'
import { TIER_FILTER_OPTIONS } from './AdminUserTypes'
import { UserListRow } from './UserListRow'
import { UserDetailPanel } from './UserDetailPanel'
import { ChangeRolePlanModal } from './ChangeRolePlanModal'
import type { AdminUserSummary, UserTier } from '../types'

const ITEMS_PER_PAGE = 10

function matchesQuery(user: AdminUserSummary, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return (
    user.email.toLowerCase().includes(q) ||
    (user.fullName?.toLowerCase().includes(q) ?? false)
  )
}

export function AdminUsersList() {
  const tierFilter = useAdminUsersStore((s) => s.activeTierFilter)
  const setTierFilter = useAdminUsersStore((s) => s.setTierFilter)
  const searchQuery = useAdminUsersStore((s) => s.searchQuery)

  const [palleteOpen, setPalleteOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [editUser, setEditUser] = useState<AdminUserSummary | null>(null)

  const { data: users, isLoading, error } = useAdminUsers(tierFilter)
  const { mutate: restoreUser } = useRestoreAdminUser()

  useEffect(() => setCurrentPage(1), [tierFilter, searchQuery])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPalleteOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const filtered = (users ?? []).filter((u) => matchesQuery(u, searchQuery))
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  const commandItems: CommandPalleteItem[] = (users ?? []).map((u) => ({
    id: u.id, name: u.email, description: u.fullName ?? undefined,
  }))

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <CommandPallete
        open={palleteOpen}
        setOpen={setPalleteOpen}
        items={commandItems}
        placeholder="Jump to user..."
        onSelect={(item) => setDetailUserId(item.id)}
      />

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/2">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-3 dark:border-white/10 sm:flex-row sm:items-center">
          <div className="z-10 w-full sm:w-64">
            <CustomDropDown
              options={TIER_FILTER_OPTIONS}
              value={tierFilter}
              onChange={(val) => setTierFilter(val as UserTier | 'all')}
            />
          </div>
          <div className="group relative flex-1">
            <button
              type="button"
              onClick={() => setPalleteOpen(true)}
              className="flex w-full items-center justify-between rounded-md bg-zinc-100 py-1.5 pl-3 pr-2 text-sm text-zinc-500 outline-1 -outline-offset-1 outline-zinc-300 transition-colors hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:outline-white/10 dark:hover:bg-white/10"
            >
              <span className="flex items-center"><Search className="mr-2 size-4" />Search email or name...</span>
              <kbd className="hidden items-center rounded border border-zinc-200 bg-zinc-100 px-2 py-0.5 font-sans text-xs text-zinc-500 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                <abbr title="Command" className="no-underline">⌘</abbr>K
              </kbd>
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16"><Loader2 className="size-8 animate-spin text-violet-400" /></div>
        )}
        {error && (
          <div className="m-3 flex items-center gap-3 rounded-md border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            <AlertCircle className="size-5 shrink-0" /><span>Failed to load users: {error.message}</span>
          </div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="mb-4 size-12 text-zinc-300 dark:text-zinc-700" />
            <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-400">No users found</h3>
          </div>
        )}
        {!isLoading && !error && filtered.length > 0 && (
          <>
            <div className="hidden grid-cols-[1.5fr_1.5fr_8rem_6rem_8rem_auto] items-center gap-4 border-b border-zinc-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:border-white/10 dark:text-zinc-500 sm:grid">
              <span>Email</span><span>Name</span><span>Plan</span><span>Role</span><span>Status</span><span className="sr-only">Actions</span>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-white/10">
              {paginated.map((user) => (
                <UserListRow
                  key={user.id}
                  user={user}
                  onView={(u) => setDetailUserId(u.id)}
                  onEdit={(u) => setEditUser(u)}
                  onRestore={(u) => restoreUser({ id: u.id })}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="border-t border-zinc-200 p-3 dark:border-white/10">
                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
              </div>
            )}
          </>
        )}
      </div>

      <UserDetailPanel userId={detailUserId} open={detailUserId !== null} onClose={() => setDetailUserId(null)} />
      {editUser && (
        <ChangeRolePlanModal user={editUser} open onClose={() => setEditUser(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test + verify**

Run: `yarn test AdminUsersList` → PASS; then `yarn typecheck && yarn lint`.
If lint flags `AdminUsersList` complexity > 10, extract the toolbar and the body-states into local sub-components (`<Toolbar/>`, `<ListBody/>`) in the same file.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-users/components/AdminUsersList.tsx src/features/admin-users/components/__tests__/AdminUsersList.test.tsx
git commit -m "feat(admin-users): add AdminUsersList container"
```

---

### Task 15: Route + sidebar nav link

**Files:**
- Create: `src/app/_dashboard/admin/users/route.tsx`
- Modify: `src/components/layouts/AppLayout.tsx` (add nav item)

**Interfaces:**
- Consumes: `AdminUsersList` (Task 14); `DashboardPage` (`@/components/layouts/DashboardPage`); router context `isAdmin` from `_dashboard.tsx` `beforeLoad`.
- Produces: route `/admin/users`, admin-gated client-side (redirect non-admins) + a sidebar link `adminOnly: true`.

- [ ] **Step 1: Create the route**

```tsx
// src/app/_dashboard/admin/users/route.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminUsersList } from '@/features/admin-users/components/AdminUsersList'
import { DashboardPage } from '@/components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/admin/users')({
  beforeLoad: ({ context }) => {
    // context.isAdmin is provided by the _dashboard layout beforeLoad.
    if (!(context as { isAdmin?: boolean }).isAdmin) {
      throw redirect({ to: '/overview' })
    }
  },
  component: AdminUsersRoute,
})

function AdminUsersRoute() {
  return (
    <DashboardPage title="Users" description="All Tucaken users across Free, Pro, and Premium tiers">
      <AdminUsersList />
    </DashboardPage>
  )
}
```

- [ ] **Step 2: Run dev server to regenerate route tree**

Run: `yarn dev` (let it boot once so `routeTree.gen.ts` regenerates, then stop). Do NOT hand-edit `routeTree.gen.ts`.
Expected: route `/admin/users` appears in the generated tree; no type errors.

- [ ] **Step 3: Add the sidebar nav item**

In `src/components/layouts/AppLayout.tsx`, add to the `navigation` array (import `UsersIcon` from `@heroicons/react/24/outline` if not already imported):

```ts
  { name: "Users",            href: "/admin/users",   icon: UsersIcon,             adminOnly: true  },
```

- [ ] **Step 4: Verify**

Run: `yarn typecheck && yarn lint`
Expected: PASS. The `to={item.href as string}` cast in `SidebarNavList` already accommodates the new href.

- [ ] **Step 5: Commit**

```bash
git add src/app/_dashboard/admin/users/route.tsx src/components/layouts/AppLayout.tsx src/routeTree.gen.ts
git commit -m "feat(admin-users): add admin users route and sidebar nav link"
```

---

### Task 16: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck, lint, tests (root + workspace)**

Run:
```bash
yarn typecheck
yarn lint
yarn test
yarn workspace admin-api test
```
Expected: all PASS, zero lint errors.

- [ ] **Step 2: Manual smoke (golden path + edge case)**

Run: `yarn dev` (port 5001), sign in as an admin user. Verify:
- "Users" appears in the sidebar (and is hidden for a non-admin).
- `/admin/users` lists users; tier dropdown filters Free/Pro/Premium; ⌘K opens search; pagination works past 10 rows.
- View opens the detail panel; Manage access opens the modal.
- Edge case: pick a user with an active subscription, change the plan in the modal → the Stripe-override warning shows. Change a role → list refreshes via invalidation.
- Toggle dark mode → all new surfaces render correctly.

- [ ] **Step 3: Final commit (if any smoke fixes)**

```bash
git add -A
git commit -m "fix(admin-users): smoke-test fixes"
```

---

## Self-Review notes (author)

- Spec coverage: list (T1,T4,T7,T9,T14), tier filter (T1,T6,T7,T14), ⌘K search + pagination (T14), view detail (T2,T5,T12), restore (T7,T9,T13 — reuses existing endpoint), change role/plan + Stripe warning + plan_events audit (T3,T5,T7,T11), admin gate server+UI (T4/T5 inherit `requireAdminGroup`; T7 `requireAdmin`; T15 route redirect + `adminOnly` nav), RLS bypass (T1,T2 query `getPool` directly), directory-based route (T15), no polling (T9). All covered.
- Type consistency: `AdminUserRow`/`AdminUserDetailRow` (admin-api) map to `AdminUserSummary`/`AdminUserDetail` (frontend) field-for-field; `tier` enum identical across server fn, route, and repo.
- Naming: `listAdminUsersFn`/`getAdminUserFn`/`updateAdminUserFn`/`restoreAdminUserFn` used identically in Task 7 and Task 9.
