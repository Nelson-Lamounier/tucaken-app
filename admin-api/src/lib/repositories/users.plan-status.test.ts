/** @format */
/**
 * Regression test: getUserPlanStatus must not silently downgrade premium users.
 * Security review finding: without the premium CASE branch, a user with
 * plan='premium' + subscription_status='active' fell through to 'free'.
 *
 * Strategy: inject a fake pool (no DB, no jest.mock) — the function accepts
 * Pick<Pool,'query'> so any object with a compatible .query() works.
 * The fake returns a canned row; the test verifies the TS mapping + the
 * entitlements round-trip, not the SQL CASE text.
 */
import { getUserPlanStatus } from './users.js';
import { entitlementsFor, ENTITLEMENTS } from '../entitlements.js';

/** Minimal valid row — every column the mapping reads must be present. */
function makeRow(overrides: Record<string, unknown>) {
    return {
        plan:                   'free',
        role:                   'user',
        trial_started_at:       null,
        trial_ends_at:          null,
        subscription_status:    null,
        stripe_customer_id:     null,
        stripe_subscription_id: null,
        cancel_at_period_end:   false,
        current_period_end:     null,
        effective_plan:         'free',
        trial_days_remaining:   null,
        ...overrides,
    };
}

function fakePool(row: Record<string, unknown>) {
    return {
        query: async () => ({ rows: [row] }),
    };
}

describe('getUserPlanStatus — premium regression', () => {
    it('(a) maps an active premium row to effectivePlan="premium"', async () => {
        const row = makeRow({
            plan:                'premium',
            subscription_status: 'active',
            effective_plan:      'premium',
        });
        const status = await getUserPlanStatus(fakePool(row) as any, 'user-1');
        expect(status).not.toBeNull();
        expect(status!.effectivePlan).toBe('premium');
    });

    it('(b) premium user gets ENTITLEMENTS.premium end-to-end', async () => {
        const row = makeRow({
            plan:                'premium',
            subscription_status: 'active',
            effective_plan:      'premium',
        });
        const status = await getUserPlanStatus(fakePool(row) as any, 'user-1');
        expect(status).not.toBeNull();
        const ents = entitlementsFor(status!.effectivePlan, 'user');
        expect(ents).toEqual(ENTITLEMENTS.premium);
    });

    it('(c) free non-admin user maps through and gets ENTITLEMENTS.free', async () => {
        const row = makeRow({});
        const status = await getUserPlanStatus(fakePool(row) as any, 'user-2');
        expect(status).not.toBeNull();
        expect(status!.effectivePlan).toBe('free');
        const ents = entitlementsFor(status!.effectivePlan, 'user');
        expect(ents).toEqual(ENTITLEMENTS.free);
    });
});
