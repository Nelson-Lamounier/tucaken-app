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

import { createObservabilityRouter } from './observability.js';

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
});
