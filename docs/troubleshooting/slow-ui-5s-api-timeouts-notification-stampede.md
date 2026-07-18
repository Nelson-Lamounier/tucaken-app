---
title: Slow UI with 5-second API timeouts — notification-watcher stampede
type: troubleshooting
tags: [performance, connection-pool, tanstack-query, loki, explain-analyze, rls, incident]
sources:
  - src/components/ui/PipelineNotificationWatcher.tsx
  - src/lib/stores/pipeline-notifications-store.ts
  - src/lib/auth/tanstack-auth.ts
  - src/hooks/use-admin-applications.ts
  - admin-api/src/routes/applications/core.ts
  - admin-api/src/lib/pg.ts
created: 2026-07-18
updated: 2026-07-18
---

# Slow UI with 5-second API timeouts — notification-watcher stampede

## Symptom

The dashboard felt slow across the board. admin-api RED data (Loki, 48 h to
2026-07-18) showed `GET /applications/:slug` at **5.0 s median / 6.9 s p95**,
`/activity/daily` at 2.4 s median, and trivially cheap routes (`/me`: 3 ms
p50) spiking to 3-5 s at p95. Browser-side (Faro RUM, 7 d, applications
pages): fetch durations at **92 ms p50 / 3,547 ms p95**, with 7 requests
returning 5xx. A cluster of API failures returned **500 at exactly
5,011-5,030 ms**.

## Root cause

Three compounding causes, none of them SQL:

1. **Watcher stampede.** `PipelineNotificationWatcher` (mounted in AppLayout)
   spawned one polling watcher per `'running'` entry in the
   **localStorage-persisted** notification store — and stale entries never
   left `'running'`. Each watcher polled the FULL application-detail
   endpoint (9 sequential queries in a `withUser` transaction). A single
   page load fired ~24 concurrent detail requests (observed burst at
   03:23:49-51, 24 distinct slugs within ~100 ms).
2. **Pool saturation.** admin-api's pg pool allows 5 clients
   ([pg.ts](../../admin-api/src/lib/pg.ts)); each detail request held one
   for its whole transaction. Waiters that exceeded
   `connectionTimeoutMillis: 5000` failed — the exact 5,011-5,030 ms 500s —
   and survivors queued to 6-7 s. Unrelated routes sharing the pool
   inherited multi-second latencies, which is why "everything" felt slow.
3. **Per-request JWKS fetch.** tucaken-app constructed a fresh jose
   `createRemoteJWKSet` inside every verification, forcing an HTTPS fetch to
   Cognito's JWKS endpoint per session check (jose caches per instance, not
   globally). admin-api already cached correctly.

## Diagnosis — the measurement ladder that found it

Measure first; each step is reproducible from Grafana:

1. **Route latency from access logs** (Prometheus was unavailable; the same
   data lives in the pino access logs):
   `quantile_over_time(0.95, {namespace="admin-api"} | json | msg="request" | unwrap duration_ms [48h]) by (route)`
   → identified which routes were slow at p50 (true data-path problems) vs
   only at p95 (contention victims).
2. **Rule out SQL**: `EXPLAIN (ANALYZE, BUFFERS)` via the RDS datasource,
   inside `SET LOCAL ROLE tucaken_app` + `app.current_user_id` so RLS
   applies — the `/activity/daily` aggregate executed in **2.1 ms**
   (RLS one-time filter, 67-row scan). Payloads ruled out too:
   `pg_column_size(pipeline_runs.metadata)` maxed at 128 KB.
3. **Find the failure signature**: filtering `duration_ms > 3000` exposed
   the 5,011-5,030 ms 500 cluster — the pool-acquire timeout constant, not
   any query time.
4. **Find the caller**: the same log window showed ~24 distinct
   `/applications/:slug` paths in one second → grep for the fan-out source
   → `PipelineNotificationWatcher` + the persisted store.

## Fix

Shipped in [PR #267](https://github.com/Nelson-Lamounier/tucaken-app/pull/267)
(merge `15d0059`, 2026-07-18):

- **Status probe**: watchers now poll `GET /applications/:slug/status`
  (one indexed lookup) via `useApplicationStatusProbe` — never the 9-query
  detail assembly.
- **Store pruning**: `pruneStaleRunning` drops `'running'` entries older
  than 25 min (above the 20-min client poll timeout) on rehydrate, so the
  herd cannot regrow from localStorage.
- **JWKS cache**: module-level `createRemoteJWKSet` cache in
  [tanstack-auth.ts](../../src/lib/auth/tanstack-auth.ts).
- **Detail pipelining**: the endpoint's 8 independent reads submit through
  one `Promise.all` on the single RLS-scoped client — batched submissions
  without extra pool checkouts.

## Post-deploy verification (pending)

The fix merged while `Deploy (Dev)` was in flight; blue-green promotion
gates the active service. Once promoted, verify on the
**Frontend & RUM — portfolio + tucaken** dashboard against the before
baseline recorded above (7 d to 2026-07-18: 92 ms p50 / 3,547 ms p95, 7×5xx
on applications pages):

- applications-page fetch p95 should collapse toward the p50;
- the 5,011-5,030 ms 500 cluster should disappear from
  `{namespace="admin-api"} | json | duration_ms > 4900 | status="500"`;
- `/applications/:slug` call volume should drop (watchers now hit
  `/status`).

## Prevention

- Anything that mounts **per-item pollers** must poll a purpose-built cheap
  endpoint, never an aggregate view — and persisted client state that can
  spawn work needs a TTL (`pruneStaleRunning` is the pattern).
- Latency clustered at a round number is a **timeout constant, not a slow
  operation** — grep the codebase for that number before optimising SQL.
- p50 vs p95 splits contention victims from real data-path problems; check
  both before touching anything.

<!--
Evidence trail (auto-generated):
- Live: Loki queries over {namespace="admin-api"} access logs and {job="faro"}
  RUM events, run 2026-07-18 (48 h route quantiles; 7 d RUM baseline).
- Live: EXPLAIN (ANALYZE, BUFFERS) + pg_column_size via the rds-postgres
  datasource as role tucaken_app, run 2026-07-18.
- Source: PipelineNotificationWatcher.tsx, pipeline-notifications-store.ts,
  tanstack-auth.ts, admin-api pg.ts + applications/core.ts (read 2026-07-18).
- Fix: PR #267, merge 15d0059.
-->
