/**
 * @format
 * End-to-end tests for the GitHub App webhook router
 * (createGitHubWebhookRouter in src/routes/github.ts).
 *
 * Coverage:
 *   - 501 when GITHUB_WEBHOOK_SECRET is not configured
 *   - 401 on invalid / missing HMAC signature
 *   - 400 on invalid JSON with a valid signature
 *   - 200 acknowledge-without-processing for unhandled events
 *   - installation.deleted  → cascade delete (user found) / direct delete (user unknown)
 *   - installation.created  → re-dispatch for already-linked users, no-op for fresh installs
 *   - push                  → happy-path dispatch, unconnected-repo skip, debounce
 *                             (running job + cooldown window), quota-exhausted skip
 *
 * Mocks: pg pool (SQL-pattern router), github-app helpers, k8s BatchApi,
 * config image resolver, ensureDefaultProject. No real network or DB.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// github-app mock
// ---------------------------------------------------------------------------

const mockGenerateInstallationToken = jest.fn<() => Promise<string>>().mockResolvedValue('ghs_test_token');

jest.unstable_mockModule('../../src/lib/github-app.js', () => ({
    generateInstallationToken: mockGenerateInstallationToken,
    getInstallationInfo:       jest.fn(),
    listInstallationRepos:     jest.fn(),
    deleteInstallation:        jest.fn(),
    resolveHeadSha:            jest.fn<() => Promise<string>>().mockResolvedValue('deadbeef00000000'),
}));

// ---------------------------------------------------------------------------
// pg pool mock — routes queries by SQL pattern off a per-test state object
// ---------------------------------------------------------------------------

const TEST_USER_UUID = 'a1b2c3d4-0000-0000-0000-000000000001';

interface DbState {
    user:         { user_id: string; plan: string } | null;
    repoConnected: boolean;
    syncState:    { sync_status: string | null; last_sync_triggered_at: Date | null } | null;
    quotaAllowed: boolean;
    connectedRepos: Array<{ full_name: string; default_branch: string }>;
}

const dbState: DbState = {
    user: null, repoConnected: false, syncState: null, quotaAllowed: true, connectedRepos: [],
};

const executedSql: string[] = [];

const poolQueryMock = jest.fn(async (sql?: string) => {
    const s = typeof sql === 'string' ? sql : '';
    executedSql.push(s);
    if (/SELECT oc\.user_id::text, u\.plan/i.test(s)) {
        return { rows: dbState.user ? [dbState.user] : [], rowCount: dbState.user ? 1 : 0 };
    }
    if (/SELECT full_name FROM repositories/i.test(s)) {
        return { rows: dbState.repoConnected ? [{ full_name: 'nelson/repo-a' }] : [], rowCount: dbState.repoConnected ? 1 : 0 };
    }
    if (/SELECT sync_status, last_sync_triggered_at/i.test(s)) {
        return { rows: dbState.syncState ? [dbState.syncState] : [], rowCount: dbState.syncState ? 1 : 0 };
    }
    if (/INSERT INTO usage_quotas/i.test(s)) {
        return { rows: dbState.quotaAllowed ? [{ count: 1 }] : [], rowCount: dbState.quotaAllowed ? 1 : 0 };
    }
    if (/FROM repositories r/i.test(s)) {
        return { rows: dbState.connectedRepos, rowCount: dbState.connectedRepos.length };
    }
    return { rows: [], rowCount: 0 };
});

// connectRepoWithDefaultProject runs its transaction on a dedicated client.
const txClient = {
    query: jest.fn(async (sql?: string) => {
        if (typeof sql === 'string' && /INSERT INTO repositories/i.test(sql)) {
            return { rows: [{ id: 'repo-uuid-test' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
};

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
    getPool:    () => ({ query: poolQueryMock, connect: async () => txClient }),
    _resetPool: () => {},
}));

jest.unstable_mockModule('../../src/lib/repositories/projects.js', () => ({
    ensureDefaultProject: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// K8s BatchApi + config image resolver mocks
// ---------------------------------------------------------------------------

const createNamespacedJobMock = jest.fn<() => Promise<object>>().mockResolvedValue({});
const listNamespacedJobMock   = jest.fn<() => Promise<{ items: object[] }>>().mockResolvedValue({ items: [] });

jest.unstable_mockModule('../../src/lib/k8s.js', () => ({
    getBatchApi:    () => ({ createNamespacedJob: createNamespacedJobMock, listNamespacedJob: listNamespacedJobMock }),
    _resetBatchApi: () => {},
}));

jest.unstable_mockModule('../../src/lib/config.js', () => ({
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

const { Hono }                      = await import('hono');
const { createGitHubWebhookRouter } = await import('../../src/routes/github.js');

// ---------------------------------------------------------------------------
// Test config + helpers
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = 'unit-test-webhook-secret';

const testConfig = {
    awsRegion:               'eu-west-1',
    githubAppId:             '999999',
    githubPrivateKey:        '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
    githubWebhookSecret:     WEBHOOK_SECRET,
    ingestionNamespace:      'ingestion',
    ingestionServiceAccount: 'ingestion-sa',
} as const;

function buildApp(config: Record<string, unknown> = testConfig) {
    const app = new Hono();
    // Mirrors production mounting: app.route('/api/github', createGitHubWebhookRouter(cfg))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.route('/api/github', createGitHubWebhookRouter(config as any));
    return app;
}

function sign(body: string, secret: string = WEBHOOK_SECRET): string {
    return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

function post(app: ReturnType<typeof buildApp>, event: string, payload: object, opts: { signature?: string } = {}) {
    const body = JSON.stringify(payload);
    return app.request('/api/github/webhook', {
        method: 'POST',
        headers: {
            'Content-Type':        'application/json',
            'X-GitHub-Event':      event,
            'X-Hub-Signature-256': opts.signature ?? sign(body),
        },
        body,
    });
}

// eslint-disable-next-line jest/require-top-level-describe -- shared reset across suites; intentional global hook
beforeEach(() => {
    jest.clearAllMocks();
    executedSql.length = 0;
    dbState.user           = null;
    dbState.repoConnected  = false;
    dbState.syncState      = null;
    dbState.quotaAllowed   = true;
    dbState.connectedRepos = [];
    mockGenerateInstallationToken.mockResolvedValue('ghs_test_token');
    createNamespacedJobMock.mockResolvedValue({});
});

// ===========================================================================
// Signature / configuration gates
// ===========================================================================

describe('POST /webhook — gates', () => {
    it('returns 501 when the webhook secret is not configured', async () => {
        const app = buildApp({ ...testConfig, githubWebhookSecret: undefined });
        const res = await post(app, 'push', { any: 'thing' });
        expect(res.status).toBe(501);
        expect(executedSql).toHaveLength(0);
    });

    it('returns 401 on an invalid signature and touches nothing', async () => {
        const app = buildApp();
        const res = await post(app, 'push', { any: 'thing' }, { signature: sign('{"other":"body"}') });
        expect(res.status).toBe(401);
        expect(executedSql).toHaveLength(0);
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });

    it('returns 401 when the signature header is missing', async () => {
        const app  = buildApp();
        const body = JSON.stringify({ any: 'thing' });
        const res  = await app.request('/api/github/webhook', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'push' },
            body,
        });
        expect(res.status).toBe(401);
    });

    it('returns 400 on invalid JSON carrying a valid signature', async () => {
        const app  = buildApp();
        const body = 'not-json{';
        const res  = await app.request('/api/github/webhook', {
            method:  'POST',
            headers: {
                'Content-Type':        'application/json',
                'X-GitHub-Event':      'push',
                'X-Hub-Signature-256': sign(body),
            },
            body,
        });
        expect(res.status).toBe(400);
    });

    it('acknowledges unhandled event types with 200 and no processing', async () => {
        const app = buildApp();
        const res = await post(app, 'issues', { action: 'opened' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// installation.deleted
// ===========================================================================

describe('POST /webhook — installation.deleted', () => {
    it('cascade-deletes user data when the installation maps to a user', async () => {
        dbState.user = { user_id: TEST_USER_UUID, plan: 'free' };
        const app = buildApp();
        const res = await post(app, 'installation', { action: 'deleted', installation: { id: 12345 } });
        expect(res.status).toBe(200);
        // deleteConnection ordering: embeddings → sync state → repositories → oauth_connections
        const deletes = executedSql.filter((s) => /^\s*DELETE FROM/i.test(s));
        expect(deletes[0]).toMatch(/DELETE FROM document_embeddings/i);
        expect(deletes[1]).toMatch(/DELETE FROM repo_sync_state/i);
        expect(deletes[2]).toMatch(/DELETE FROM repositories/i);
        expect(deletes[3]).toMatch(/DELETE FROM oauth_connections/i);
    });

    it('falls back to a direct oauth_connections delete when no user matches', async () => {
        dbState.user = null;
        const app = buildApp();
        const res = await post(app, 'installation', { action: 'deleted', installation: { id: 12345 } });
        expect(res.status).toBe(200);
        const deletes = executedSql.filter((s) => /^\s*DELETE FROM/i.test(s));
        expect(deletes).toHaveLength(1);
        expect(deletes[0]).toMatch(/DELETE FROM oauth_connections/i);
        expect(deletes[0]).toMatch(/installation_id/i);
    });
});

// ===========================================================================
// installation.created — Option B safety net
// ===========================================================================

describe('POST /webhook — installation.created', () => {
    it('re-dispatches existing KB repos when the user is already linked', async () => {
        dbState.user           = { user_id: TEST_USER_UUID, plan: 'free' };
        dbState.connectedRepos = [{ full_name: 'nelson/repo-a', default_branch: 'main' }];
        const app = buildApp();
        const res = await post(app, 'installation', { action: 'created', installation: { id: 12345 } });
        expect(res.status).toBe(200);
        expect(mockGenerateInstallationToken).toHaveBeenCalledWith('999999', expect.any(String), '12345');
        // Ingestion + tech-extractor Jobs are both dispatched.
        expect(createNamespacedJobMock).toHaveBeenCalled();
        const namespaces = createNamespacedJobMock.mock.calls.map((c) => (c[0] as { namespace: string }).namespace);
        expect(namespaces).toContain('ingestion');
    });

    it('does nothing for a fresh install (user not yet linked)', async () => {
        dbState.user = null;
        const app = buildApp();
        const res = await post(app, 'installation', { action: 'created', installation: { id: 12345 } });
        expect(res.status).toBe(200);
        expect(mockGenerateInstallationToken).not.toHaveBeenCalled();
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// push — incremental re-index
// ===========================================================================

const PUSH_PAYLOAD = {
    installation: { id: 12345 },
    repository:   { full_name: 'nelson/repo-a' },
};

describe('POST /webhook — push', () => {
    it('dispatches an incremental re-index when connected, cool and within quota', async () => {
        dbState.user          = { user_id: TEST_USER_UUID, plan: 'free' };
        dbState.repoConnected = true;
        dbState.syncState     = null; // never synced — no debounce
        const app = buildApp();
        const res = await post(app, 'push', PUSH_PAYLOAD);
        expect(res.status).toBe(200);
        // Quota charged, repo marked pending, cooldown stamped.
        expect(executedSql.some((s) => /INSERT INTO usage_quotas/i.test(s))).toBe(true);
        expect(executedSql.some((s) => /INSERT INTO repo_sync_state/i.test(s))).toBe(true);
        expect(executedSql.some((s) => /SET last_sync_triggered_at/i.test(s))).toBe(true);
        // Ingestion Job created in the ingestion namespace.
        const namespaces = createNamespacedJobMock.mock.calls.map((c) => (c[0] as { namespace: string }).namespace);
        expect(namespaces).toContain('ingestion');
    });

    it('ignores pushes for repos not connected to the KB', async () => {
        dbState.user          = { user_id: TEST_USER_UUID, plan: 'free' };
        dbState.repoConnected = false;
        const app = buildApp();
        const res = await post(app, 'push', PUSH_PAYLOAD);
        expect(res.status).toBe(200);
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });

    it('skips when a sync job is already running (debounce on status)', async () => {
        dbState.user          = { user_id: TEST_USER_UUID, plan: 'free' };
        dbState.repoConnected = true;
        dbState.syncState     = { sync_status: 'syncing', last_sync_triggered_at: null };
        const app = buildApp();
        const res = await post(app, 'push', PUSH_PAYLOAD);
        expect(res.status).toBe(200);
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
        expect(executedSql.some((s) => /INSERT INTO usage_quotas/i.test(s))).toBe(false);
    });

    it('skips inside the 30-minute cooldown window', async () => {
        dbState.user          = { user_id: TEST_USER_UUID, plan: 'free' };
        dbState.repoConnected = true;
        dbState.syncState     = {
            sync_status:            'complete',
            last_sync_triggered_at: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
        };
        const app = buildApp();
        const res = await post(app, 'push', PUSH_PAYLOAD);
        expect(res.status).toBe(200);
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
    });

    it('dispatches once the cooldown has elapsed', async () => {
        dbState.user          = { user_id: TEST_USER_UUID, plan: 'free' };
        dbState.repoConnected = true;
        dbState.syncState     = {
            sync_status:            'complete',
            last_sync_triggered_at: new Date(Date.now() - 31 * 60 * 1000), // 31 min ago
        };
        const app = buildApp();
        const res = await post(app, 'push', PUSH_PAYLOAD);
        expect(res.status).toBe(200);
        expect(createNamespacedJobMock).toHaveBeenCalled();
    });

    it('skips when the monthly quota is exhausted', async () => {
        dbState.user          = { user_id: TEST_USER_UUID, plan: 'free' };
        dbState.repoConnected = true;
        dbState.quotaAllowed  = false;
        const app = buildApp();
        const res = await post(app, 'push', PUSH_PAYLOAD);
        expect(res.status).toBe(200);
        expect(createNamespacedJobMock).not.toHaveBeenCalled();
        // No pending mark, no cooldown stamp when quota rejects.
        expect(executedSql.some((s) => /INSERT INTO repo_sync_state/i.test(s))).toBe(false);
    });

    it('acknowledges pushes with missing installation or repository fields', async () => {
        const app = buildApp();
        const res = await post(app, 'push', { repository: { full_name: 'nelson/repo-a' } });
        expect(res.status).toBe(200);
        expect(executedSql).toHaveLength(0);
    });
});
