# public

Unauthenticated, read-only, non-sensitive endpoints for pre-auth flows.
Mounted at `/api/public` **before** the JWT middleware so sign-up can call
them without a session token.

## Files

| File | Exports | Purpose |
|---|---|---|
| `public.ts` | `createPublicRouter` | All public reads |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/public/email-exists` | Pre-sign-up check before Cognito SignUp |
| GET | `/api/public/tier-config` | Public plan/tier shape for the pricing surface |
| GET | `/api/public/stats` | Aggregate platform stats (non-sensitive) |

## Design notes

- **Nothing user-scoped belongs here.** Anything reading a specific user's
  data must live under `/api/admin/*` behind the JWT tier.
- Responses must stay safe to cache and safe to expose — no internal ids,
  no per-user counts.
- Tier config is served through the shared
  [`lib/billing/tier-config-cache.ts`](../../lib/billing/README.md) so public
  and admin surfaces agree on plan limits.

## Testing

`__tests__/public.test.ts`, `__tests__/public.stats.test.ts`.

## Related

- [routes overview](../README.md) · [lib/billing](../../lib/billing/README.md)
