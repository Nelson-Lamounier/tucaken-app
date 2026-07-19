# account

The caller's own account: plan state, self-service deletion, profile summary.
User-JWT tier, **not** staff-gated — every handler is scoped to the
authenticated user id, never a client-supplied one.

## Files

| File | Exports | Mount | Purpose |
|---|---|---|---|
| `me.ts` | `createMeRouter` | `/api/admin/me` | Current-user state + account deletion |
| `profile.ts` | `createProfileRouter` | `/api/admin/profile` | Profile summary read |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/me` | Plan, subscription status, feature gates for the caller |
| POST | `/api/admin/me/delete` | Idempotent soft-delete request (starts account teardown) |
| GET | `/api/admin/profile/summary` | Profile summary for the dashboard |

## Design notes

- `/api/admin/me/*` is the **only** admin surface exempt from the
  deleted-user gate (`deletedUserGate` returns 410 elsewhere) so the frontend
  can still show "account being deleted" and re-trigger deletion idempotently.
- Deletion is a two-stage design: `POST /delete` soft-deletes; the hard purge
  runs later via [`lib/account/purge-user.ts`](../../lib/account/README.md)
  (account-sweep script or an operator's "purge now" in `routes/admin`).
- Feature gates read the email allowlists in `lib/billing/`
  (`ab-free-tier.ts`) and Cognito/GitHub state via
  `lib/account/cognito-admin.ts` + `lib/github/github-uninstall.ts`.

## Testing

`__tests__/profile.test.ts`; deletion paths are covered by the admin-users
delete tests in [`../admin/__tests__/`](../admin/README.md).

## Related

- [routes overview](../README.md) · [lib/account](../../lib/account/README.md) · [lib/billing](../../lib/billing/README.md)
