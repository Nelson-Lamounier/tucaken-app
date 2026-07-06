/**
 * @format
 * admin-api — Observability endpoints (probes + Prometheus scrape target).
 *
 *   GET /metrics   Prometheus exposition (scraped by Alloy / Prometheus)
 *   GET /livez     Liveness — process is alive. Restart pod on failure.
 *   GET /readyz    Readiness — process AND deps healthy. Withhold traffic.
 *
 * `livez` deliberately does NOT touch the DB. K8s liveness failure restarts
 * the pod; transient PG outages must NOT cause a restart storm. It DOES watch
 * the pool's in-process counters for the wedge signature (every client checked
 * out, continuously, for minutes) — a pod in that state can never serve again
 * and previously sat 0/1 forever; failing livez lets kubelet restart it with a
 * fresh pool. A DB outage cannot trip this: pg destroys failed connections, so
 * totalCount falls below max.
 *
 * `readyz` runs a 1s-bounded SELECT 1. Slow / failing DB drops the pod from
 * the Service endpoint until recovered, without killing the process.
 */

import { Hono } from 'hono';
import type { Pool, PoolClient } from 'pg';

import { registry } from '../lib/observability/metrics.js';
import { PG_POOL_MAX } from '../lib/pg.js';

/**
 * Hard bound for the readiness DB probe. A hung/slow DB must not hold the probe
 * (and a pooled connection) open indefinitely — Kubernetes calls /readyz on a
 * short period, so an unbounded probe piles up connections and can exhaust the
 * pool, turning a slow DB into a total outage.
 */
const READYZ_TIMEOUT_MS = 1_000;

/**
 * Reject `p` if it has not settled within `ms`. Used to bound the readiness
 * probe; the timer is unref'd so it never keeps the event loop alive.
 *
 * @param p     the promise to bound
 * @param ms    timeout in milliseconds
 * @param label included in the timeout error for diagnosis
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`readyz ${label} timed out after ${ms}ms`)),
      ms,
    );
    // Node timers expose unref(); guard for non-Node runtimes.
    (timer as { unref?: () => void }).unref?.();
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * How long the pool may stay fully checked out before livez declares the pod
 * wedged. Long enough that a genuine burst of concurrent work (queries here
 * are ms-scale) can never hold it; short enough that a wedged pod self-heals
 * in minutes instead of waiting for a human. Kubelet's failureThreshold adds
 * its own grace on top.
 */
const POOL_WEDGE_THRESHOLD_MS = 180_000;

export function createObservabilityRouter(pool: Pool): Hono {
  const router = new Hono();

  /** Wall-clock instant the pool was first seen fully checked out, else null. */
  let saturatedSince: number | null = null;

  router.get('/metrics', async (ctx) => {
    const body = await registry.metrics();
    return ctx.body(body, 200, { 'Content-Type': registry.contentType });
  });

  router.get('/livez', (ctx) => {
    // Counter reads only — livez must never open a DB connection.
    const saturated = pool.totalCount >= PG_POOL_MAX && pool.idleCount === 0;
    if (!saturated) {
      saturatedSince = null;
      return ctx.json({ status: 'ok' });
    }
    saturatedSince ??= Date.now();
    const heldMs = Date.now() - saturatedSince;
    if (heldMs < POOL_WEDGE_THRESHOLD_MS) {
      return ctx.json({ status: 'ok' });
    }
    return ctx.json(
      { status: 'wedged', reason: `pg pool fully checked out for ${heldMs}ms` },
      503,
    );
  });

  router.get('/readyz', async (ctx) => {
    // Acquire failures (pool exhausted, DB unreachable) must surface as 503
    // "not-ready", never an unhandled 500 — see the test file for history.
    const acquire = pool.connect();
    let client: PoolClient;
    try {
      client = await withTimeout(acquire, READYZ_TIMEOUT_MS, 'connect');
    } catch (err) {
      // The bounded wait gave up, but pg-pool keeps the acquire queued and may
      // fulfil it later. An unawaited fulfilled acquire is a permanently
      // checked-out client: with pool max 5, a few slow-DB probe cycles leak
      // the entire pool and wedge the pod until it is replaced. Release the
      // client on late arrival; swallow a late rejection (nothing to release).
      void acquire.then(
        (lateClient) => lateClient.release(),
        () => undefined,
      );
      return ctx.json({ status: 'not-ready', reason: (err as Error).message }, 503);
    }
    try {
      await withTimeout(client.query('SELECT 1'), READYZ_TIMEOUT_MS, 'query');
      client.release();
      return ctx.json({ status: 'ready' });
    } catch (err) {
      // The probe query may still be in flight on this connection; returning
      // it to the pool would hand the next caller a dirty connection. A truthy
      // release() argument tells pg to destroy it instead.
      const reason = err instanceof Error ? err : new Error(String(err));
      client.release(reason);
      return ctx.json({ status: 'not-ready', reason: reason.message }, 503);
    }
  });

  return router;
}
