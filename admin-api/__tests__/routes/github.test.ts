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
    resolveHeadSha:            jest.fn<() => Promise<string>>().mockResolvedValue('deadbeef00000000'),
}));

// ---------------------------------------------------------------------------
// pg pool mock
// ---------------------------------------------------------------------------

const poolQueryMock = jest.fn() as jest.Mock<(sql?: string) => Promise<{ rows: object[]; rowCount?: number }>>;
poolQueryMock.mockResolvedValue({ rows: [] });

// connectRepoWithDefaultProject() acquires a client via pool.connect() and runs
// its repo-insert + default-project transaction on THAT client (not poolQueryMock).
// The txClient is fully self-contained — it answers BEGIN/COMMIT, the repo
// INSERT…RETURNING id, and the project_repositories guard itself, and never
// delegates to poolQueryMock. The guard reports an existing link so
// ensureDefaultProject no-ops (these E2E tests assert the route's own
// non-transaction DB sequence on poolQueryMock, not project creation).
const txClient = {
    query: jest.fn(async (sql?: string) => {
        if (typeof sql === 'string' && /INSERT INTO repositories/i.test(sql)) {
            return { rows: [{ id: 'repo-uuid-test' }], rowCount: 1 };
        }
        if (typeof sql === 'string' && /SELECT 1 FROM project_repositories/i.test(sql)) {
            return { rows: [{ '?column?': 1 }], rowCount: 1 };
        }
        // BEGIN / COMMIT / ROLLBACK and anything else stay on this client.
        return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
};

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
    getPool:    () => ({ query: poolQueryMock, connect: async () => txClient }),
    _resetPool: () => {},
}));

// ---------------------------------------------------------------------------
// K8s BatchApi mock
// ---------------------------------------------------------------------------

const createNamespacedJobMock = jest.fn<() => Promise<object>>().mockResolvedValue({});
const listNamespacedJobMock   = jest.fn<() => Promise<{ items: object[] }>>().mockResolvedValue({ items: [] });

jest.unstable_mockModule('../../src/lib/k8s.js', () => ({
    getBatchApi:    () => ({ createNamespacedJob: createNamespacedJobMock, listNamespacedJob: listNamespacedJobMock }),
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
    listNamespacedJobMock.mockResolvedValue({ items: [] });
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
// GET /connected-repos — read-time reconciliation of stuck repos
// ===========================================================================

describe('GET /connected-repos — reconciliation', () => {
    const REPO = 'Nelson-Lamounier/cdk-monitoring';
    const ANNOTATION = 'ingestion.tucaken.io/repo-full-name';

    function activeRow(status: 'pending' | 'syncing', triggeredAt: Date | null): Row {
        return { ...connectedRepoRow, sync_status: status, last_synced_at: null, last_sync_triggered_at: triggeredAt };
    }
    function failedJob(reason: string): object {
        return {
            metadata: { annotations: { [ANNOTATION]: REPO }, creationTimestamp: new Date().toISOString() },
            status:   { conditions: [{ type: 'Failed', status: 'True', reason }] },
        };
    }

    it('flips a syncing repo to error when its Job terminally failed', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [activeRow('syncing', new Date())] }); // listConnectedRepos #1
        listNamespacedJobMock.mockResolvedValueOnce({ items: [failedJob('BackoffLimitExceeded')] });
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });                     // UPDATE → error
        poolQueryMock.mockResolvedValueOnce({ rows: [{ ...connectedRepoRow, sync_status: 'error', error_message: "Indexing didn't finish for this repository. Please try again." }] }); // re-read

        const res  = await buildApp().request('/connected-repos');
        const body = await res.json() as { repos: Array<Record<string, unknown>> };

        expect(res.status).toBe(200);
        expect(body.repos[0]!['syncStatus']).toBe('error');
        // User-facing copy only — no internal reason codes leaked.
        expect(String(body.repos[0]!['errorMessage'])).toMatch(/didn't finish/i);
        expect(String(body.repos[0]!['errorMessage'])).not.toMatch(/BackoffLimit|DeadlineExceeded|k8s|job/i);
        // The error message written to the DB is the friendly constant.
        expect(String(poolQueryMock.mock.calls[1]![1]?.[2])).toMatch(/didn't finish/i);
        // Selector scopes to this app + the sanitized userId.
        expect(listNamespacedJobMock).toHaveBeenCalledWith(
            expect.objectContaining({ namespace: 'ingestion', labelSelector: expect.stringContaining('app=ingestion-worker') }),
        );
        // list #1, UPDATE, list #2
        expect(poolQueryMock).toHaveBeenCalledTimes(3);
        const update = String(poolQueryMock.mock.calls[1]![0]);
        expect(update).toMatch(/UPDATE repo_sync_state/);
        expect(update).toMatch(/sync_status\s*=\s*'error'/);
    });

    it('surfaces a friendlier message for a deadline-exceeded Job', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [activeRow('syncing', new Date())] });
        listNamespacedJobMock.mockResolvedValueOnce({ items: [failedJob('DeadlineExceeded')] });
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        poolQueryMock.mockResolvedValueOnce({ rows: [{ ...connectedRepoRow, sync_status: 'error' }] });

        await buildApp().request('/connected-repos');
        const errMsg = String(poolQueryMock.mock.calls[1]![1]?.[2]);
        expect(errMsg).toMatch(/too long/i);
        expect(errMsg).not.toMatch(/DeadlineExceeded|k8s|job/i);
    });

    it('leaves a syncing repo untouched while its Job is still active', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [activeRow('syncing', new Date())] });
        listNamespacedJobMock.mockResolvedValueOnce({ items: [{
            metadata: { annotations: { [ANNOTATION]: REPO }, creationTimestamp: new Date().toISOString() },
            status:   { active: 1 },
        }] });

        const res  = await buildApp().request('/connected-repos');
        const body = await res.json() as { repos: Array<Record<string, unknown>> };

        expect(body.repos[0]!['syncStatus']).toBe('syncing');
        // Only the initial list — no UPDATE, no re-read.
        expect(poolQueryMock).toHaveBeenCalledTimes(1);
    });

    it('flips an orphaned repo (no live Job, past grace) to error', async () => {
        const longAgo = new Date(Date.now() - 30 * 60 * 1_000);
        poolQueryMock.mockResolvedValueOnce({ rows: [activeRow('pending', longAgo)] });
        listNamespacedJobMock.mockResolvedValueOnce({ items: [] });
        poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        poolQueryMock.mockResolvedValueOnce({ rows: [{ ...connectedRepoRow, sync_status: 'error' }] });

        const res  = await buildApp().request('/connected-repos');
        const body = await res.json() as { repos: Array<Record<string, unknown>> };

        expect(body.repos[0]!['syncStatus']).toBe('error');
        expect(poolQueryMock).toHaveBeenCalledTimes(3);
    });

    it('leaves a recently-triggered repo with no Job alone (within grace)', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [activeRow('pending', new Date())] });
        listNamespacedJobMock.mockResolvedValueOnce({ items: [] });

        const res  = await buildApp().request('/connected-repos');
        const body = await res.json() as { repos: Array<Record<string, unknown>> };

        expect(body.repos[0]!['syncStatus']).toBe('pending');
        expect(poolQueryMock).toHaveBeenCalledTimes(1);
    });

    it('is best-effort: leaves status untouched when the K8s API call fails', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [activeRow('syncing', new Date())] });
        listNamespacedJobMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

        const res  = await buildApp().request('/connected-repos');
        const body = await res.json() as { repos: Array<Record<string, unknown>> };

        expect(res.status).toBe(200);
        expect(body.repos[0]!['syncStatus']).toBe('syncing');
        expect(poolQueryMock).toHaveBeenCalledTimes(1);
    });

    it('does not call the K8s API when no repo is active', async () => {
        poolQueryMock.mockResolvedValueOnce({ rows: [connectedRepoRow] }); // sync_status 'complete'
        await buildApp().request('/connected-repos');
        expect(listNamespacedJobMock).not.toHaveBeenCalled();
        expect(poolQueryMock).toHaveBeenCalledTimes(1);
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
        seedQuery([]);                   // 2. isSyncInFlight SELECT (empty → not in flight)
        seedQuery([]);                   // 3. plan SELECT (empty rows → defaults to 'free')
        seedQuery([{ count: 1 }]);       // 4. quota INSERT…RETURNING: count=1 → allowed
        seedQuery([{ repo_full_name: 'Nelson-Lamounier/cdk-monitoring' }]); // 5. tryClaimSyncSlot → claim won
        // The repo INSERT now runs inside connectRepoWithDefaultProject on a
        // dedicated transaction client (BEGIN/INSERT…RETURNING/guard/COMMIT) — it
        // does NOT go through poolQueryMock. 6. markSyncTriggered.

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

        // getConnection (1) + isSyncInFlight SELECT (1) + plan SELECT (1)
        // + quota INSERT…RETURNING (1, atomic) + tryClaimSyncSlot (1)
        // + markSyncTriggered (1). The repo INSERT runs on the transaction
        // client (pool.connect()), not poolQueryMock.
        expect(poolQueryMock).toHaveBeenCalledTimes(6);

        // Installation token generated for this user's installation
        expect(mockGenerateInstallationToken).toHaveBeenCalledWith('999999', testConfig.githubPrivateKey, '12345');

        // K8s Jobs created: 1 ingestion + 1 tech-extract (shadow-mode, additive)
        expect(createNamespacedJobMock).toHaveBeenCalledTimes(2);

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

    it('stamps unsanitized user-id + repo-full-name annotations for reconciliation', async () => {
        seedQuery([connectedRow]);       // getConnection
        seedQuery([]);                   // isSyncInFlight → not in flight
        seedQuery([]);                   // plan SELECT → 'free'
        seedQuery([{ count: 1 }]);       // quota INSERT…RETURNING → allowed
        seedQuery([{ repo_full_name: 'Nelson-Lamounier/cdk-monitoring' }]); // tryClaimSyncSlot → claim won

        await buildApp().request('/connected-repos', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ repoFullName: 'Nelson-Lamounier/cdk-monitoring', defaultBranch: 'develop' }),
        });

        const jobArg = (createNamespacedJobMock.mock.calls[0] as unknown as [{ body: { metadata: { annotations: Record<string, string> } } }])[0];
        expect(jobArg.body.metadata.annotations['ingestion.tucaken.io/user-id']).toBe(TEST_USER_UUID);
        expect(jobArg.body.metadata.annotations['ingestion.tucaken.io/repo-full-name']).toBe('Nelson-Lamounier/cdk-monitoring');
    });

    it('deferSync:true connects as pending without quota or Job dispatch', async () => {
        seedQuery([connectedRow]);   // 1. getConnection
        // The repo INSERT runs on the transaction client (connectRepoWithDefaultProject),
        // not poolQueryMock. 2. markRepoPending → default { rows: [] }.

        const res  = await buildApp().request('/connected-repos', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ repoFullName: 'Nelson-Lamounier/cdk-monitoring', defaultBranch: 'develop', deferSync: true }),
        });
        const body = await res.json() as { status: string; repoFullName: string; jobName: string | null };

        expect(res.status).toBe(202);
        expect(body).toEqual({ status: 'queued', repoFullName: 'Nelson-Lamounier/cdk-monitoring', jobName: null });

        // getConnection + markRepoPending only — no plan SELECT, no quota INSERT,
        // no markSyncTriggered. The repo INSERT is on the transaction client.
        expect(poolQueryMock).toHaveBeenCalledTimes(2);
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
        seedQuery([]); seedQuery([]);  // 5-6 markPending/markTriggered repo 1 (repo INSERT is on the tx client)
        seedQuery([{ count: 2 }]);     // 7. quota INSERT…RETURNING repo 2 → allowed
        seedQuery([]); seedQuery([]);  // 8-9 markPending/markTriggered repo 2 (repo INSERT is on the tx client)

        const res  = await buildApp().request('/connected-repos/sync', { method: 'POST' });
        const body = await res.json() as { started: number };

        expect(res.status).toBe(200);
        expect(body).toEqual({ started: 2 });

        expect(mockGenerateInstallationToken).toHaveBeenCalledWith('999999', testConfig.githubPrivateKey, '12345');
        // 2 ingestion Jobs + 2 tech-extract Jobs (shadow-mode, one per repo)
        expect(createNamespacedJobMock).toHaveBeenCalledTimes(4);

        const pendingSelect = (poolQueryMock.mock.calls[1]![0] as string);
        expect(pendingSelect).toMatch(/sync_status\s*=\s*'pending'/);
        expect(pendingSelect).toMatch(/last_sync_triggered_at\s+IS\s+NULL/);
    });
});

// ===========================================================================
// POST /connected-repos/:fullName/retry
// ===========================================================================

describe('POST /connected-repos/:fullName/retry', () => {
    it('400 when GitHub is not connected', async () => {
        seedQuery([]); // getConnection → empty
        const res = await buildApp().request('/connected-repos/octo%2Fapp/retry', { method: 'POST' });
        expect(res.status).toBe(400);
    });

    it('400 on invalid repo name', async () => {
        seedQuery([connectedRow]); // getConnection
        const res = await buildApp().request('/connected-repos/not-a-repo/retry', { method: 'POST' });
        expect(res.status).toBe(400);
    });

    it('404 when the repo is not connected to this user', async () => {
        seedQuery([connectedRow]); // getConnection
        seedQuery([]);             // ownership SELECT → none
        const res = await buildApp().request('/connected-repos/octo%2Fapp/retry', { method: 'POST' });
        expect(res.status).toBe(404);
    });

    it('re-dispatches without touching usage_quotas (no double charge)', async () => {
        seedQuery([connectedRow]);                       // 1. getConnection
        seedQuery([{ full_name: 'octo/app' }]);          // 2. ownership SELECT
        seedQuery([{ repo_full_name: 'octo/app' }]);     // 3. tryClaimSyncSlot → claim won
        // 4. markSyncTriggered → default { rows: [] }

        const res  = await buildApp().request('/connected-repos/octo%2Fapp/retry', { method: 'POST' });
        const body = await res.json() as { status: string; repoFullName: string; jobName: string };

        expect(res.status).toBe(202);
        expect(body.status).toBe('queued');
        expect(body.repoFullName).toBe('octo/app');
        expect(body.jobName).toMatch(/^ingestion-/);

        // A fresh Job is dispatched with the per-user token.
        expect(mockGenerateInstallationToken).toHaveBeenCalledWith('999999', testConfig.githubPrivateKey, '12345');
        // 1 ingestion Job + 1 tech-extract Job (shadow-mode, additive)
        expect(createNamespacedJobMock).toHaveBeenCalledTimes(2);

        // Crucially: quota is never read or incremented on retry.
        const sql = poolQueryMock.mock.calls.map(c => String(c[0]));
        expect(sql.some(s => /usage_quotas/.test(s))).toBe(false);
        // Force-reindex so the index rebuilds from scratch.
        const jobArg = (createNamespacedJobMock.mock.calls[0] as unknown as [{ body: { spec: { template: { spec: { containers: Array<{ env: Array<{ name: string; value: string }> }> } } } } }])[0];
        const envMap = Object.fromEntries(jobArg.body.spec.template.spec.containers[0]!.env.map(e => [e.name, e.value]));
        expect(envMap['FORCE_REINDEX']).toBe('true');
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
