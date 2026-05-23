/**
 * @format
 * Instrumentation CONTRACT test for the auth dashboard.
 *
 * The Grafana dashboard "Auth — Sign-In / Sign-Up Workflow" is built entirely
 * on `auth_provision_total{outcome=...}`. This test pins the contract between
 * the code that emits that metric (userProvisionMiddleware) and the dashboard
 * that reads it: every sign-in path must move the matching outcome series by 1,
 * and the metric must keep its name + `outcome` label.
 *
 * If someone renames the metric, drops the label, or stops incrementing on a
 * path, THIS test fails in CI — instead of the dashboard silently going blank.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

// ── Mock the repository so no DB is needed; we control isNew / throw per case ──
const provisionMock = jest.fn<
  () => Promise<{ id: string; isNew: boolean; linkedSubscription?: unknown }>
>();

jest.unstable_mockModule('../../src/lib/repositories/users.js', () => ({
  provisionUserWithPendingLink: provisionMock,
}));

const { Hono }                  = await import('hono');
const { userProvisionMiddleware } = await import('../../src/middleware/user-provision.js');
const { authProvisionTotal }    = await import('../../src/lib/observability/metrics.js');

const fakePool = {} as Pool; // never touched — provision is mocked

/** Read the current value of auth_provision_total for a given outcome. */
async function counter(outcome: string): Promise<number> {
  const metric = await authProvisionTotal.get();
  const row = metric.values.find((v) => v.labels['outcome'] === outcome);
  return row?.value ?? 0;
}

/** Drive one request through the middleware with the given JWT sub. */
async function callMe(sub: string): Promise<number> {
  const app = new Hono();
  app.use('*', async (c, next) => {
    // upstream cognitoJwtAuth normally sets this
    (c as unknown as { set: (k: string, v: unknown) => void }).set('jwtPayload', {
      sub, email: `${sub}@example.com`, 'cognito:groups': ['admin'],
    });
    await next();
  });
  app.use('*', userProvisionMiddleware(fakePool) as never);
  app.get('/api/admin/me', (c) => c.json({ ok: true }));
  const res = await app.request('/api/admin/me');
  return res.status;
}

describe('auth_provision_total contract (auth dashboard)', () => {
  beforeEach(() => provisionMock.mockReset());

  it('keeps the metric name and outcome label the dashboard queries', async () => {
    const metric = await authProvisionTotal.get();
    expect(metric.name).toBe('auth_provision_total');
    // seedZeroSeries pre-registers all three outcomes the dashboard panels use
    const outcomes = metric.values.map((v) => v.labels['outcome']);
    expect(outcomes).toEqual(expect.arrayContaining(['new_user', 'returning', 'error']));
  });

  it('increments outcome="new_user" on first-ever sign-in', async () => {
    provisionMock.mockResolvedValueOnce({ id: 'u1', isNew: true });
    const before = await counter('new_user');
    const status = await callMe(`sub-new-${Date.now()}`);
    expect(status).toBe(200);
    expect(await counter('new_user')).toBe(before + 1);
  });

  it('increments outcome="returning" when the user already exists (DB upsert)', async () => {
    provisionMock.mockResolvedValueOnce({ id: 'u2', isNew: false });
    const before = await counter('returning');
    await callMe(`sub-returning-${Date.now()}`);
    expect(await counter('returning')).toBe(before + 1);
  });

  it('increments outcome="returning" on a pod-cache hit (second call, no DB)', async () => {
    const sub = `sub-cache-${Date.now()}`;
    provisionMock.mockResolvedValueOnce({ id: 'u3', isNew: false }); // first call provisions
    await callMe(sub);
    const before = await counter('returning');
    await callMe(sub); // second call: cache hit, provision must NOT be called again
    expect(provisionMock).toHaveBeenCalledTimes(1);
    expect(await counter('returning')).toBe(before + 1);
  });

  it('increments outcome="error" when provisioning throws (request still 200)', async () => {
    provisionMock.mockRejectedValueOnce(new Error('db down'));
    const before = await counter('error');
    const status = await callMe(`sub-err-${Date.now()}`);
    expect(status).toBe(200); // provisioning failure never blocks the request
    expect(await counter('error')).toBe(before + 1);
  });
});
