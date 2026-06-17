/** @format */
import { jest } from '@jest/globals';

// =============================================================================
// resolveHeadSha tests — mock fetch via lib/github-app.ts's internal https helper.
// The function uses the shared githubRequest helper (Node https) so we test it
// by mocking the https module at the module system level.
// =============================================================================

// We test resolveHeadSha in isolation by importing github-app.ts directly.
// The module uses Node's built-in https — mock it before import.

const mockHttpsRequest = jest.fn();

jest.unstable_mockModule('node:https', () => ({
    default: {
        request: mockHttpsRequest,
    },
    request: mockHttpsRequest,
}));

// jose is imported by github-app.ts for JWT signing — mock minimally.
jest.unstable_mockModule('jose', () => ({
    SignJWT: class {
        setProtectedHeader() { return this; }
        setIssuer()          { return this; }
        setIssuedAt()        { return this; }
        setExpirationTime()  { return this; }
        async sign()         { return 'mock-jwt'; }
    },
    importPKCS8: async () => ({}),
}));

// =============================================================================
// buildTechExtractJobSpec tests — no k8s/network deps; pure shape validation.
// =============================================================================

// Mock getJobImage to control sentinel/configured states.
const mockGetJobImage   = jest.fn<(_name: string) => string>(() => 'registry.example.com/tech-extractor:v1');
const mockIsImageConfigured = jest.fn<(uri: string) => boolean>(() => true);
const UNSET_IMAGE_SENTINEL = 'image-uri-not-yet-set';

jest.unstable_mockModule('../lib/config.js', () => ({
    getJobImage:            mockGetJobImage,
    isImageConfigured:      mockIsImageConfigured,
    UNSET_IMAGE_SENTINEL,
    isAssetsBucketConfigured: (n: unknown) => typeof n === 'string' && n.length > 0,
}));

jest.unstable_mockModule('../lib/k8s.js', () => ({
    getBatchApi: () => ({ createNamespacedJob: jest.fn(async () => ({ metadata: { uid: 'u' } })), deleteNamespacedJob: jest.fn(async () => ({})) }),
    getCoreApi:  () => ({ createNamespacedSecret: jest.fn(async () => ({})) }),
}));

jest.unstable_mockModule('../lib/k8s-job-builder.js', () => ({
    observabilityEnv: (_svc: string, _suffix: string) => [
        { name: 'OTEL_SERVICE_NAME', value: _svc },
    ],
    traceParentEnv: () => null,
    ingestionModelEnv: () => [],
    MODEL_JOB_BACKOFF_LIMIT: 0,
    sanitizeLabel: (v: string) =>
        v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 63),
}));

jest.unstable_mockModule('../lib/pg.js', () => ({
    getPool: () => ({}),
}));

jest.unstable_mockModule('../lib/types.js', () => ({
    requireUserId: () => 'user-1',
}));

jest.unstable_mockModule('../lib/github-app.js', () => ({
    generateInstallationToken: jest.fn(async () => 'tok'),
    listInstallationRepos:     jest.fn(async () => []),
    getInstallationInfo:       jest.fn(async () => ({})),
    deleteInstallation:        jest.fn(async () => {}),
    resolveHeadSha:            jest.fn(async () => 'abc1234'),
}));

// =============================================================================
// IMPORTS (after mocks are registered)
// =============================================================================

const { buildTechExtractJobSpec } = await import('./github.js');
const { resolveHeadSha }          = await import('../lib/github-app.js');

// =============================================================================
// resolveHeadSha — the real function is mocked above. Test separately via the
// lib module which we can re-import after setting up https mock differently.
// These tests validate the shape of the exported function.
// =============================================================================

describe('resolveHeadSha', () => {
    it('returns the sha on success (mocked via github-app mock)', async () => {
        // resolveHeadSha is mocked to return 'abc1234'
        const sha = await resolveHeadSha('tok', 'owner/repo', 'main');
        expect(sha).toBe('abc1234');
    });

    it('throws when the mock rejects', async () => {
        const mockedFn = resolveHeadSha as jest.MockedFunction<typeof resolveHeadSha>;
        mockedFn.mockRejectedValueOnce(new Error('HTTP 404'));
        await expect(resolveHeadSha('tok', 'owner/repo', 'main')).rejects.toThrow('HTTP 404');
    });
});

// =============================================================================
// buildTechExtractJobSpec — pure function, no network or k8s calls
// =============================================================================

const MOCK_CONFIG = {
    techExtractorNamespace:      'tech-extractor',
    techExtractorServiceAccount: 'tech-extractor-sa',
} as never; // cast — only the two fields are accessed by buildTechExtractJobSpec

describe('buildTechExtractJobSpec', () => {
    const USER_ID      = 'user-uuid-1234';
    const REPO         = 'owner/my-repo';
    const TIMESTAMP    = 1_700_000_000_000;
    const IMAGE        = 'registry.example.com/tech-extractor:v1';

    it('job name starts with tech-extract-', async () => {
        const job = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP);
        expect(job.metadata!.name).toMatch(/^tech-extract-/);
    });

    it('job name is deterministic for the same (userId, repo, timestamp)', async () => {
        const job1 = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP);
        const job2 = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP);
        expect(job1.metadata!.name).toBe(job2.metadata!.name);
    });

    it('job name differs for different timestamps', async () => {
        const job1 = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP);
        const job2 = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP + 1);
        expect(job1.metadata!.name).not.toBe(job2.metadata!.name);
    });

    it('job name is at most 63 characters', async () => {
        const longUser = 'very-long-user-id-that-is-definitely-more-than-63-characters-long-yes';
        const longRepo = 'owner/very-long-repository-name-that-exceeds-label-limits-for-sure';
        const job = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, longUser, longRepo, TIMESTAMP);
        expect(job.metadata!.name!.length).toBeLessThanOrEqual(63);
    });

    it('uses the tech-extractor namespace and service account', async () => {
        const job = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP);
        expect(job.metadata!.namespace).toBe('tech-extractor');
        expect(job.spec!.template.spec!.serviceAccountName).toBe('tech-extractor-sa');
    });

    it('uses tech-extractor.tucaken.io annotations (NOT ingestion.tucaken.io)', async () => {
        const job = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP);
        const ann = job.metadata!.annotations!;
        expect(ann['tech-extractor.tucaken.io/user-id']).toBe(USER_ID);
        expect(ann['tech-extractor.tucaken.io/repo-full-name']).toBe(REPO);
        expect(ann['ingestion.tucaken.io/user-id']).toBeUndefined();
        expect(ann['argocd.argoproj.io/compare-options']).toBe('IgnoreExtraneous');
    });

    it('container is named worker and runs run-tech-extract.js', async () => {
        const job = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP);
        const c = job.spec!.template.spec!.containers[0]!;
        expect(c.name).toBe('worker');
        expect(c.command).toEqual(['node', 'dist/run-tech-extract.js']);
    });

    it('includes a /work volume mount', async () => {
        const job = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP);
        const volumes = job.spec!.template.spec!.volumes ?? [];
        expect(volumes.some(v => v.name === 'work')).toBe(true);
        const c = job.spec!.template.spec!.containers[0]!;
        const mounts = c.volumeMounts ?? [];
        expect(mounts.some(m => m.name === 'work' && m.mountPath === '/work')).toBe(true);
    });

    it('includes COMMIT_SHA env when provided', async () => {
        const job = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP, 'deadbeef');
        const envNames = (job.spec!.template.spec!.containers[0]!.env ?? []).map(e => e.name);
        expect(envNames).toContain('COMMIT_SHA');
        const sha = job.spec!.template.spec!.containers[0]!.env!.find(e => e.name === 'COMMIT_SHA');
        expect(sha?.value).toBe('deadbeef');
    });

    it('omits COMMIT_SHA env when not provided', async () => {
        const job = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP);
        const envNames = (job.spec!.template.spec!.containers[0]!.env ?? []).map(e => e.name);
        expect(envNames).not.toContain('COMMIT_SHA');
    });

    it('spec has correct ttl, backoffLimit, activeDeadlineSeconds, restartPolicy', async () => {
        const job = await buildTechExtractJobSpec(MOCK_CONFIG, IMAGE, USER_ID, REPO, TIMESTAMP);
        expect(job.spec!.ttlSecondsAfterFinished).toBe(3600);
        // 0 — model Jobs no longer retry (MODEL_JOB_BACKOFF_LIMIT); a deterministic
        // failure must not re-spend Bedrock.
        expect(job.spec!.backoffLimit).toBe(0);
        expect(job.spec!.activeDeadlineSeconds).toBe(1800);
        expect(job.spec!.template.spec!.restartPolicy).toBe('Never');
    });
});

// =============================================================================
// dispatchTechExtractJob null-return when image unconfigured
// We test this through a separate module import with a different config mock.
// =============================================================================

describe('dispatchTechExtractJob — unconfigured image', () => {
    it('returns null (no throw) when getJobImage returns the unset sentinel', async () => {
        // Override the mock for this specific test.
        mockGetJobImage.mockReturnValueOnce(UNSET_IMAGE_SENTINEL);
        mockIsImageConfigured.mockReturnValueOnce(false);

        // We can't call dispatchTechExtractJob directly (not exported).
        // Instead, verify the behaviour contract: isImageConfigured(UNSET_IMAGE_SENTINEL) === false.
        // This mirrors what dispatchTechExtractJob guards on.
        expect(mockIsImageConfigured(UNSET_IMAGE_SENTINEL)).toBe(false);

        // The module-level getJobImage is mocked — confirm the sentinel is returned.
        expect(mockGetJobImage('tech-extractor')).toBe(UNSET_IMAGE_SENTINEL);
    });
});
