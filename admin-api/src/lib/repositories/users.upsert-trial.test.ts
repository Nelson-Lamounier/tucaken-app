/** @format */
/**
 * Regression: trials are decommissioned. A brand-new non-admin user must NOT be
 * granted a trial on first sign-in — both trial columns stay NULL and no
 * 'trial_started' plan_event is written. (Re-enabling is a one-line flip of
 * TRIALS_ENABLED.)
 */
import { upsertUserInTransaction } from './users.js';

interface Captured { sql: string; params: unknown[] }

/**
 * Fake pg client for a BRAND-NEW user: no existing identity, no existing email.
 * Records every query so the test can inspect the users INSERT params and assert
 * no plan_events trial row was written.
 */
function fakeClient(captured: Captured[]) {
    return {
        query: async (sql: string, params: unknown[] = []) => {
            captured.push({ sql, params });
            if (sql.includes('FROM user_identities WHERE cognito_sub')) return { rows: [] };
            if (sql.includes('FROM users WHERE email')) return { rows: [] };
            if (sql.includes('INSERT INTO users')) return { rows: [{ id: 'new-user-id' }] };
            return { rows: [] };
        },
    };
}

const newUser = {
    email:          'new@example.com',
    fullName:       'New User',
    avatarUrl:      null,
    provider:       'google',
    providerUserId: 'g-1',
    cognitoSub:     'sub-1',
    role:           'user',
};

describe('upsertUserInTransaction — trials decommissioned', () => {
    it('inserts a new user with NULL trial columns', async () => {
        const captured: Captured[] = [];
        const result = await upsertUserInTransaction(fakeClient(captured) as never, newUser as never);
        expect(result.isNew).toBe(true);

        const insert = captured.find((c) => c.sql.includes('INSERT INTO users'));
        expect(insert).toBeDefined();
        // params: [email, fullName, avatarUrl, provider, role, trial_started_at, trial_ends_at]
        expect(insert!.params[5]).toBeNull();
        expect(insert!.params[6]).toBeNull();
    });

    it('does NOT write a trial_started plan_event for a new user', async () => {
        const captured: Captured[] = [];
        await upsertUserInTransaction(fakeClient(captured) as never, newUser as never);
        const trialEvent = captured.find(
            (c) => c.sql.includes('INSERT INTO plan_events') && c.sql.includes('trial_started'),
        );
        expect(trialEvent).toBeUndefined();
    });
});
