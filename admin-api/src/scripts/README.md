# scripts

Operator CLI scripts. They reuse the same `lib/` services as the routes —
never duplicate route logic here — and are the one place `console.*` output
is acceptable.

## Files

| File | Purpose | Reuses |
|---|---|---|
| `account-sweep.ts` | Nightly sweep: hard-purges users whose soft-delete grace period expired | `lib/account/purge-user.ts`, `lib/repositories/users.ts` |
| `reenrich-sweep.ts` | Re-dispatches enrichment/ingestion Jobs across users (plan-aware) | `lib/jobs/ingestion-job.ts`, `lib/jobs/k8s.ts`, `lib/billing/*`, `lib/config.ts` |
| `reconcile-github-installations.ts` | Reconciles DB installation state against GitHub's actual App installations | `lib/github/github-app.ts` |

## Running

Scripts are plain TS entrypoints executed with `tsx` inside the pod (or
locally with the right env):

```bash
yarn dlx tsx src/scripts/account-sweep.ts
```

They load config through `lib/config.ts` `loadConfig()` and fail fast on
missing env — same contract as the server.

## Rules

- **Reuse lib, never routes.** If a script needs logic that currently lives
  in a route handler, move that logic down into `lib/` first.
- Destructive scripts (account-sweep) must stay idempotent and log every
  affected id.

## Related

- [lib overview](../lib/README.md) · [lib/account](../lib/account/README.md)
