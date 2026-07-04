/**
 * @format
 * admin-api — Observability endpoints (probes + Prometheus scrape target).
 *
 *   GET /metrics   Prometheus exposition (scraped by Alloy / Prometheus)
 *   GET /livez     Liveness — process is alive. Restart pod on failure.
 *   GET /readyz    Readiness — process AND deps healthy. Withhold traffic.
 *
 * `livez` deliberately does NOT touch the DB. K8s liveness failure restarts
 * the pod; transient PG outages must NOT cause a restart storm.
 *
 * `readyz` runs a 1s-bounded SELECT 1. Slow / failing DB drops the pod from
 * the Service endpoint until recovered, without killing the process.
 */

import { Hono } from 'hono';
import type { Pool, PoolClient } from 'pg';

import { registry } from '../lib/observability/metrics.js';

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

export function createObservabilityRouter(pool: Pool): Hono {
  const router = new Hono();

  router.get('/metrics', async (ctx) => {
    const body = await registry.metrics();
    return ctx.body(body, 200, { 'Content-Type': registry.contentType });
  });

  router.get('/livez', (ctx) => ctx.json({ status: 'ok' }));

  router.get('/readyz', async (ctx) => {
    // Acquire the connection INSIDE the try. Previously `pool.connect()` sat
    // outside it, so a connection-acquisition failure (pool exhausted, DB
    // unreachable) escaped as an unhandled 500 instead of the intended 503 —
    // which both mislabelled the readiness signal and hid the real cause. Now
    // any failure (acquire, query, or timeout) yields 503 "not-ready", and the
    // client is released only if it was actually acquired.
    let client: PoolClient | undefined;
    try {
      client = await withTimeout(pool.connect(), READYZ_TIMEOUT_MS, 'connect');
      await withTimeout(client.query('SELECT 1'), READYZ_TIMEOUT_MS, 'query');
      return ctx.json({ status: 'ready' });
    } catch (err) {
      return ctx.json({ status: 'not-ready', reason: (err as Error).message }, 503);
    } finally {
      client?.release();
    }
  });

  return router;
}
