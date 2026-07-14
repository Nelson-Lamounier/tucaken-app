/**
 * @format
 * End-to-end tests for admin-api routes/profile.ts
 *
 * Coverage:
 *   GET /summary — rollup/mirror/reveal/direction/reconciliation/diagnostic/timestamps
 *   GET /summary — 404 when no row
 *   GET /summary — null mirror/reveal/synthesis_refreshed_at mapping
 *
 * Mocks: pg pool, config.
 * No real network calls or DB connections are made.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// pg pool mock
// ---------------------------------------------------------------------------

const poolQueryMock = jest.fn() as jest.Mock<() => Promise<{ rows: object[] }>>;
poolQueryMock.mockResolvedValue({ rows: [] });

jest.unstable_mockModule('../../../lib/pg.js', () => ({
    getPool:    () => ({ query: poolQueryMock }),
    _resetPool: () => {},
}));

// ---------------------------------------------------------------------------
// config mock
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../../lib/config.js', () => ({
    loadConfig:               jest.fn(),
    getJobImage:              jest.fn().mockReturnValue('771826808455.dkr.ecr.eu-west-1.amazonaws.com/ingestion:latest'),
    isImageConfigured:        jest.fn().mockReturnValue(true),
    isAssetsBucketConfigured: jest.fn().mockReturnValue(false),
    UNSET_IMAGE_SENTINEL:     'image-uri-not-yet-set',
    _resetJobImageCache:      jest.fn(),
}));

// ---------------------------------------------------------------------------
// Dynamic imports (after mocks)
// ---------------------------------------------------------------------------

const { Hono }                 = await import('hono');
const { createProfileRouter }  = await import('../../account/profile.js');

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

const testConfig = {
    cognitoUserPoolId:             'eu-west-1_Test',
    cognitoClientId:               'client',
    cognitoIssuerUrl:              'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_Test',
    awsRegion:                     'eu-west-1',
    port:                          3002,
    assetsBucketName:              undefined,
    pgHost:                        'pg',
    pgPort:                        5432,
    pgDatabase:                    'tucaken',
    pgUser:                        'postgres',
    pgPassword:                    'secret',
    ingestionNamespace:            'ingestion',
    ingestionServiceAccount:       'ingestion-sa',
    articlePipelineNamespace:      'article-pipeline',
    articlePipelineServiceAccount: 'article-pipeline-sa',
    strategistPipelineNamespace:       'job-strategist',
    strategistPipelineServiceAccount:  'job-strategist-sa',
} as const;

const TEST_USER_UUID = 'a1b2c3d4-0000-0000-0000-000000000001';

function buildApp() {
    const app = new Hono();
    app.use('*', async (ctx, next) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ctx as any).set('jwtPayload', { sub: 'user-cognito-sub-123' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ctx as any).set('userId', TEST_USER_UUID);
        await next();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.route('/', createProfileRouter(testConfig as any));
    return app;
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
    poolQueryMock.mockReset();
    poolQueryMock.mockResolvedValue({ rows: [] });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /summary', () => {
    it('returns rollup/mirror/reveal/timestamps', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{
            rollup: { version: 1 }, mirror: { paragraph: 'p' },
            reveal: { reveals: [{ insight: 'i', evidence: 'role distribution' }] },
            refreshed_at: new Date('2026-01-02T00:00:00Z'),
            synthesis_refreshed_at: new Date('2026-01-02T00:01:00Z'),
        }] });
        const app = buildApp();
        const res = await app.request('/summary');
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            rollup: { version: 1 }, mirror: { paragraph: 'p' },
            reveal: { reveals: [{ insight: 'i', evidence: 'role distribution' }] },
            refreshedAt: '2026-01-02T00:00:00.000Z',
            synthesisRefreshedAt: '2026-01-02T00:01:00.000Z',
        });
    });

    it('404 when no row', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [] });
        const app = buildApp();
        expect((await app.request('/summary')).status).toBe(404);
    });

    it('maps null mirror/reveal/synthesis_refreshed_at', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{
            rollup: { version: 1 }, mirror: null, reveal: null,
            refreshed_at: new Date('2026-01-02T00:00:00Z'), synthesis_refreshed_at: null,
        }] });
        const app = buildApp();
        const body = await (await app.request('/summary')).json();
        expect(body).toMatchObject({ mirror: null, reveal: null, synthesisRefreshedAt: null });
    });

    it('GET /summary includes direction (and maps null)', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{
            rollup: { version: 1 }, mirror: null, reveal: null,
            direction: { archetypes: [{ archetype:'platform', fit:'strong', rationale:'domain mix' }], seniority: [], whatToDeepen: [] },
            refreshed_at: new Date('2026-01-02T00:00:00Z'), synthesis_refreshed_at: null,
        }] });
        const app = buildApp();
        const body = await (await app.request('/summary')).json();
        expect(body).toMatchObject({ direction: { archetypes: [{ archetype:'platform' }] } });
    });

    it('GET /summary maps null direction', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ rollup:{version:1}, mirror:null, reveal:null, direction:null, refreshed_at:new Date(), synthesis_refreshed_at:null }] });
        const app = buildApp();
        expect((await (await app.request('/summary')).json()).direction).toBeNull();
    });

    it('GET /summary includes reconciliation (and maps null)', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{
            rollup: { version: 1 }, mirror: null, reveal: null, direction: null,
            reconciliation: { unsupportedClaims: [{ claim:'c', resumeRef:'Acme', whyUnsupported:'w' }], undersold: [] },
            refreshed_at: new Date('2026-01-02T00:00:00Z'), synthesis_refreshed_at: null,
        }] });
        const app = buildApp();
        const body = await (await app.request('/summary')).json();
        expect(body).toMatchObject({ reconciliation: { unsupportedClaims: [{ claim:'c' }] } });
    });

    it('GET /summary maps null reconciliation', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ rollup:{version:1}, mirror:null, reveal:null, direction:null, reconciliation:null, refreshed_at:new Date(), synthesis_refreshed_at:null }] });
        const app = buildApp();
        expect((await (await app.request('/summary')).json()).reconciliation).toBeNull();
    });

    it('GET /summary includes diagnostic (and maps null)', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{
            rollup: { version: 1 }, mirror: null, reveal: null, direction: null, reconciliation: null,
            diagnostic: {
                overall: 78,
                components: {
                    profileDepth:            { score: 86, blockers: [] },
                    ragDepth:                { score: 70, blockers: ['No project repos with high KB quality'] },
                    directionConfidence:     { score: 80, blockers: [] },
                    reconciliationAlignment: { score: 80, blockers: [] },
                    resumeCoverage:          { score: 75, blockers: [] },
                },
                methodology: { version: 1, weights: { profileDepth:20, ragDepth:20, directionConfidence:20, reconciliationAlignment:20, resumeCoverage:20 }, notes: 'v1' },
                explanation: 'You score 78 because…',
            },
            refreshed_at: new Date('2026-01-02T00:00:00Z'), synthesis_refreshed_at: null,
        }] });
        const app = buildApp();
        const body = await (await app.request('/summary')).json();
        expect(body).toMatchObject({ diagnostic: { overall: 78 } });
        expect(body.diagnostic.components.ragDepth.blockers[0]).toBe('No project repos with high KB quality');
        expect(body.diagnostic.explanation).toBe('You score 78 because…');
    });

    it('GET /summary maps null diagnostic', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ rollup:{version:1}, mirror:null, reveal:null, direction:null, reconciliation:null, diagnostic:null, refreshed_at:new Date(), synthesis_refreshed_at:null }] });
        const app = buildApp();
        expect((await (await app.request('/summary')).json()).diagnostic).toBeNull();
    });
});
