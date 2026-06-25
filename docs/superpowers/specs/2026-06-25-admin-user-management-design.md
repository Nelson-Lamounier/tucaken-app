# Admin User Management — Design

Date: 2026-06-25
Branch: `feat/admin-user-management`
Status: Approved (brainstorming) — pending implementation plan

## Purpose

Add an admin-only Users feature to the dashboard that lists all users across
tiers (Free, Pro, Premium), with view-detail, restore-deleted, and
change-role/plan actions. The UI mirrors the existing "Job Applications / List
of all applications" feature so it is visually and structurally consistent.

Admin access is gated server-side (defence in depth): every server function
calls `requireAdmin()` and the admin-api BFF re-checks `requireAdminGroup()`
(Cognito `admin` group). The UI is never the access control.

## Scope (v1)

- Read list of all users with tier, email, name, role, subscription status.
- Tier filter: `all | free | pro | premium` (raw `users.plan` column).
- ⌘K search by email / name.
- Pagination, 10 per page.
- Row actions:
  - **View detail** — read-only panel (plan, trial dates, quotas, Stripe IDs).
  - **Restore** — only for soft-deleted users in grace window (reuses existing endpoint).
  - **Change role/plan** — modal; role is a live mutation, plan is a guarded manual override (see below).

Out of scope: Stripe API plan changes (proration/subscription creation), bulk
actions, CSV export, user impersonation.

## Architecture & data flow

```
Browser (admin only)
  src/app/_dashboard/admin/users/route.tsx          (new, directory-based)
    └─ src/features/admin-users/components/AdminUsersList.tsx
  src/features/admin-users/
    components/  AdminUsersList, UserListRow, UserRowActions, PlanBadge,
                 UserDetailPanel, ChangeRolePlanModal
    hooks/       use-admin-users.ts  (useAdminUsers, useAdminUser)
    types.ts
  src/lib/stores/admin-users-store.ts                (zustand: tier filter, search)
  src/server/admin-users.ts                          (new server fns)
    listAdminUsersFn   GET   requireAdmin, Zod { tier }
    getAdminUserFn     GET   requireAdmin, Zod { id }
    restoreUserFn      POST  requireAdmin
    updateUserAdminFn  PATCH requireAdmin, Zod { id, role?, plan? }

admin-api (BFF)
  routes/admin-users.ts   (extend; all [requireAdminGroup])
    GET   /api/admin/users         list + ?tier=
    GET   /api/admin/users/:id     detail
    PATCH /api/admin/users/:id     role / plan override
    POST  /api/admin/users/:id/restore   (exists)
  lib/repositories/users.ts (extend)
    listUsers({ tier, limit, offset })   runs WITHOUT withUser (admin scope)
    getUserById(id)                      admin read of any row
    adminUpdateUser(id, { role, plan })  writes plan_events audit row
```

### RLS note (critical)

All existing user queries run inside `withUser(pool, userId)` which sets
`app.current_user_id` to drive row-level security, so a user sees only their own
row. The admin `listUsers` / `getUserById` / `adminUpdateUser` functions must run
on a path that does **not** set that user scope (admin reads/writes all rows).
Parameterised SQL only (`$1`, `$2`), no string concatenation.

## Data model

```ts
interface AdminUserSummary {
  id: string                  // users.id UUID — stable React key
  email: string
  fullName: string | null
  role: 'user' | 'admin'      // RDS-owned, freely mutable
  plan: 'free' | 'pro' | 'premium'   // raw column, Stripe-owned
  subscriptionStatus: string | null
  trialEndsAt: string | null
  deletedAt: string | null    // non-null → soft-deleted, show Restore
  createdAt: string
}

interface AdminUserDetail extends AdminUserSummary {
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  quotas: { feature: string; periodMonth: string; count: number }[]
}
```

Tier filter maps directly to the raw `plan` column. Trial is NOT a separate
filter in v1 (a Free user mid-trial still files under `free`).

## Mutation semantics — role vs plan

| Field | Owner | Admin write? | Mechanism |
|---|---|---|---|
| `role` | RDS | Yes, live | PATCH sets `users.role`; writes `plan_events` audit row |
| `plan` | **Stripe** | Yes, flagged | PATCH sets `users.plan` + `plan_events` row `reason='admin_manual_override'` |

**Plan override is honest about its limitation:** directly setting `users.plan`
is overwritten by the next Stripe webhook sync unless the user has no active
subscription. The change-role/plan modal shows a clear warning to that effect.
No Stripe API calls are made in v1 (Option A). Role is the genuinely useful
admin lever — `role='admin'` grants full entitlements via `isFullAccess`.

Granting `admin` role is a privilege escalation and is recorded in `plan_events`.

## UI (mirror ApplicationsList)

- Grid columns: `Email (1.5fr) · Name (1.5fr) · Plan (8rem) · Role (6rem) · Status (8rem) · Actions (auto)`.
- `PlanBadge` clones the `StatusBadge` colour-map pattern: free=slate, pro=violet,
  premium=amber, deleted=red/strike. Dark-mode variants required.
- Tier dropdown reuses `CustomDropDown`; ⌘K search via `CommandPallete`.
- Pagination 10/page (`ITEMS_PER_PAGE = 10`).
- Zustand store mirrors `applications-store.ts` (tier filter, search query).
- **No polling** — user list is not a live pipeline; `useAdminUsers` drops the
  `refetchInterval`. Mutations invalidate the query to refresh.
- `rounded-md` default; renders correctly in light + dark.
- Route is directory-based per the mandatory migration rule. No new flat-file routes.

## Error handling

- Server fns: `requireAdmin()` throws `AuthorizationError` → client shows
  "Admin access required"; never leak stack traces / internal IDs.
- Mutations: no optimistic update; on error show toast + invalidate to roll back.
- Empty / loading / error states cloned from the applications list.

## Testing (Vitest, colocated)

- Repo: `listUsers` tier filter + pagination; `getUserById`; `adminUpdateUser`
  writes a `plan_events` row with the correct `reason`.
- Server fn: rejects non-admin (`requireAdmin`); Zod rejects an invalid tier / role / plan.
- Component: renders rows; tier filter switches the query; Restore only renders
  for soft-deleted users; change-role/plan modal shows the Stripe-override warning.

## Verification before done

`yarn typecheck && yarn lint && yarn test`; then `yarn dev` and exercise the
golden path (list + filter + view detail) plus one edge case (change a role,
attempt plan override on an active-subscription user → warning shown).
