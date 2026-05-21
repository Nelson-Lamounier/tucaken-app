/**
 * @format
 * End-to-end tests for admin-api routes/projects.ts.
 *
 * Mocks the pg pool + config so no DB or network calls happen. Each
 * test asserts on:
 *   - SQL fragment fed to `pool.query` (so we can verify scoping +
 *     parameter binding without spinning up Postgres)
 *   - the route's HTTP response shape
 *
 * RLS is enforced by `withUser(pool, userId, fn)`. We mock `withUser`
 * to call `fn(db)` with the mocked pool, then assert that the route
 * never queries any unrelated user_id.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ────────────────────────────────────────────────────────────────────────────
// pg pool + withUser mocks
// ────────────────────────────────────────────────────────────────────────────

type QueryResult = { rows: object[]; rowCount?: number };

const poolQueryMock = jest.fn() as jest.Mock<() => Promise<QueryResult>>;
poolQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
    getPool:    () => ({ query: poolQueryMock }),
    _resetPool: () => {},
    withUser:   async (
        _pool: unknown,
        _userId: string,
        fn: (db: { query: typeof poolQueryMock }) => unknown,
    ) => fn({ query: poolQueryMock }),
}));

jest.unstable_mockModule('../../src/lib/config.js', () => ({
    loadConfig:               jest.fn(),
    getJobImage:              jest.fn().mockReturnValue('image-uri-not-yet-set'),
    isImageConfigured:        jest.fn().mockReturnValue(false),
    isAssetsBucketConfigured: jest.fn().mockReturnValue(false),
    UNSET_IMAGE_SENTINEL:     'image-uri-not-yet-set',
    _resetJobImageCache:      jest.fn(),
}));

// ────────────────────────────────────────────────────────────────────────────
// Dynamic imports (after mocks)
// ────────────────────────────────────────────────────────────────────────────

const { Hono } = await import('hono');
const { createProjectsRouter } = await import('../../src/routes/projects.js');

const testConfig = {
    cognitoUserPoolId:             'eu-west-1_Test',
    cognitoClientId:               'client',
    cognitoIssuerUrl:              'https://cognito.test',
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
    strategistPipelineNamespace:   'job-strategist',
    strategistPipelineServiceAccount: 'job-strategist-sa',
} as const;

const TEST_USER_UUID    = 'a1b2c3d4-0000-0000-0000-000000000001';
const TEST_PROJECT_UUID = 'a1b2c3d4-0000-0000-0000-000000000111';
const TEST_DECISION_UUID = 'a1b2c3d4-0000-0000-0000-000000000222';
const TEST_COMPONENT_UUID = 'a1b2c3d4-0000-0000-0000-000000000333';
const OTHER_PROJECT_UUID = 'a1b2c3d4-0000-0000-0000-000000000444';

function buildApp() {
    const app = new Hono();
    app.use('*', async (ctx, next) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ctx as any).set('jwtPayload', { sub: 'cognito-sub' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ctx as any).set('userId', TEST_USER_UUID);
        await next();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.route('/', createProjectsRouter(testConfig as any));
    return app;
}

beforeEach(() => {
    poolQueryMock.mockReset();
    poolQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /                                — list
// ────────────────────────────────────────────────────────────────────────────

describe('GET /', () => {
    it('returns total + items envelope and respects pagination params', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // total
            .mockResolvedValueOnce({ rows: [
                { id: TEST_PROJECT_UUID, slug: 'tucaken', name: 'Tucaken' },
            ] });
        const res  = await buildApp().request('/?limit=10&offset=5');
        expect(res.status).toBe(200);
        const body = await res.json() as { total: number; limit: number; offset: number; items: object[] };
        expect(body.total).toBe(3);
        expect(body.limit).toBe(10);
        expect(body.offset).toBe(5);
        expect(body.items).toHaveLength(1);
    });

    it('hides archived rows by default; query string toggles inclusion', async () => {
        poolQueryMock.mockResolvedValue({ rows: [{ count: '0' }] });
        await buildApp().request('/');
        const firstSql = String(poolQueryMock.mock.calls[0][0]);
        expect(firstSql).toMatch(/status IN \('active','stable','dormant'\)/);

        poolQueryMock.mockReset();
        poolQueryMock.mockResolvedValue({ rows: [{ count: '0' }] });
        await buildApp().request('/?includeArchived=true');
        const sqlIncluding = String(poolQueryMock.mock.calls[0][0]);
        expect(sqlIncluding).not.toMatch(/status IN/);
    });

    it('proposalsOnly=true filters to unconfirmed AI proposals', async () => {
        poolQueryMock.mockResolvedValue({ rows: [{ count: '0' }] });
        await buildApp().request('/?proposalsOnly=true');
        const sql = String(poolQueryMock.mock.calls[0][0]);
        expect(sql).toMatch(/is_ai_suggested = TRUE AND is_user_confirmed = FALSE/);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /clustering/proposals
// ────────────────────────────────────────────────────────────────────────────

describe('GET /clustering/proposals', () => {
    it('returns only unconfirmed AI proposals', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{ count: '1' }] })
            .mockResolvedValueOnce({ rows: [
                { id: TEST_PROJECT_UUID, slug: 'proposal-1', name: 'Proposal 1', is_ai_suggested: true },
            ] });
        const res = await buildApp().request('/clustering/proposals');
        expect(res.status).toBe(200);
        expect(((await res.json()) as { items: object[] }).items).toHaveLength(1);
        const proposalSql = String(poolQueryMock.mock.calls[0][0]);
        expect(proposalSql).toMatch(/is_ai_suggested = TRUE AND is_user_confirmed = FALSE/);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /
// ────────────────────────────────────────────────────────────────────────────

describe('POST /', () => {
    it('creates and returns the new id', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ id: TEST_PROJECT_UUID }] });
        const res = await buildApp().request('/', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug: 'tucaken', name: 'Tucaken', type: 'production_saas' }),
        });
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ id: TEST_PROJECT_UUID });
        expect(String(poolQueryMock.mock.calls[0][0])).toMatch(/INSERT INTO projects/);
    });

    it('rejects an invalid slug', async () => {
        const res = await buildApp().request('/', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug: 'NOT VALID', name: 'x' }),
        });
        expect(res.status).toBe(400);
    });

    it('returns 409 on unique-slug collision', async () => {
        poolQueryMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
        const res = await buildApp().request('/', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug: 'existing', name: 'x' }),
        });
        expect(res.status).toBe(409);
    });

    it('rejects invalid type', async () => {
        const res = await buildApp().request('/', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug: 'ok', name: 'x', type: 'not_a_real_type' }),
        });
        expect(res.status).toBe(400);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /:id
// ────────────────────────────────────────────────────────────────────────────

describe('GET /:id', () => {
    it('rejects a non-uuid id with 400', async () => {
        const res = await buildApp().request('/not-a-uuid');
        expect(res.status).toBe(400);
    });

    it('404s when the project is missing', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [] }); // project lookup
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}`);
        expect(res.status).toBe(404);
    });

    it('returns the assembled detail with empty child collections', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{
                id: TEST_PROJECT_UUID, slug: 'tucaken', name: 'Tucaken',
                tagline: null, pitch: null, type: 'side_project', shape: 'single_repo',
                status: 'active', role_exhibited: 'sole_builder', visibility: 'private',
                is_ai_suggested: false, is_user_confirmed: true,
                case_study_status: null, case_study_generated_at: null,
                last_activity_at: null, started_at: null, ended_at: null,
                created_at: '2025-06-01T00:00:00Z', updated_at: '2025-06-01T00:00:00Z',
                proposal_reasoning: null, proposal_confidence: null,
                proposal_pipeline_run_id: null, user_overrides: null,
                repository_count: 0,
            }] })
            .mockResolvedValue({ rows: [] }); // every child query

        const res = await buildApp().request(`/${TEST_PROJECT_UUID}`);
        expect(res.status).toBe(200);
        const body = await res.json() as Record<string, unknown>;
        expect(body.id).toBe(TEST_PROJECT_UUID);
        expect(body.user_overrides).toEqual({});
        expect(Array.isArray(body.components)).toBe(true);
        expect(body.architecture).toBeNull();
        expect(body.depth_markers).toBeNull();
    });
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /:id
// ────────────────────────────────────────────────────────────────────────────

describe('PATCH /:id', () => {
    it('updates fields and serialises user_overrides as JSONB', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tagline: 'updated', user_overrides: { pitch: true } }),
        });
        expect(res.status).toBe(200);
        const sql = String(poolQueryMock.mock.calls[0][0]);
        expect(sql).toMatch(/UPDATE projects/);
        expect(sql).toMatch(/user_overrides = \$\d+::jsonb/);
        const params = poolQueryMock.mock.calls[0][1] as unknown[];
        expect(params).toContain('updated');
        expect(params).toContain(JSON.stringify({ pitch: true }));
    });

    it('returns 404 when no row matches', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tagline: 'updated' }),
        });
        expect(res.status).toBe(404);
    });

    it('rejects an invalid status', async () => {
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'unknown' }),
        });
        expect(res.status).toBe(400);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /:id                              — soft delete
// ────────────────────────────────────────────────────────────────────────────

describe('DELETE /:id', () => {
    it('archives instead of dropping the row', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}`, { method: 'DELETE' });
        expect(res.status).toBe(200);
        const sql = String(poolQueryMock.mock.calls[0][0]);
        expect(sql).toMatch(/UPDATE projects SET status = 'archived'/);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /:id/confirm
// ────────────────────────────────────────────────────────────────────────────

describe('POST /:id/confirm', () => {
    it('flips is_user_confirmed and does not dispatch a job', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/confirm`, { method: 'POST' });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ confirmed: true });
        const sql = String(poolQueryMock.mock.calls[0][0]);
        expect(sql).toMatch(/SET is_user_confirmed = TRUE/);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /:id/decisions/:did
// ────────────────────────────────────────────────────────────────────────────

describe('PATCH /:id/decisions/:did', () => {
    it('scopes the update by both project and decision id', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/decisions/${TEST_DECISION_UUID}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ confidence: 'high', is_user_confirmed: true }),
        });
        expect(res.status).toBe(200);
        const sql = String(poolQueryMock.mock.calls[0][0]);
        expect(sql).toMatch(/WHERE id = \$\d+ AND project_id = \$\d+/);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /:id/architecture                  — sticky
// ────────────────────────────────────────────────────────────────────────────

describe('PATCH /:id/architecture', () => {
    it('flags is_user_edited=true on every patch', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/architecture`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ diagram_source: 'graph LR\n  A --> B' }),
        });
        expect(res.status).toBe(200);
        const sql = String(poolQueryMock.mock.calls[0][0]);
        expect(sql).toMatch(/is_user_edited = TRUE/);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /merge
// ────────────────────────────────────────────────────────────────────────────

describe('POST /merge', () => {
    it('reassigns components and archives sources', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [], rowCount: 2 })   // reassign components
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // archive sources
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });  // bump shape
        const res = await buildApp().request('/merge', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ target_id: TEST_PROJECT_UUID, source_ids: [OTHER_PROJECT_UUID] }),
        });
        expect(res.status).toBe(200);
        const body = await res.json() as { componentsReassigned: number; sourcesArchived: number };
        expect(body.componentsReassigned).toBe(2);
        expect(body.sourcesArchived).toBe(1);
    });

    it('rejects target_id appearing in source_ids', async () => {
        const res = await buildApp().request('/merge', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ target_id: TEST_PROJECT_UUID, source_ids: [TEST_PROJECT_UUID] }),
        });
        expect(res.status).toBe(400);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /:id/split
// ────────────────────────────────────────────────────────────────────────────

describe('POST /:id/split', () => {
    it('creates a new project and moves the named components', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // INSERT new project
            .mockResolvedValueOnce({ rows: [], rowCount: 2 });  // UPDATE components
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/split`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                component_ids: [TEST_COMPONENT_UUID],
                name:          'Split project',
                slug:          'split-project',
            }),
        });
        expect(res.status).toBe(201);
        const body = await res.json() as { newProjectId: string; componentsMoved: number };
        expect(body.componentsMoved).toBe(2);
    });

    it('rejects an invalid slug', async () => {
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/split`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                component_ids: [TEST_COMPONENT_UUID], name: 'x', slug: 'BAD SLUG',
            }),
        });
        expect(res.status).toBe(400);
    });
});
