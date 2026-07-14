# system

Operational endpoints for Kubernetes and Prometheus. Unauthenticated by design
— probes and scrapers cannot carry Cognito JWTs; network access is restricted
by NetworkPolicy instead.

## Files

| File | Exports | Purpose |
|---|---|---|
| `health.ts` | `createHealthRouter` | Legacy `/healthz` (kept for the Dockerfile HEALTHCHECK) |
| `observability.ts` | `createObservabilityRouter` | Liveness, readiness and metrics endpoints |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Legacy health check (Dockerfile HEALTHCHECK) |
| GET | `/livez` | K8s liveness probe — process alive |
| GET | `/readyz` | K8s readiness probe — DB reachable through the pool |
| GET | `/metrics` | Prometheus scrape target (RED metrics, pool gauges) |

## Design notes

- `/readyz` checks the shared pg pool **without leaking clients** — an
  abandoned `pool.connect()` under `withTimeout` once wedged the pod at
  `max: 5` clients (2026-07-05 outage; fixed in PR #242). Keep any probe
  change leak-free and add a test.
- `/livez` also detects a wedged pool so K8s restarts the pod instead of
  serving from a dead backend.
- Mounted before all auth middleware in [`src/index.ts`](../../index.ts).

## Testing

`__tests__/health.test.ts`, `__tests__/observability.test.ts` — run
`yarn workspace @repo/admin-api test src/routes/system`.

## Related

- [routes overview](../README.md) · [lib/observability](../../lib/observability/README.md)
- Runbook: admin-api readyz pool leak (docs/runbooks in the KB)
