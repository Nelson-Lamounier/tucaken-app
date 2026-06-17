/** @format */
import { describe, it, expect } from '@jest/globals';
import type { AdminApiConfig } from './config.js';
import { buildIngestionJobSpec } from './ingestion-job.js';

const cfg = {
    ingestionNamespace:      'ingestion',
    ingestionServiceAccount: 'ingestion-sa',
    profileExtractorModelId: 'm-profile',
    mirrorRevealModelId:     'm-mirror',
    directionModelId:        'm-direction',
    reconciliationModelId:   'm-reconcile',
    diagnosticModelId:       'm-diagnostic',
} as unknown as AdminApiConfig;

const USER = '1d4c645a-447e-4b5b-924d-19a3c75a84db';
const REPO = 'Nelson-Lamounier/ai-applications';

function envOf(opts?: Parameters<typeof buildIngestionJobSpec>[6]): Map<string, string> {
    const job = buildIngestionJobSpec(cfg, 'img:tag', USER, REPO, true, 1700000000000, opts);
    const env = job.spec?.template?.spec?.containers?.[0]?.env ?? [];
    return new Map(env.map((e) => [e.name, e.value ?? '']));
}

describe('buildIngestionJobSpec', () => {
    it('emits the drift-prone env on BOTH paths (the consolidation guarantee)', () => {
        for (const opts of [{ githubToken: 't' }, { extraSecretRefs: ['ingestion-secrets'] }]) {
            const env = envOf(opts);
            expect(env.get('USER_ID')).toBe(USER);
            expect(env.get('REPO_FULL_NAME')).toBe(REPO);
            expect(env.get('FORCE_REINDEX')).toBe('true');
            expect(env.get('DEFER_ENRICHMENT')).toBe('1');          // fast-scan default
            expect(env.get('ENRICHMENT_MODEL_ID')).toMatch(/^eu\./);
            expect(env.get('RETRIEVAL_PROBE_MODEL_ID')).toMatch(/^eu\./); // was missing on resync path
            expect(env.get('PROFILE_EXTRACTOR_MODEL_ID')).toBe('m-profile');
        }
    });

    it('resync path: GITHUB_TOKEN + argocd annotation, only the rds secret', () => {
        const job = buildIngestionJobSpec(cfg, 'img', USER, REPO, false, 1, {
            githubToken: 'ghs_x',
            extraAnnotations: { 'argocd.argoproj.io/compare-options': 'IgnoreExtraneous' },
        });
        const env = job.spec!.template!.spec!.containers![0]!.env!;
        expect(env.find((e) => e.name === 'GITHUB_TOKEN')?.value).toBe('ghs_x');
        expect(job.metadata?.annotations?.['argocd.argoproj.io/compare-options']).toBe('IgnoreExtraneous');
        expect(job.metadata?.annotations?.['ingestion.tucaken.io/user-id']).toBe(USER);
        const secrets = job.spec!.template!.spec!.containers![0]!.envFrom!.map((e) => e.secretRef?.name);
        expect(secrets).toEqual(['platform-rds-credentials']);
    });

    it('admin path: no GITHUB_TOKEN, mounts ingestion-secrets', () => {
        const job = buildIngestionJobSpec(cfg, 'img', USER, REPO, false, 1, { extraSecretRefs: ['ingestion-secrets'] });
        const env = job.spec!.template!.spec!.containers![0]!.env!;
        expect(env.find((e) => e.name === 'GITHUB_TOKEN')).toBeUndefined();
        const secrets = job.spec!.template!.spec!.containers![0]!.envFrom!.map((e) => e.secretRef?.name);
        expect(secrets).toEqual(['platform-rds-credentials', 'ingestion-secrets']);
    });

    it('emits GITHUB_REPO_ID when a finite numeric id is supplied', () => {
        const env = envOf({ githubRepoId: 555 });
        expect(env.get('GITHUB_REPO_ID')).toBe('555');
    });

    it('omits GITHUB_REPO_ID when the id is null or absent', () => {
        expect(envOf({ githubRepoId: null }).has('GITHUB_REPO_ID')).toBe(false);
        expect(envOf().has('GITHUB_REPO_ID')).toBe(false);
    });

    it('job name is deterministic + within the 63-char k8s limit', () => {
        const a = buildIngestionJobSpec(cfg, 'img', USER, REPO, true, 42).metadata?.name ?? '';
        const b = buildIngestionJobSpec(cfg, 'img', USER, REPO, true, 42).metadata?.name ?? '';
        expect(a).toBe(b);
        expect(a.startsWith('ingestion-')).toBe(true);
        expect(a.length).toBeLessThanOrEqual(63);
    });
});
