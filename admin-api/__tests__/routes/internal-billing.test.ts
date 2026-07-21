/**
 * @format
 * Tests for the /api/internal/billing/webhook-seen idempotency route.
 *
 * The route claims a Stripe event id on first sight and reports duplicates so
 * the SSR webhook handler can skip re-processing. Mocks: pg pool only — the
 * markWebhookEventSeen repository runs its real SQL against the mock.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const poolQueryMock = jest.fn<() => Promise<{ rows: object[]; rowCount: number }>>();

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
    getPool:    () => ({ query: poolQueryMock }),
    _resetPool: () => {},
}));

const { Hono }                        = await import('hono');
const { createInternalBillingRouter } = await import('../../src/routes/internal-billing.js');

function buildApp() {
    const app = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.route('/api/internal/billing', createInternalBillingRouter({} as any));
    return app;
}

function postSeen(app: ReturnType<typeof buildApp>, body: object) {
    return app.request('/api/internal/billing/webhook-seen', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });
}

// eslint-disable-next-line jest/require-top-level-describe -- shared reset; intentional global hook
beforeEach(() => {
    jest.clearAllMocks();
});

describe('POST /api/internal/billing/webhook-seen', () => {
    it('claims a first-seen event id and reports alreadyProcessed: false', async () => {
        poolQueryMock.mockResolvedValue({ rows: [{ event_id: 'evt_123' }], rowCount: 1 });
        const res = await postSeen(buildApp(), { eventId: 'evt_123', type: 'invoice.paid' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ alreadyProcessed: false });
    });

    it('reports alreadyProcessed: true on a duplicate delivery', async () => {
        poolQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
        const res = await postSeen(buildApp(), { eventId: 'evt_123', type: 'invoice.paid' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ alreadyProcessed: true });
    });

    it('rejects event ids without the evt_ prefix', async () => {
        const res = await postSeen(buildApp(), { eventId: 'bogus', type: 'invoice.paid' });
        expect(res.status).toBe(400);
        expect(poolQueryMock).not.toHaveBeenCalled();
    });
});
