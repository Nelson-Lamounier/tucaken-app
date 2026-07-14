/** @format */
import { jest } from '@jest/globals';

const mockGetJobImage       = jest.fn<(name: string) => string>(() => 'registry.example.com/ingestion:v1');
const mockIsImageConfigured = jest.fn<(uri: string) => boolean>(() => true);
const mockCreateJob         = jest.fn(async (_args: unknown) => ({ metadata: { uid: 'u' } }));
const mockBuildSpec         = jest.fn((_cfg: unknown, _img: string, _uid: string, _ts: number) => ({ kind: 'Job', metadata: { name: 'rollup-x' } }));

jest.unstable_mockModule('../../config.js', () => ({
    getJobImage:       mockGetJobImage,
    isImageConfigured: mockIsImageConfigured,
}));
jest.unstable_mockModule('../../jobs/k8s.js', () => ({
    getBatchApi: () => ({ createNamespacedJob: mockCreateJob }),
}));
jest.unstable_mockModule('../../jobs/ingestion-job.js', () => ({
    buildRollupJobSpec: mockBuildSpec,
}));

const { dispatchRollupRefresh } = await import('../../jobs/dispatch-rollup.js');

const config = { ingestionNamespace: 'ingestion' } as never;

describe('dispatchRollupRefresh', () => {
    beforeEach(() => jest.clearAllMocks());

    it('creates a rollup Job in the ingestion namespace and reports success', async () => {
        const ok = await dispatchRollupRefresh(config, 'user-1', 'resume-import confirm');
        expect(ok).toBe(true);
        expect(mockBuildSpec).toHaveBeenCalledWith(config, 'registry.example.com/ingestion:v1', 'user-1', expect.any(Number));
        expect(mockCreateJob).toHaveBeenCalledWith({ namespace: 'ingestion', body: { kind: 'Job', metadata: { name: 'rollup-x' } } });
    });

    it('is a no-op when the ingestion image is unconfigured', async () => {
        mockIsImageConfigured.mockReturnValueOnce(false);
        expect(await dispatchRollupRefresh(config, 'user-1', 'x')).toBe(false);
        expect(mockCreateJob).not.toHaveBeenCalled();
    });

    it('never throws when the Kubernetes API fails (best-effort)', async () => {
        mockCreateJob.mockRejectedValueOnce(new Error('api down'));
        await expect(dispatchRollupRefresh(config, 'user-1', 'x')).resolves.toBe(false);
    });
});
