/**
 * @format
 * End-to-end tests for admin-api routes/github.ts
 *
 * Coverage:
 *   GET    /installation              — connected / not connected
 *   POST   /installation              — store installation, 400 on missing body
 *   DELETE /installation              — cascade delete + 404 when not connected
 *   GET    /repos                     — list via installation token
 *   GET    /connected-repos           — list with sync status join
 *   POST   /connected-repos           — insert + mark pending + dispatch Job
 *   DELETE /connected-repos/:fullName — delete repo + cascade embeddings
 *
 * Mocks: pg pool, github-app helpers, k8s BatchApi, config image resolver.
 * No real network calls or DB connections are made.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// github-app mock — replace all exported functions
// ---------------------------------------------------------------------------

const mockGenerateInstallationToken = jest.fn<() => Promise<string>>().mockResolvedValue('ghs_test_token');
const mockGetInstallationInfo       = jest.fn<() => Promise<{ accountLogin: string; accountAvatarUrl: string }>>()
    .mockResolvedValue({ accountLogin: 'nelson-lamounier', accountAvatarUrl: 'https://avatars.github.com/u/1' });
const mockListInstallationRepos     = jest.fn<() => Promise<object[]>>().mockResolvedValue([
    { id: 1, full_name: 'Nelson-Lamounier/cdk-monitoring',        owner: { login: 'Nelson-Lamounier' }, name: 'cdk-monitoring',        default_branch: 'develop', private: false, updated_at: '2026-04-29T00:00:00Z' },
    { id: 2, full_name: 'Nelson-Lamounier/kubernetes-bootstrap',   owner: { login: 'Nelson-Lamounier' }, name: 'kubernetes-bootstrap',  default_branch: 'develop', private: false, updated_at: '2026-04-29T00:00:00Z' },
]);
const mockDeleteInstallation        = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/lib/github-app.js', () => ({
    generateInstallationToken: mockGenerateInstallationToken,
    getInstallationInfo:       mockGetInstallationInfo,
    listInstallationRepos:     mockListInstallationRepos,
    deleteInstallation:        mockDeleteInstallation,
}));

// ---------------------------------------------------------------------------
// pg pool mock
// ---------------------------------------------------------------------------

const poolQueryMock = jest.fn() as jest.Mock<() => Promise<{ rows: object[] }>>;
poolQueryMock.mockResolvedValue({ rows: [] });

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
    getPool:    () => ({ query: poolQueryMock }),
    _resetPool: () => {},
}));

// ---------------------------------------------------------------------------
// K8s BatchApi mock
// ---------------------------------------------------------------------------

const createNamespacedJobMock = jest.fn<() => Promise<object>>().mockResolvedValue({});

jest.unstable_mockModule('../../src/lib/k8s.js', () => ({
    getBatchApi:    () => ({ createNamespacedJob: createNamespacedJobMock }),
    _resetBatchApi: () => {},
}));

// ---------------------------------------------------------------------------
// config image resolver mock
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../src/lib/config.js', () => ({
    loadConfig:           jest.fn(),
    getJobImage:          jest.fn().mockReturnValue('771826808455.dkr.ecr.eu-west-1.amazonaws.com/ingestion:latest'),
    isImageConfigured:    jest.fn().mockReturnValue(true),
    isAssetsBucketConfigured: jest.fn().mockReturnValue(false),
    UNSET_IMAGE_SENTINEL: 'image-uri-not-yet-set',
    _resetJobImageCache:  jest.fn(),
}));

// ---------------------------------------------------------------------------
// Dynamic imports (after mocks)
// ---------------------------------------------------------------------------

const { Hono }               = await import('hono');
const { createGitHubRouter } = await import('../../src/routes/github.js');

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

const testConfig = {
    cognitoUserPoolId:              'eu-west-1_Test',
    cognitoClientId:                'client',
    cognitoIssuerUrl:               'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_Test',
    awsRegion:                      'eu-west-1',
    port:                           3002,
    assetsBucketName:               undefined,
    githubAppId:                    '999999',
    githubPrivateKey:               '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
    pgHost:                         'pg',
    pgPort:                         5432,
    pgDatabase:                     'tucaken',
    pgUser:                         'postgres',
    pgPassword:                     'secret',
    ingestionNamespace:             'ingestion',
    ingestionServiceAccount:        'ingestion-sa',
    articlePipelineNamespace:       'article-pipeline',
    articlePipelineServiceAccount:  'article-pipeline-sa',
    strategistPipelineNamespace:    'job-strategist',
    strategistPipelineServiceAccount: 'job-strategist-sa',
} as const;

// Stable users.id UUID used across all test assertions.
const TEST_USER_UUID = 'a1b2c3d4-0000-0000-0000-000000000001';

function buildApp() {
    const app = new Hono();
    app.use('*', async (ctx, next) => {
         
        (ctx as any).set('jwtPayload', { sub: 'user-cognito-sub-123' });
        // userProvisionMiddleware sets users.id UUID on every authenticated request.
         
        (ctx as any).set('userId', TEST_USER_UUID);
        await next();
    });
     
    app.route('/', createGitHubRouter(testConfig as any));
    return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Seed poolQueryMock to return rows for specific SQL patterns. */
function seedQuery(rows: Row[]) {
    poolQueryMock.mockResolvedValueOnce({ rows });
}

/** Connected oauth_connections row */
const connectedRow: Row = {
    installation_id: '12345',
    username:        'nelson-lamounier',
    avatar_url:      'https://avatars.github.com/u/1',
    connected_at:    new Date('2026-04-29T10:00:00Z'),
};

/** Connected repo row (joins repositories + repo_sync_state + repository_profiles) */
const connectedRepoRow: Row = {
    full_name:          'Nelson-Lamounier/cdk-monitoring',
    default_branch:     'develop',
    index_status:       'pending',
    added_at:           new Date('2026-04-29T10:00:00Z'),
    sync_status:        'complete',
    last_synced_at:     new Date('2026-04-29T11:00:00Z'),
    file_count:         393,
    chunk_count:        1420,
    error_message:      null,
    quality_score:      0.80,
    quality_breakdown:  { has_readme: 0.25, has_manifest: 0.20, has_ci: 0.15, has_changelog: 0, has_tests: 0, commit_count: 0.10, confidence: 0.10 },
    classification:     'project',
    extraction_status:  'completed',
    one_liner:          'AWS CDK constructs for automated CloudWatch monitoring dashboards.',
    domain:             'devops',
    tech_stack:         ['TypeScript', 'AWS CDK', 'CloudWatch'],
    complexity:         'moderate',
    confidence:         0.90,
};

// eslint-disable-next-line jest/require-top-level-describe -- shared reset across all suites in this file; intentional global hook
beforeEach(() => {
    jest.clearAllMocks();
    poolQueryMock.mockResolvedValue({ rows: [] });
    mockGenerateInstallationToken.mockResolvedValue('ghs_test_token');
    mockGetInstallationInfo.mockResolvedValue({ accountLogin: 'nelson-lamounier', accountAvatarUrl: 'https://avatars.github.com/u/1' });
    mockListInstallationRepos.mockResolvedValue([
        { id: 1, full_name: 'Nelson-Lamounier/cdk-monitoring',       owner: { login: 'Nelson-Lamounier' }, name: 'cdk-monitoring',       default_branch: 'develop', private: false, updated_at: '2026-04-29T00:00:00Z' },
        { id: 2, full_name: 'Nelson-Lamounier/kubernetes-bootstrap',  owner: { login: 'Nelson-Lamounier' }, name: 'kubernetes-bootstrap', default_branch: 'develop', private: false, updated_at: '2026-04-29T00:00:00Z' },
    ]);
    createNamespacedJobMock.mockResolvedValue({});
});

// ===========================================================================
// GET /installation
// ===========================================================================

describe('GET /installation', () => {
    it('returns 404 when user has no GitHub connection', async () => {
        seedQuery([]);   // getConnection → empty

        const res  = await buildApp().request('/installation');
        const body = await res.json() as { error: string };

        expect(res.status).toBe(404);
        expect(body.error).toMatch(/Not connected/);
        expect(mockGenerateInstallationToken).not.toHaveBeenCalled();
    });

    it('returns installation details with live repo count', async () => {
        seedQuery([connectedRow]);   // getConnection

        const res  = await buildApp().request('/installation');
        const body = await res.json() as { installation: Record<string, unknown> };

        expect(res.status).toBe(200);
        expect(mockGenerateInstallationToken).toHaveBeenCalledWith(
            testConfig.githubAppId,
            testConfig.githubPrivateKey,
            '12345',
        );
        expect(mockListInstallationRepos).toHaveBeenCalledWith('ghs_test_token');
        expect(body.installation.installationId).toBe('12345');
        expect(body.installation.accountLogin).toBe('nelson-lamounier');
        expect(body.installation.repositoryCount).toBe(2);
    });
});

// ===========================================================================
// POST /installation
// ===========================================================================

describe('POST /installation', () => {
    it('returns 400 when body is missing installationId', async () => {
        const res  = await buildApp().request('/installation', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({}),
        });
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toMatch(/installationId/);
        expect(mockGetInstallationInfo).not.toHaveBeenCalled();
    });

    it('fetches account info and upserts connection (fresh install — no auto-dispatch)', async () => {
        // Fresh install: getConnection → null, then upsertConnection.
        // No auto-dispatch on fresh install (user picks repos via UI picker).
        const res = await buildApp().request('/installation', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ installationId: '12345' }),
        });

        expect(res.status).toBe(200);
        expect(mockGetInstallationInfo).toHaveBeenCalledWith(
            testConfig.githubAppId,
            testConfig.githubPrivateKey,
            '12345',
        );
        // getConnection (1) + upsertConnection (1)
        expect(poolQueryMock).toHaveBeenCalledTimes(2);
        const body = await res.json() as { success: boolean; queued: string[] };
        expect(body.success).toBe(true);
        expect(body.queued).toEqual([]);
        // No jobs dispatched on fresh install
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// DELETE /installation
// ===========================================================================

describe('DELETE /installation', () => {
    it('returns 404 when user is not connected', async () => {
        seedQuery([]);   // getConnection → empty

        const res = await buildApp().request('/installation', { method: 'DELETE' });
        expect(res.status).toBe(404);
        expect(poolQueryMock).toHaveBeenCalledTimes(1);
    });

    it('cascade-deletes embeddings → sync_state → repos → oauth in order', async () => {
        seedQuery([connectedRow]);   // getConnection

        const res  = await buildApp().request('/installation', { method: 'DELETE' });
        const body = await res.json() as { success: boolean };

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);

        // 1 (getConnection) + 4 (cascade deletes)
        expect(poolQueryMock).toHaveBeenCalledTimes(5);

        const calls = poolQueryMock.mock.calls.map(c => (c[0] as string).trim());
        expect(calls[1]).toMatch(/DELETE FROM document_embeddings/);
        expect(calls[2]).toMatch(/DELETE FROM repo_sync_state/);
        expect(calls[3]).toMatch(/DELETE FROM repositories/);
        expect(calls[4]).toMatch(/DELETE FROM oauth_connections/);

        // All deletes must be scoped to the authenticated user
        calls.slice(1).forEach(sql => {
            expect((sql as string)).toMatch(/user_id/);
        });
    });
});

// ===========================================================================
// GET /repos
// ===========================================================================

describe('GET /repos', () => {
    it('returns 404 when not connected', async () => {
        seedQuery([]);
        const res = await buildApp().request('/repos');
        expect(res.status).toBe(404);
    });

    it('generates installation token and returns accessible repos', async () => {
        seedQuery([connectedRow]);

        const res  = await buildApp().request('/repos');
        const body = await res.json() as { repos: object[] };

        expect(res.status).toBe(200);
        expect(mockGenerateInstallationToken).toHaveBeenCalledWith('999999', testConfig.githubPrivateKey, '12345');
        expect(body.repos).toHaveLength(2);
        expect((body.repos[0] as Record<string, unknown>)['fullName']).toBe('Nelson-Lamounier/cdk-monitoring');
        expect((body.repos[0] as Record<string, unknown>)['defaultBranch']).toBe('develop');
    });
});

// ===========================================================================
// GET /connected-repos
// ===========================================================================

describe('GET /connected-repos', () => {
    it('returns empty list when no repos connected', async () => {
        seedQuery([]);
        const res  = await buildApp().request('/connected-repos');
        const body = await res.json() as { repos: object[] };
        expect(res.status).toBe(200);
        expect(body.repos).toHaveLength(0);
    });

    it('returns repos with sync status from join', async () => {
        seedQuery([connectedRepoRow]);

        const res  = await buildApp().request('/connected-repos');
        const body = await res.json() as { repos: Array<Record<string, unknown>> };

        expect(res.status).toBe(200);
        expect(body.repos).toHaveLength(1);
        const repo = body.repos[0]!;
        expect(repo['repoFullName']).toBe('Nelson-Lamounier/cdk-monitoring');
        expect(repo['syncStatus']).toBe('complete');
        expect(repo['fileCount']).toBe(393);
        expect(repo['chunkCount']).toBe(1420);
        expect(repo['defaultBranch']).toBe('develop');
    });

    it('includes profile fields when profile exists', async () => {
        seedQuery([connectedRepoRow]);

        const res  = await buildApp().request('/connected-repos');
        const body = await res.json() as { repos: Array<Record<string, unknown>> };

        expect(res.status).toBe(200);
        const repo = body.repos[0]!;
        expect(repo['qualityScore']).toBe(0.80);
        expect(repo['classification']).toBe('project');
        expect(repo['extractionStatus']).toBe('completed');
        expect(repo['oneLiner']).toBe('AWS CDK constructs for automated CloudWatch monitoring dashboards.');
        expect(repo['domain']).toBe('devops');
        expect(repo['techStack']).toEqual(['TypeScript', 'AWS CDK', 'CloudWatch']);
        expect(repo['complexity']).toBe('moderate');
        expect(repo['confidence']).toBe(0.90);
        expect(repo['qualityBreakdown']).toMatchObject({ has_readme: 0.25, has_manifest: 0.20 });
    });

    it('returns null profile fields when repo has no profile', async () => {
        const rowWithoutProfile: Row = {
            full_name:         'Nelson-Lamounier/cdk-monitoring',
            default_branch:    'develop',
            index_status:      'pending',
            added_at:          new Date('2026-04-29T10:00:00Z'),
            sync_status:       'complete',
            last_synced_at:    new Date('2026-04-29T11:00:00Z'),
            file_count:        393,
            chunk_count:       1420,
            error_message:     null,
            quality_score:     null,
            quality_breakdown: null,
            classification:    null,
            extraction_status: null,
            one_liner:         null,
            domain:            null,
            tech_stack:        null,
            complexity:        null,
            confidence:        null,
        };
        seedQuery([rowWithoutProfile]);

        const res  = await buildApp().request('/connected-repos');
        const body = await res.json() as { repos: Array<Record<string, unknown>> };

        expect(res.status).toBe(200);
        const repo = body.repos[0]!;
        expect(repo['qualityScore']).toBeNull();
        expect(repo['qualityBreakdown']).toBeNull();
        expect(repo['classification']).toBeNull();
        expect(repo['extractionStatus']).toBeNull();
        expect(repo['oneLiner']).toBeNull();
        expect(repo['domain']).toBeNull();
        expect(repo['techStack']).toBeNull();
        expect(repo['complexity']).toBeNull();
        expect(repo['confidence']).toBeNull();
    });

    it('GET /connected-repos exposes highlights/isFeatured/featureRank/isHidden', async () => {
        const rowWithFlags: Row = {
            ...connectedRepoRow,
            highlights:   ['Built X', 'Shipped Y'],
            is_featured:  true,
            feature_rank: 2,
            is_hidden:    false,
        };
        seedQuery([rowWithFlags]);

        const app = buildApp();
        const res = await app.request('/connected-repos');
        expect(res.status).toBe(200);
        const body = await res.json() as { repos: Array<Record<string, unknown>> };
        expect(body.repos[0]).toMatchObject({
            highlights:  ['Built X', 'Shipped Y'],
            isFeatured:  true,
            featureRank: 2,
            isHidden:    false,
        });
    });
});

// ===========================================================================
// POST /connected-repos
// ===========================================================================

describe('POST /connected-repos', () => {
    it('returns 400 when GitHub is not connected', async () => {
        seedQuery([]);   // getConnection → empty

        const res = await buildApp().request('/connected-repos', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ repoFullName: 'Nelson-Lamounier/cdk-monitoring' }),
        });
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toMatch(/not connected/i);
    });

    it('returns 400 for invalid repoFullName format', async () => {
        seedQuery([connectedRow]);

        const res = await buildApp().request('/connected-repos', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ repoFullName: 'not-valid' }),
        });
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toMatch(/owner\/repo/);
    });

    it('inserts repo, marks pending, generates token, dispatches Job', async () => {
        seedQuery([connectedRow]);       // 1. getConnection
        seedQuery([]);                   // 2. plan SELECT (empty rows → defaults to 'free')
        seedQuery([{ count: 1 }]);       // 3. quota INSERT…RETURNING: count=1 → allowed
        // 4. insertRepository, 5. markRepoPending, 6. markSyncTriggered → default { rows: [] }

        const res  = await buildApp().request('/connected-repos', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ repoFullName: 'Nelson-Lamounier/cdk-monitoring', defaultBranch: 'develop' }),
        });
        const body = await res.json() as { status: string; repoFullName: string; jobName: string };

        expect(res.status).toBe(202);
        expect(body.status).toBe('queued');
        expect(body.repoFullName).toBe('Nelson-Lamounier/cdk-monitoring');
        expect(body.jobName).toMatch(/^ingestion-/);
        expect(body.jobName.length).toBeLessThanOrEqual(63);

        // getConnection (1) + plan SELECT (1) + quota INSERT…RETURNING (1, atomic)
        // + insertRepository (1) + markRepoPending (1) + markSyncTriggered (1)
        expect(poolQueryMock).toHaveBeenCalledTimes(6);

        // Installation token generated for this user's installation
        expect(mockGenerateInstallationToken).toHaveBeenCalledWith('999999', testConfig.githubPrivateKey, '12345');

        // K8s Job created
        expect(createNamespacedJobMock).toHaveBeenCalledTimes(1);

        // Job spec must inject per-user GITHUB_TOKEN (not rely on ingestion-secrets static token)
        const jobArg = (createNamespacedJobMock.mock.calls[0] as unknown as [{ body: { spec: { template: { spec: { containers: Array<{ env: Array<{ name: string; value: string }> }> } } } } }])[0];
        const envMap = Object.fromEntries(
            jobArg.body.spec.template.spec.containers[0]!.env.map(e => [e.name, e.value]),
        );
        expect(envMap['GITHUB_TOKEN']).toBe('ghs_test_token');
        // USER_ID is now the resolved users.id UUID (set by userProvisionMiddleware),
        // not the Cognito sub. All DB FK constraints use users.id.
        expect(envMap['USER_ID']).toBe(TEST_USER_UUID);
        expect(envMap['REPO_FULL_NAME']).toBe('Nelson-Lamounier/cdk-monitoring');
    });

    it('deferSync:true connects as pending without quota or Job dispatch', async () => {
        seedQuery([connectedRow]);   // 1. getConnection
        // 2. insertRepository, 3. markRepoPending → default { rows: [] }

        const res  = await buildApp().request('/connected-repos', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ repoFullName: 'Nelson-Lamounier/cdk-monitoring', defaultBranch: 'develop', deferSync: true }),
        });
        const body = await res.json() as { status: string; repoFullName: string; jobName: string | null };

        expect(res.status).toBe(202);
        expect(body).toEqual({ status: 'queued', repoFullName: 'Nelson-Lamounier/cdk-monitoring', jobName: null });

        // getConnection + insertRepository + markRepoPending only — no plan
        // SELECT, no quota INSERT, no markSyncTriggered.
        expect(poolQueryMock).toHaveBeenCalledTimes(3);
        const calls = poolQueryMock.mock.calls.map(c => (c[0] as string));
        expect(calls.some(s => /usage_quotas/.test(s))).toBe(false);
        expect(calls.some(s => /last_sync_triggered_at/.test(s))).toBe(false);

        // No token, no Job — sync is deferred to POST /connected-repos/sync.
        expect(mockGenerateInstallationToken).not.toHaveBeenCalled();
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// POST /connected-repos/sync
// ===========================================================================

describe('POST /connected-repos/sync', () => {
    it('returns 400 when GitHub is not connected', async () => {
        seedQuery([]);   // getConnection → empty

        const res = await buildApp().request('/connected-repos/sync', { method: 'POST' });
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toMatch(/not connected/i);
    });

    it('returns { started: 0 } when no repos are queued', async () => {
        seedQuery([connectedRow]);   // 1. getConnection
        seedQuery([]);               // 2. pending-repos SELECT → none

        const res  = await buildApp().request('/connected-repos/sync', { method: 'POST' });
        const body = await res.json() as { started: number };

        expect(res.status).toBe(200);
        expect(body).toEqual({ started: 0 });
        expect(mockGenerateInstallationToken).not.toHaveBeenCalled();
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });

    it('dispatches Jobs for every queued repo and returns the count', async () => {
        seedQuery([connectedRow]);                                                  // 1. getConnection
        seedQuery([                                                                 // 2. pending-repos SELECT
            { full_name: 'Nelson-Lamounier/cdk-monitoring',      default_branch: 'develop' },
            { full_name: 'Nelson-Lamounier/kubernetes-bootstrap', default_branch: 'develop' },
        ]);
        seedQuery([]);                 // 3. plan SELECT → free
        seedQuery([{ count: 1 }]);     // 4. quota INSERT…RETURNING repo 1 → allowed
        seedQuery([]); seedQuery([]); seedQuery([]); // 5-7 insert/markPending/markTriggered repo 1
        seedQuery([{ count: 2 }]);     // 8. quota INSERT…RETURNING repo 2 → allowed
        seedQuery([]); seedQuery([]); seedQuery([]); // 9-11 insert/markPending/markTriggered repo 2

        const res  = await buildApp().request('/connected-repos/sync', { method: 'POST' });
        const body = await res.json() as { started: number };

        expect(res.status).toBe(200);
        expect(body).toEqual({ started: 2 });

        expect(mockGenerateInstallationToken).toHaveBeenCalledWith('999999', testConfig.githubPrivateKey, '12345');
        expect(createNamespacedJobMock).toHaveBeenCalledTimes(2);

        const pendingSelect = (poolQueryMock.mock.calls[1]![0] as string);
        expect(pendingSelect).toMatch(/sync_status\s*=\s*'pending'/);
        expect(pendingSelect).toMatch(/last_sync_triggered_at\s+IS\s+NULL/);
    });
});

// ===========================================================================
// PATCH /connected-repos/:fullName/featured
// ===========================================================================

describe('PATCH /connected-repos/:fullName/featured', () => {
    it('enables: is_featured TRUE + feature_rank from MAX+1, 200', async () => {
        // Pool mock: UPDATE … RETURNING feature_rank resolves { rows:[{feature_rank:4}], rowCount:1 }
        poolQueryMock.mockResolvedValueOnce({ rows: [{ feature_rank: 4 }], rowCount: 1 });

        const app = buildApp();
        const res = await app.request('/connected-repos/octo%2Fapp/featured', {
            method: 'PATCH', body: JSON.stringify({ useInResume: true }),
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ repoFullName: 'octo/app', isFeatured: true, featureRank: 4 });
        const lastCall = poolQueryMock.mock.calls.at(-1);
        expect(String(lastCall?.[0])).toMatch(/UPDATE repository_profiles[\s\S]*is_featured\s*=\s*TRUE/i);
        expect(lastCall?.[1]).toEqual(expect.arrayContaining([expect.any(String), 'octo/app']));
    });

    it('disables: is_featured FALSE, feature_rank NULL, 200', async () => {
        // Pool mock: { rows:[{feature_rank:null}], rowCount:1 }
        poolQueryMock.mockResolvedValueOnce({ rows: [{ feature_rank: null }], rowCount: 1 });

        const app = buildApp();
        const res = await app.request('/connected-repos/octo%2Fapp/featured', {
            method: 'PATCH', body: JSON.stringify({ useInResume: false }),
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ isFeatured: false, featureRank: null });
    });

    it('404 when no profile row matches (rowCount 0)', async () => {
        // Pool mock: { rows:[], rowCount:0 }
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const app = buildApp();
        const res = await app.request('/connected-repos/octo%2Fapp/featured', {
            method: 'PATCH', body: JSON.stringify({ useInResume: true }),
        });
        expect(res.status).toBe(404);
    });

    it('400 on non-JSON body', async () => {
        const app = buildApp();
        const res = await app.request('/connected-repos/octo%2Fapp/featured', { method: 'PATCH', body: 'nope' });
        expect(res.status).toBe(400);
    });

    it('400 on non-boolean useInResume', async () => {
        const app = buildApp();
        const res = await app.request('/connected-repos/octo%2Fapp/featured', {
            method: 'PATCH', body: JSON.stringify({ useInResume: 'yes' }),
        });
        expect(res.status).toBe(400);
    });

    it('400 on bad repo name', async () => {
        const app = buildApp();
        const res = await app.request('/connected-repos/not-a-repo/featured', {
            method: 'PATCH', body: JSON.stringify({ useInResume: true }),
        });
        expect(res.status).toBe(400);
    });
});

// ===========================================================================
// DELETE /connected-repos/:fullName
// ===========================================================================

describe('DELETE /connected-repos/:fullName', () => {
    it('cascade-deletes embeddings, sync_state, and repo row', async () => {
        const res = await buildApp().request(
            `/connected-repos/${encodeURIComponent('Nelson-Lamounier/cdk-monitoring')}`,
            { method: 'DELETE' },
        );
        const body = await res.json() as { success: boolean };

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);

        // 3 deletes: document_embeddings, repo_sync_state, repositories
        expect(poolQueryMock).toHaveBeenCalledTimes(3);
        const calls = poolQueryMock.mock.calls.map(c => (c[0] as string).trim());
        expect(calls[0]).toMatch(/DELETE FROM document_embeddings/);
        expect(calls[1]).toMatch(/DELETE FROM repo_sync_state/);
        expect(calls[2]).toMatch(/DELETE FROM repositories/);

        // All deletes scoped to authenticated user
        calls.forEach(sql => expect(sql).toMatch(/user_id/));
    });

    it('returns 400 for an invalid encoded repo name', async () => {
        const res = await buildApp().request('/connected-repos/not-valid', { method: 'DELETE' });
        expect(res.status).toBe(400);
    });
});
