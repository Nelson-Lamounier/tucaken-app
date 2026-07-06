/** @format */
import { describe, it, expect } from '@jest/globals';
import type { AdminApiConfig } from './config.js';
import { buildIngestionJobSpec, buildIngestionTokenSecret, buildReenrichJobSpec, buildRollupJobSpec, resolveEnrichmentEnv } from './ingestion-job.js';
import { DEFAULT_TIER_CONFIG } from './tier-config-shape.js';
import type { TierConfig } from './tier-config-shape.js';

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
            expect(env.get('ENRICH_CANONICAL')).toBe('1');          // controlled-vocab enrichment on by default
            expect(env.get('INGESTION_DEADLINE_SECONDS')).toBe('1800'); // matches the pod deadline so enrichment budget extends
            expect(env.get('ENRICHMENT_MODEL_ID')).toMatch(/^eu\./);
            expect(env.get('RETRIEVAL_PROBE_MODEL_ID')).toMatch(/^eu\./); // was missing on resync path
            expect(env.get('PROFILE_EXTRACTOR_MODEL_ID')).toBe('m-profile');
        }
    });

    it('injects JOB_NAME via the downward API on BOTH paths (Loki correlation)', () => {
        for (const opts of [{ githubToken: 't' }, { extraSecretRefs: ['ingestion-secrets'] }]) {
            const job = buildIngestionJobSpec(cfg, 'img:tag', USER, REPO, false, 1700000000000, opts);
            const jobName = job.spec!.template!.spec!.containers![0]!.env!
                .find((e) => e.name === 'JOB_NAME')!;
            // Sourced from the pod's job-name label — never a hardcoded value.
            expect(jobName.value).toBeUndefined();
            expect(jobName.valueFrom?.fieldRef?.fieldPath).toBe("metadata.labels['job-name']");
        }
    });

    it('resync path: GITHUB_TOKEN via secretKeyRef (NEVER plaintext in the Job spec)', () => {
        const job = buildIngestionJobSpec(cfg, 'img', USER, REPO, false, 1, {
            githubToken: 'ghs_x',
            extraAnnotations: { 'argocd.argoproj.io/compare-options': 'IgnoreExtraneous' },
        });
        const tok = job.spec!.template!.spec!.containers![0]!.env!.find((e) => e.name === 'GITHUB_TOKEN')!;
        // The token must NOT appear as a literal value anywhere in the spec.
        expect(tok.value).toBeUndefined();
        expect(JSON.stringify(job)).not.toContain('ghs_x');
        // It is sourced from the per-Job token Secret.
        expect(tok.valueFrom?.secretKeyRef?.name).toBe(`${job.metadata!.name}-gh-token`);
        expect(tok.valueFrom?.secretKeyRef?.key).toBe('GITHUB_TOKEN');
        expect(job.metadata?.annotations?.['argocd.argoproj.io/compare-options']).toBe('IgnoreExtraneous');
        const secrets = job.spec!.template!.spec!.containers![0]!.envFrom!.map((e) => e.secretRef?.name);
        expect(secrets).toEqual(['platform-rds-credentials']);
    });

    it('buildIngestionTokenSecret: Opaque secret, owned by the Job for GC, holds the token', () => {
        const secret = buildIngestionTokenSecret({
            secretName: 'ingestion-foo-abc123-gh-token',
            namespace:  'ingestion',
            token:      'ghs_secret',
            ownerJobName: 'ingestion-foo-abc123',
            ownerJobUid:  'uid-123',
        });
        expect(secret.type).toBe('Opaque');
        expect(secret.metadata?.name).toBe('ingestion-foo-abc123-gh-token');
        expect(secret.metadata?.namespace).toBe('ingestion');
        expect(secret.stringData?.['GITHUB_TOKEN']).toBe('ghs_secret');
        // ownerReference → the Job, so kubelet GCs the secret when the Job is deleted.
        const owner = secret.metadata?.ownerReferences?.[0];
        expect(owner).toMatchObject({ kind: 'Job', name: 'ingestion-foo-abc123', uid: 'uid-123' });
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

describe('buildRollupJobSpec', () => {
    it('runs run-rollup.js with USER_ID only — no repo, no token', () => {
        const job = buildRollupJobSpec(cfg, 'img:tag', USER, 1700000000000);
        const c = job.spec?.template?.spec?.containers?.[0];
        expect(c?.command).toEqual(['node', 'dist/run-rollup.js']);
        const env = new Map((c?.env ?? []).map((e) => [e.name, e.value ?? '']));
        expect(env.get('USER_ID')).toBe(USER);
        expect(env.has('REPO_FULL_NAME')).toBe(false);   // not a per-repo job
        expect(env.has('GITHUB_TOKEN')).toBe(false);     // no GitHub access needed
        expect(c?.envFrom?.[0]?.secretRef?.name).toBe('platform-rds-credentials');
        expect(job.metadata?.name?.startsWith('rollup-')).toBe(true);
        expect((job.metadata?.name ?? '').length).toBeLessThanOrEqual(63);
    });
});

describe('buildReenrichJobSpec (tier-gated backlog drain)', () => {
    function reenrichEnv(opts?: Parameters<typeof buildReenrichJobSpec>[4]): Map<string, string> {
        const job = buildReenrichJobSpec(cfg, 'img:tag', USER, 1700000000000, opts);
        return new Map((job.spec?.template?.spec?.containers?.[0]?.env ?? []).map((e) => [e.name, e.value ?? '']));
    }

    it('runs run-reenrich.js with USER_ID only — no repo, no token', () => {
        const job = buildReenrichJobSpec(cfg, 'img:tag', USER, 1700000000000, { effectivePlan: 'premium' });
        const c = job.spec?.template?.spec?.containers?.[0];
        expect(c?.command).toEqual(['node', 'dist/run-reenrich.js']);
        const env = new Map((c?.env ?? []).map((e) => [e.name, e.value ?? '']));
        expect(env.get('USER_ID')).toBe(USER);
        expect(env.has('GITHUB_TOKEN')).toBe(false);
        expect(c?.envFrom?.[0]?.secretRef?.name).toBe('platform-rds-credentials');
        expect(job.metadata?.name?.startsWith('reenrich-')).toBe(true);
        expect((job.metadata?.name ?? '').length).toBeLessThanOrEqual(63);
    });

    it('premium is Tier-1-only too — LLM enrichment retired (ENRICHMENT_DISABLED always set)', () => {
        const env = reenrichEnv({ effectivePlan: 'premium' });
        expect(env.get('ENRICH_TIER1')).toBe('1');
        expect(env.get('ENRICHMENT_DISABLED')).toBe('1');
        expect(env.get('ENRICH_CANONICAL')).toBe('1');
        expect(env.get('ENRICH_PACK')).toBe('1');           // packed canonical residue
        expect(env.get('ENRICHMENT_MODEL_ID')).toMatch(/^eu\./);
    });

    it('FAILS CLOSED: a free-tier (or absent) plan carries ENRICHMENT_DISABLED=1 — the worker exits before any Bedrock call', () => {
        for (const opts of [{ effectivePlan: 'free' as const }, {}]) {
            const env = reenrichEnv(opts);
            expect(env.get('ENRICHMENT_DISABLED')).toBe('1');
        }
    });

    it('admin role no longer bypasses the retirement — ENRICHMENT_DISABLED holds', () => {
        const env = reenrichEnv({ effectivePlan: 'free', role: 'admin' });
        expect(env.get('ENRICHMENT_DISABLED')).toBe('1');
        expect(env.get('ENRICH_TIER1')).toBe('1');
    });
});

// ---------------------------------------------------------------------------
// resolveEnrichmentEnv — plan + admin role driven enrichment
// ---------------------------------------------------------------------------

describe('resolveEnrichmentEnv (plan + admin driven)', () => {
    it('free/pro/trial (non-admin) get Tier-1 only', () => {
        for (const plan of ['free', 'pro', 'trial'] as const) {
            expect(resolveEnrichmentEnv(plan, 'user')).toEqual({ ENRICHMENT_DISABLED: '1', ENRICH_TIER1: '1' });
        }
    });
    it('premium is Tier-1-only (LLM enrichment retired)', () => {
        expect(resolveEnrichmentEnv('premium', 'user')).toEqual({ ENRICHMENT_DISABLED: '1', ENRICH_TIER1: '1' });
    });
    it('admin role is Tier-1-only as well (kill switch holds for every role)', () => {
        expect(resolveEnrichmentEnv('free', 'admin')).toEqual({ ENRICHMENT_DISABLED: '1', ENRICH_TIER1: '1' });
    });
    it('a missing role fails closed to Tier-1', () => {
        expect(resolveEnrichmentEnv('free', null)).toEqual({ ENRICHMENT_DISABLED: '1', ENRICH_TIER1: '1' });
    });

    // -------------------------------------------------------------------------
    // Live tier config path
    // -------------------------------------------------------------------------

    it("a tierConfig override to 'full' CANNOT re-enable the enricher — the kill switch holds", () => {
        // Build a config where the free tier has enrichment = 'full' (stale DB override).
        const overridden: TierConfig = {
            tiers: DEFAULT_TIER_CONFIG.tiers.map((t) =>
                t.id === 'free' ? { ...t, entitlements: { ...t.entitlements, enrichment: 'full' } } : t,
            ),
        };
        // LLM enrichment is retired: even a live-config 'full' resolves to disabled.
        expect(resolveEnrichmentEnv('free', null, overridden)).toEqual({ ENRICHMENT_DISABLED: '1', ENRICH_TIER1: '1' });
    });

    it('static path unchanged when no tierConfig: free tier still yields Tier-1 env', () => {
        // Without a tierConfig the static map is used — free = tier1.
        expect(resolveEnrichmentEnv('free', null)).toEqual({ ENRICHMENT_DISABLED: '1', ENRICH_TIER1: '1' });
    });

    it('passes tierConfig through buildIngestionJobSpec opts and reflects it in the job env', () => {
        const overridden: TierConfig = {
            tiers: DEFAULT_TIER_CONFIG.tiers.map((t) =>
                t.id === 'free' ? { ...t, entitlements: { ...t.entitlements, enrichment: 'full' } } : t,
            ),
        };
        const env = envOf({ effectivePlan: 'free', tierConfig: overridden });
        // tierConfig still flows through the opts, but the retired enricher stays disabled.
        expect(env.get('ENRICHMENT_DISABLED')).toBe('1');
        expect(env.get('ENRICH_TIER1')).toBe('1');
    });
});
