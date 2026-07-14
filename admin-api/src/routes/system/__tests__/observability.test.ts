/**
 * @format
 * Tests for admin-api routes/observability.ts — the Kubernetes probe endpoints.
 *
 * Regression focus: /readyz must return **503** (withhold traffic) — NOT 500 —
 * when the DB connection cannot be acquired (pool exhausted / DB unreachable).
 * The previous handler acquired the connection OUTSIDE the try/catch, so an
 * acquisition failure escaped as an unhandled 500, mislabelling a dependency
 * outage as an application error (this is what produced 1757 /readyz 500s in a
 * single day of live metrics).
 */

import { jest } from '@jest/globals';
import { Hono } from 'hono';
import type { Pool, PoolClient } from 'pg';

import { createObservabilityRouter } from '../observability.js';

/** Build a fake pg Pool with configurable connect/query behaviour. */
function mockPool(
  opts: { connectRejects?: Error; queryRejects?: Error } = {},
): { pool: Pool; release: jest.Mock; connect: jest.Mock } {
  const release = jest.fn();
  const client = {
    query: opts.queryRejects
      ? jest.fn(async () => {
          throw opts.queryRejects;
        })
      : jest.fn(async () => ({ rows: [{ ok: 1 }], rowCount: 1 })),
    release,
  } as unknown as PoolClient;
  const connect = opts.connectRejects
    ? jest.fn(async () => {
        throw opts.connectRejects;
      })
    : jest.fn(async () => client);
  const pool = { connect } as unknown as Pool;
  return { pool, release: release as jest.Mock, connect: connect as jest.Mock };
}

function buildApp(pool: Pool): Hono {
  const app = new Hono();
  app.route('/', createObservabilityRouter(pool));
  return app;
}

describe('GET /livez', () => {
  it('returns 200 without touching the DB', async () => {
    const { pool, connect } = mockPool();
    const res = await buildApp(pool).request('/livez');
    expect(res.status).toBe(200);
    // Liveness must never open a DB connection — a transient PG outage must not
    // restart the pod.
    expect(connect).not.toHaveBeenCalled();
  });

  // Regression tests for the 2026-07-05 outage follow-up: a pod whose pool is
  // wedged (every client checked out, none ever coming back) previously passed
  // livez forever and was never restarted — it sat 0/1 until replaced by hand.
  // livez must detect a SUSTAINED fully-checked-out pool from the in-process
  // counters alone (still zero DB round-trips) and fail so kubelet restarts
  // the pod. A DB outage must NOT trip it: failed connects destroy clients,
  // so totalCount falls below max in that case.
  describe('wedged-pool detection', () => {
    /** Fake pool with mutable counters and a connect() spy. */
    function counterPool(counts: { total: number; idle: number }): {
      pool: Pool;
      counts: { total: number; idle: number };
      connect: jest.Mock;
    } {
      const connect = jest.fn(async () => {
        throw new Error('livez must never connect');
      });
      const pool = {
        connect,
        get totalCount() {
          return counts.total;
        },
        get idleCount() {
          return counts.idle;
        },
      } as unknown as Pool;
      return { pool, counts, connect };
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns 503 once the pool has been fully checked out past the threshold', async () => {
      jest.useFakeTimers();
      const { pool, connect } = counterPool({ total: 5, idle: 0 });
      const app = buildApp(pool);

      // First observation of saturation starts the clock — still alive.
      expect((await app.request('/livez')).status).toBe(200);

      jest.advanceTimersByTime(180_001);
      const res = await app.request('/livez');
      expect(res.status).toBe(503);
      expect((await res.json()) as { status: string }).toMatchObject({
        status: 'wedged',
      });
      // Detection is counter-based only — no DB connection, ever.
      expect(connect).not.toHaveBeenCalled();
    });

    it('resets the wedge clock when the pool recovers', async () => {
      jest.useFakeTimers();
      const { pool, counts } = counterPool({ total: 5, idle: 0 });
      const app = buildApp(pool);

      expect((await app.request('/livez')).status).toBe(200);
      jest.advanceTimersByTime(100_000);

      // A client came back — saturation was transient load, not a wedge.
      counts.idle = 1;
      expect((await app.request('/livez')).status).toBe(200);

      // Saturated again much later: the clock must have restarted.
      counts.idle = 0;
      jest.advanceTimersByTime(200_000);
      expect((await app.request('/livez')).status).toBe(200);
    });

    it('stays 200 through a DB outage (totalCount below max is not a wedge)', async () => {
      jest.useFakeTimers();
      // Outage signature: pg destroys failed connections, so the pool drains.
      const { pool } = counterPool({ total: 0, idle: 0 });
      const app = buildApp(pool);

      expect((await app.request('/livez')).status).toBe(200);
      jest.advanceTimersByTime(600_000);
      expect((await app.request('/livez')).status).toBe(200);
    });
  });
});

describe('GET /readyz', () => {
  it('returns 200 { status: ready } when the DB is reachable', async () => {
    const { pool, release } = mockPool();
    const res = await buildApp(pool).request('/readyz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready' });
    // The acquired connection is always returned to the pool.
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('returns 503 (NOT 500) when the connection cannot be acquired', async () => {
    // The core regression: acquisition failure must be a readiness signal, not
    // an unhandled server error.
    const { pool, release } = mockPool({
      connectRejects: new Error('pool exhausted'),
    });
    const res = await buildApp(pool).request('/readyz');
    expect(res.status).toBe(503);
    expect((await res.json()) as { status: string }).toMatchObject({
      status: 'not-ready',
    });
    // No client was acquired, so nothing to release.
    expect(release).not.toHaveBeenCalled();
  });

  it('returns 503 and releases the client when the probe query fails', async () => {
    const { pool, release } = mockPool({
      queryRejects: new Error('canceling statement due to statement timeout'),
    });
    const res = await buildApp(pool).request('/readyz');
    expect(res.status).toBe(503);
    // The client WAS acquired here, so it must be released back to the pool.
    expect(release).toHaveBeenCalledTimes(1);
  });

  // Regression tests for the 2026-07-05 outage: when the DB is briefly slow,
  // the 1s probe bound abandons a `pool.connect()` acquire that pg-pool later
  // fulfils. That checked-out client had no owner, so it leaked; at max:5 a
  // few probe cycles wedged the whole pool and the pod stayed 0/1 until
  // manually replaced.
  describe('slow-acquire leak', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('releases a client whose acquire resolves after the probe timed out', async () => {
      jest.useFakeTimers();
      const release = jest.fn();
      const client = {
        query: jest.fn(async () => ({ rows: [{ ok: 1 }], rowCount: 1 })),
        release,
      } as unknown as PoolClient;
      let resolveConnect!: (c: PoolClient) => void;
      const connect = jest.fn(
        () =>
          new Promise<PoolClient>((resolve) => {
            resolveConnect = resolve;
          }),
      );
      const pool = { connect } as unknown as Pool;

      const resPromise = buildApp(pool).request('/readyz');
      await jest.advanceTimersByTimeAsync(1_001);
      const res = await resPromise;
      expect(res.status).toBe(503);
      expect(release).not.toHaveBeenCalled();

      // pg-pool completes the acquire AFTER the handler already answered 503.
      // The client must be returned to the pool, not abandoned.
      resolveConnect(client);
      await jest.advanceTimersByTimeAsync(0);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('destroys (release(err)) a client whose probe query timed out', async () => {
      jest.useFakeTimers();
      const release = jest.fn();
      const client = {
        // Query never settles — connection is still busy when the bound fires.
        query: jest.fn(() => new Promise(() => undefined)),
        release,
      } as unknown as PoolClient;
      const pool = {
        connect: jest.fn(async () => client),
      } as unknown as Pool;

      const resPromise = buildApp(pool).request('/readyz');
      await jest.advanceTimersByTimeAsync(1_001);
      const res = await resPromise;
      expect(res.status).toBe(503);
      // A truthy release() argument tells pg to destroy the connection —
      // returning a connection with an in-flight query would poison the pool.
      expect(release).toHaveBeenCalledTimes(1);
      expect(release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });
  });
});
