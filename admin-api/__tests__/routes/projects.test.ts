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

// ????????????????????????????????????????????????????????????????????????????
// pg pool + withUser mocks
// ????????????????????????????????????????????????????????????????????????????

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

const getJobImageMock       = jest.fn().mockReturnValue('eu-west-1.dkr.ecr/job-strategist:test');
const isImageConfiguredMock = jest.fn().mockReturnValue(true);
jest.unstable_mockModule('../../src/lib/config.js', () => ({
    loadConfig:               jest.fn(),
    getJobImage:              getJobImageMock,
    isImageConfigured:        isImageConfiguredMock,
    isAssetsBucketConfigured: jest.fn().mockReturnValue(false),
    UNSET_IMAGE_SENTINEL:     'image-uri-not-yet-set',
    _resetJobImageCache:      jest.fn(),
}));

// K8s + GitHub App mocks - dispatch endpoints exercise these.
const createNamespacedJobMock = jest.fn() as jest.Mock<() => Promise<void>>;
createNamespacedJobMock.mockResolvedValue(undefined);
jest.unstable_mockModule('../../src/lib/k8s.js', () => ({
    getBatchApi: () => ({ createNamespacedJob: createNamespacedJobMock }),
}));

const generateInstallationTokenMock = jest.fn() as jest.Mock<() => Promise<string>>;
generateInstallationTokenMock.mockResolvedValue('ghs_installation_token_TEST');
jest.unstable_mockModule('../../src/lib/github-app.js', () => ({
    generateInstallationToken: generateInstallationTokenMock,
}));

// ????????????????????????????????????????????????????????????????????????????
// Dynamic imports (after mocks)
// ????????????????????????????????????????????????????????????????????????????

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
    githubAppId:                   '111111',
    githubPrivateKey:              '-----BEGIN RSA PRIVATE KEY-----\nTEST\n-----END RSA PRIVATE KEY-----',
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
    createNamespacedJobMock.mockClear();
    createNamespacedJobMock.mockResolvedValue(undefined);
    generateInstallationTokenMock.mockClear();
    generateInstallationTokenMock.mockResolvedValue('ghs_installation_token_TEST');
});

// ????????????????????????????????????????????????????????????????????????????
// GET /                                - list
// ????????????????????????????????????????????????????????????????????????????

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

// ????????????????????????????????????????????????????????????????????????????
// GET /clustering/proposals
// ????????????????????????????????????????????????????????????????????????????

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

// ????????????????????????????????????????????????????????????????????????????
// POST /
// ????????????????????????????????????????????????????????????????????????????

describe('POST /', () => {
    it('creates and returns the new id', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ plan: 'pro', role: 'user', trial_started_at: null, trial_ends_at: null, subscription_status: 'active', stripe_customer_id: null, stripe_subscription_id: null, cancel_at_period_end: false, current_period_end: null, effective_plan: 'pro', trial_days_remaining: null }] }); // getUserPlanStatus -> pro plan (unlimited projects)
        poolQueryMock.mockResolvedValueOnce({ rows: [{ id: TEST_PROJECT_UUID }] }); // INSERT INTO projects
        const res = await buildApp().request('/', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug: 'tucaken', name: 'Tucaken', type: 'production_saas' }),
        });
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ id: TEST_PROJECT_UUID });
        expect(poolQueryMock.mock.calls.some(c => /INSERT INTO projects/.test(String(c[0])))).toBe(true);
    });

    it('rejects an invalid slug', async () => {
        const res = await buildApp().request('/', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug: 'NOT VALID', name: 'x' }),
        });
        expect(res.status).toBe(400);
    });

    it('returns 409 on unique-slug collision', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ plan: 'pro', role: 'user', trial_started_at: null, trial_ends_at: null, subscription_status: 'active', stripe_customer_id: null, stripe_subscription_id: null, cancel_at_period_end: false, current_period_end: null, effective_plan: 'pro', trial_days_remaining: null }] }); // getUserPlanStatus -> pro plan
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

// ????????????????????????????????????????????????????????????????????????????
// GET /:id
// ????????????????????????????????????????????????????????????????????????????

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

// ????????????????????????????????????????????????????????????????????????????
// PATCH /:id
// ????????????????????????????????????????????????????????????????????????????

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

// ????????????????????????????????????????????????????????????????????????????
// DELETE /:id                              - soft delete
// ????????????????????????????????????????????????????????????????????????????

describe('DELETE /:id', () => {
    it('archives instead of dropping the row', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}`, { method: 'DELETE' });
        expect(res.status).toBe(200);
        const sql = String(poolQueryMock.mock.calls[0][0]);
        expect(sql).toMatch(/UPDATE projects SET status = 'archived'/);
    });
});

// ????????????????????????????????????????????????????????????????????????????
// POST /:id/confirm
// ????????????????????????????????????????????????????????????????????????????

describe('POST /:id/confirm', () => {
    it('confirms + dispatches case-study Job when GitHub is connected', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{ status: 'active' }], rowCount: 1 })  // guard SELECT
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })                       // UPDATE confirm+pending
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })                       // archiveSupersededDefaults UPDATE ... RETURNING
            .mockResolvedValueOnce({ rows: [], rowCount: 1 });                      // INSERT pipeline_run

        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/confirm`, { method: 'POST' });
        expect(res.status).toBe(202);
        const body = await res.json() as { confirmed: boolean; dispatched: boolean; pipelineRunId: string; jobName: string; projectId: string };
        expect(body.confirmed).toBe(true);
        expect(body.dispatched).toBe(true);
        expect(body.projectId).toBe(TEST_PROJECT_UUID);
        expect(body.pipelineRunId).toMatch(/^[0-9a-f-]{36}$/);

        // Guard SQL + the confirm UPDATE.
        expect(String(poolQueryMock.mock.calls[0][0])).toMatch(/SELECT status FROM projects/);
        expect(String(poolQueryMock.mock.calls[1][0])).toMatch(/SET is_user_confirmed = TRUE/);
        expect(String(poolQueryMock.mock.calls[1][0])).toMatch(/case_study_status = 'pending'/);

        // Dispatched with triggeredBy='confirm' in metadata + the case-study command.
        // The case-study Job reads commits/PRs from RDS, so dispatch no longer
        // mints a GitHub token.
        expect(createNamespacedJobMock).toHaveBeenCalledTimes(1);
        const insertCall = poolQueryMock.mock.calls[3] as unknown as [string, unknown[]];
        const params = insertCall[1];
        const metadata = JSON.parse(params[4] as string) as { projectId: string; triggeredBy: string };
        expect(metadata.triggeredBy).toBe('confirm');
        const jobBody = (createNamespacedJobMock.mock.calls[0] as unknown as [{ body: { spec: { template: { spec: { containers: { command: string[]; env: { name: string; value: string }[] }[] } } }; metadata?: { labels?: { trigger?: string } } } }])[0].body;
        const container = jobBody.spec.template.spec.containers[0]!;
        expect(container.command).toEqual(['node', 'dist/run-case-study.js']);
        expect(jobBody.metadata?.labels?.trigger).toBe('confirm');
        // No GitHub token in the case-study Job env.
        expect(container.env.find((e) => e.name === 'GITHUB_TOKEN')).toBeUndefined();
    });

    it('archives superseded default projects and reports them in the response', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{ status: 'active' }], rowCount: 1 })          // guard SELECT
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })                               // UPDATE confirm+pending
            .mockResolvedValueOnce({ rows: [{ id: 'archived-1' }], rowCount: 1 })           // archiveSupersededDefaults UPDATE ... RETURNING
            .mockResolvedValueOnce({ rows: [], rowCount: 1 });                              // INSERT pipeline_run

        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/confirm`, { method: 'POST' });
        expect(res.status).toBe(202);
        const body = await res.json() as { confirmed: boolean; dispatched: boolean; archivedDefaults: string[] };
        expect(body.confirmed).toBe(true);
        expect(body.dispatched).toBe(true);
        expect(body.archivedDefaults).toContain('archived-1');
    });

    it('confirms without dispatching when the image is unresolved', async () => {
        isImageConfiguredMock.mockReturnValueOnce(false);
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{ status: 'active' }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // archiveSupersededDefaults

        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/confirm`, { method: 'POST' });
        expect(res.status).toBe(200);
        const body = await res.json() as { confirmed: boolean; dispatched: boolean; reason: string };
        expect(body.dispatched).toBe(false);
        expect(body.reason).toBe('image_not_configured');
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });

    it('confirms with dispatched=false when K8s rejects the Job', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{ status: 'active' }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // archiveSupersededDefaults
            .mockResolvedValueOnce({ rows: [{ installation_id: '999' }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 });
        createNamespacedJobMock.mockRejectedValueOnce(new Error('Conflict'));

        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/confirm`, { method: 'POST' });
        expect(res.status).toBe(200);
        const body = await res.json() as { confirmed: boolean; dispatched: boolean; reason: string };
        expect(body.dispatched).toBe(false);
        expect(body.reason).toBe('k8s_create_failed');
    });

    it('404s when the project is missing', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/confirm`, { method: 'POST' });
        expect(res.status).toBe(404);
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });

    it('409s when the project is archived', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ status: 'archived' }], rowCount: 1 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/confirm`, { method: 'POST' });
        expect(res.status).toBe(409);
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });
});

// ????????????????????????????????????????????????????????????????????????????
// PATCH /:id/decisions/:did
// ????????????????????????????????????????????????????????????????????????????

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

// ????????????????????????????????????????????????????????????????????????????
// PATCH /:id/architecture                  - sticky
// ????????????????????????????????????????????????????????????????????????????

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

// ????????????????????????????????????????????????????????????????????????????
// POST /merge
// ????????????????????????????????????????????????????????????????????????????

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

// ????????????????????????????????????????????????????????????????????????????
// POST /:id/split
// ????????????????????????????????????????????????????????????????????????????

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

// ????????????????????????????????????????????????????????????????????????????
// POST /clustering/run                  - dispatch
// ????????????????????????????????????????????????????????????????????????????

describe('POST /clustering/run', () => {
    it('inserts a pipeline_run + creates a K8s Job', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{ plan: 'pro' }], rowCount: 1 }) // SELECT plan (Pro gate)
            .mockResolvedValueOnce({ rows: [], rowCount: 1 });                // insert pipeline_run
        const res = await buildApp().request('/clustering/run', { method: 'POST' });
        expect(res.status).toBe(202);
        const body = await res.json() as { status: string; pipelineRunId: string; jobName: string };
        expect(body.status).toBe('queued');
        expect(body.pipelineRunId).toMatch(/^[0-9a-f-]{36}$/);
        expect(createNamespacedJobMock).toHaveBeenCalledTimes(1);
        const jobBody = (createNamespacedJobMock.mock.calls[0] as unknown as [{ body: { spec: { template: { spec: { containers: { command: string[]; env: { name: string; value: string }[] }[] } } } } }])[0].body;
        const container = jobBody.spec.template.spec.containers[0]!;
        expect(container.command).toEqual(['node', 'dist/run-clustering.js']);
        expect(container.env.find((e) => e.name === 'CLUSTERING_PIPELINE_RUN_ID')?.value).toBe(body.pipelineRunId);
        expect(container.env.find((e) => e.name === 'USER_ID')?.value).toBe(TEST_USER_UUID);
    });

    it('returns 502 when the image URI is unresolved', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ plan: 'pro' }], rowCount: 1 }); // SELECT plan (Pro gate)
        isImageConfiguredMock.mockReturnValueOnce(false);
        const res = await buildApp().request('/clustering/run', { method: 'POST' });
        expect(res.status).toBe(502);
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });

    it('returns 502 when K8s API rejects the Job', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{ plan: 'pro' }], rowCount: 1 }) // SELECT plan (Pro gate)
            .mockResolvedValueOnce({ rows: [], rowCount: 1 });                // insert pipeline_run
        createNamespacedJobMock.mockRejectedValueOnce(new Error('Conflict'));
        const res = await buildApp().request('/clustering/run', { method: 'POST' });
        expect(res.status).toBe(502);
    });

    it('returns 403 for a free-plan user', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ plan: 'free' }], rowCount: 1 }); // SELECT plan (Pro gate)
        const res = await buildApp().request('/clustering/run', { method: 'POST' });
        expect(res.status).toBe(403);
        expect((await res.json() as { error: string }).error).toMatch(/Pro/i);
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });

    it('proceeds (202) for a pro-plan user', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{ plan: 'pro' }], rowCount: 1 }) // SELECT plan (Pro gate)
            .mockResolvedValueOnce({ rows: [], rowCount: 1 });                // insert pipeline_run
        const res = await buildApp().request('/clustering/run', { method: 'POST' });
        expect(res.status).toBe(202);
    });
});

// ????????????????????????????????????????????????????????????????????????????
// POST /:id/regenerate                  - case-study dispatch
// ????????????????????????????????????????????????????????????????????????????

describe('POST /:id/regenerate', () => {
    it('dispatches the case-study Job for a confirmed project', async () => {
        poolQueryMock
            .mockResolvedValueOnce({ rows: [{ is_user_confirmed: true, status: 'active' }], rowCount: 1 }) // guard SELECT
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })                                              // UPDATE status='pending'
            .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                             // INSERT pipeline_run
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/regenerate`, { method: 'POST' });
        expect(res.status).toBe(202);
        const body = await res.json() as { status: string; pipelineRunId: string; projectId: string; jobName: string };
        expect(body.status).toBe('queued');
        expect(body.projectId).toBe(TEST_PROJECT_UUID);
        expect(createNamespacedJobMock).toHaveBeenCalledTimes(1);
        const jobBody = (createNamespacedJobMock.mock.calls[0] as unknown as [{ body: { spec: { template: { spec: { containers: { command: string[]; env: { name: string; value: string }[] }[] } } } } }])[0].body;
        const container = jobBody.spec.template.spec.containers[0]!;
        expect(container.command).toEqual(['node', 'dist/run-case-study.js']);
        // Case-study Job reads commits/PRs from RDS - no GitHub token injected.
        expect(container.env.find((e) => e.name === 'GITHUB_TOKEN')).toBeUndefined();
        expect(container.env.find((e) => e.name === 'PROJECT_ID')?.value).toBe(TEST_PROJECT_UUID);
    });

    it('404s when the project is missing', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/regenerate`, { method: 'POST' });
        expect(res.status).toBe(404);
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });

    it('409s when the project has not been confirmed', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ is_user_confirmed: false, status: 'active' }], rowCount: 1 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/regenerate`, { method: 'POST' });
        expect(res.status).toBe(409);
    });

    it('409s when the project is archived', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [{ is_user_confirmed: true, status: 'archived' }], rowCount: 1 });
        const res = await buildApp().request(`/${TEST_PROJECT_UUID}/regenerate`, { method: 'POST' });
        expect(res.status).toBe(409);
    });

});
