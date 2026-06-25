/** @format */
import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock pg pool — returns empty rows so getCachedTierConfig falls back to
// DEFAULT_TIER_CONFIG. Must be registered BEFORE the dynamic import below.
// ---------------------------------------------------------------------------
jest.unstable_mockModule('../lib/pg.js', () => ({
  getPool: () => ({
    query: async () => ({ rows: [] }),
  }),
}));

// ---------------------------------------------------------------------------
// Mock requireAdminGroup so PUT tests bypass the Cognito JWT check.
// The mock returns a pass-through middleware that calls next() immediately.
// ---------------------------------------------------------------------------
jest.unstable_mockModule('../middleware/auth.js', () => ({
  requireAdminGroup: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

// ---------------------------------------------------------------------------
// Dynamic imports — must follow all jest.unstable_mockModule calls so the
// mocked modules are in place when the router module is evaluated.
// ---------------------------------------------------------------------------
const { createTierConfigRouter } = await import('./tier-config.js');
const { bustTierConfigCache }    = await import('../lib/tier-config-cache.js');
const { DEFAULT_TIER_CONFIG }    = await import('../lib/tier-config-shape.js');

// ---------------------------------------------------------------------------
// Build a single router instance shared across tests.
// ---------------------------------------------------------------------------
const router = createTierConfigRouter({} as never);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tier-config router', () => {
  beforeEach(() => {
    bustTierConfigCache();
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------
  describe('GET /', () => {
    it('returns 200 with the default tier config when no DB row exists', async () => {
      const res = await router.request('/');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { tiers: Array<{ id: string }> };
      expect(body.tiers.map((t) => t.id)).toEqual(['free', 'pro', 'premium']);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /
  // -------------------------------------------------------------------------
  describe('PUT /', () => {
    it('returns 400 when the config has an invalid field (negative priceMonthly)', async () => {
      const bad = structuredClone(DEFAULT_TIER_CONFIG);
      const proTier = bad.tiers[1];
      if (proTier === undefined) throw new Error('Expected pro tier at index 1');
      proTier.priceMonthly = -5;

      const res = await router.request('/', {
        method:  'PUT',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(bad),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Invalid tier config');
    });

    it('returns 200 { updated: true } when the config is valid', async () => {
      const res = await router.request('/', {
        method:  'PUT',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(DEFAULT_TIER_CONFIG),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { updated: boolean };
      expect(body.updated).toBe(true);
    });
  });
});
