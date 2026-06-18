/** @format */
import { createHash } from 'node:crypto';
import type { V1Job, V1Secret } from '@kubernetes/client-node';

import type { AdminApiConfig } from './config.js';
import { traceParentEnv, observabilityEnv, ingestionModelEnv, MODEL_JOB_BACKOFF_LIMIT } from './k8s-job-builder.js';

const MAX_NAME_LEN = 63;

/** Lowercase, hyphenate, trim to a valid k8s label/name fragment. */
export function sanitizeIngestionLabel(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_NAME_LEN);
}

export interface IngestionJobOptions {
    /** Per-user GitHub installation token (resync path) → GITHUB_TOKEN env. */
    readonly githubToken?: string;
    /** Extra secret refs mounted via envFrom (e.g. 'ingestion-secrets'). */
    readonly extraSecretRefs?: readonly string[];
    /** Extra Job-metadata annotations merged in (e.g. argocd compare-options). */
    readonly extraAnnotations?: Readonly<Record<string, string>>;
    /**
     * Immutable numeric GitHub repo id (repositories.github_repo_id). When a
     * finite number, it is passed as GITHUB_REPO_ID so the worker can self-heal
     * and dual-write by id across a repository rename. Null/undefined (e.g.
     * pre-backfill) omits the env var entirely — the worker treats absence as
     * "no id known yet".
     */
    readonly githubRepoId?: number | null;
}

/** Deterministic name of the per-Job token Secret for a given ingestion Job. */
export function ingestionTokenSecretName(jobName: string): string {
    return `${jobName}-gh-token`;
}

export interface IngestionTokenSecretInput {
    readonly secretName:   string;
    readonly namespace:    string;
    readonly token:        string;
    readonly ownerJobName: string;
    readonly ownerJobUid:  string;
}

/**
 * Build the per-Job Secret that holds the short-lived GitHub installation token,
 * referenced by the Job via secretKeyRef. The Secret is owned by the Job
 * (ownerReference), so Kubernetes garbage-collects it when the Job is deleted
 * (ttlSecondsAfterFinished) — the token never outlives the run and never appears
 * in the Job spec. The dispatcher creates the Job first, then this Secret with
 * the Job's uid, so GC linkage is exact.
 */
export function buildIngestionTokenSecret(input: IngestionTokenSecretInput): V1Secret {
    return {
        apiVersion: 'v1',
        kind:       'Secret',
        type:       'Opaque',
        metadata: {
            name:      input.secretName,
            namespace: input.namespace,
            labels:    { app: 'ingestion-worker', 'tucaken.io/job': input.ownerJobName },
            ownerReferences: [{
                apiVersion:         'batch/v1',
                kind:               'Job',
                name:               input.ownerJobName,
                uid:                input.ownerJobUid,
                controller:         false,
                blockOwnerDeletion: false,
            }],
        },
        // stringData → kube-apiserver base64-encodes; never logged in our path.
        stringData: { GITHUB_TOKEN: input.token },
    };
}

/**
 * SINGLE SOURCE OF TRUTH for the ingestion (run-ingestion.js) Job spec, shared by
 * BOTH trigger paths — the user-facing resync (github.ts → POST
 * /github/connected-repos) and the admin-only trigger (ingestion.ts → POST
 * /ingestion/trigger). Previously each route built the spec inline, which let a
 * flag/env added to one path be silently absent in the other (exactly how
 * DEFER_ENRICHMENT shipped to the admin path but not the live resync path).
 *
 * Per-path differences are parameterised via {@link IngestionJobOptions}; the
 * env (DEFER_ENRICHMENT, ENRICHMENT_MODEL_ID, RETRIEVAL_PROBE_MODEL_ID, profile
 * synthesis models, observability) is assembled ONCE here so it can never drift.
 */
export function buildIngestionJobSpec(
    cfg: AdminApiConfig,
    image: string,
    userId: string,
    repoFullName: string,
    forceReindex: boolean,
    timestamp: number,
    opts: IngestionJobOptions = {},
): V1Job {
    const safeUser = sanitizeIngestionLabel(userId);
    const repoSlug = sanitizeIngestionLabel(repoFullName.replace('/', '-'));
    const suffix   = createHash('sha1').update(`${userId}:${repoFullName}:${timestamp}`).digest('hex').slice(0, 8);
    const slugPart = sanitizeIngestionLabel(`${safeUser}-${repoSlug}`).slice(0, 43);
    const jobName  = `ingestion-${slugPart}-${suffix}`.slice(0, MAX_NAME_LEN);
    const tp = traceParentEnv();
    const repoId = opts.githubRepoId;
    const hasRepoId = typeof repoId === 'number' && Number.isFinite(repoId);

    return {
        apiVersion: 'batch/v1',
        kind:       'Job',
        metadata: {
            name:      jobName,
            namespace: cfg.ingestionNamespace,
            labels: { app: 'ingestion-worker', userId: safeUser, repoSlug },
            // Annotations carry the UNSANITIZED ids (labels are lossily sanitized)
            // so the platform-job-watcher sweep + read-time reconcile can map a
            // terminally-failed Job back to its repo_sync_state row. Useful for
            // both trigger paths.
            annotations: {
                'ingestion.tucaken.io/user-id':        userId,
                'ingestion.tucaken.io/repo-full-name': repoFullName,
                ...(opts.extraAnnotations ?? {}),
            },
        },
        spec: {
            ttlSecondsAfterFinished: 3600,
            backoffLimit:            MODEL_JOB_BACKOFF_LIMIT,
            activeDeadlineSeconds:   900,
            template: {
                metadata: { labels: { app: 'ingestion-worker', userId: safeUser, repoSlug } },
                spec: {
                    restartPolicy:      'Never',
                    serviceAccountName: cfg.ingestionServiceAccount,
                    containers: [{
                        name:    'worker',
                        image,
                        command: ['node', 'dist/run-ingestion.js'],
                        env: [
                            ...observabilityEnv('ingestion-worker', `${userId}:${repoFullName}:${timestamp}`),
                            { name: 'USER_ID',        value: userId },
                            { name: 'REPO_FULL_NAME', value: repoFullName },
                            { name: 'FORCE_REINDEX',  value: String(forceReindex) },
                            // Surface the Job name to the worker via the downward API so the
                            // terminal `ingestion.complete` log can be correlated to its Job/pod
                            // in Loki (previously logged `job_name: "unknown"`). The pod carries
                            // the `job-name` label, injected by the Job controller.
                            { name: 'JOB_NAME', valueFrom: { fieldRef: { fieldPath: "metadata.labels['job-name']" } } },
                            // Per-user GitHub installation token (resync path). Sourced from a
                            // per-Job Secret via secretKeyRef — NEVER a plaintext env value, so
                            // the short-lived token never appears in the Job manifest. The
                            // dispatcher creates `${jobName}-gh-token` (owned by this Job for GC)
                            // with buildIngestionTokenSecret BEFORE the pod can start.
                            ...(opts.githubToken
                                ? [{ name: 'GITHUB_TOKEN', valueFrom: { secretKeyRef: { name: ingestionTokenSecretName(jobName), key: 'GITHUB_TOKEN' } } }]
                                : []),
                            // Immutable numeric GitHub repo id — lets the worker re-key by id
                            // across a rename. Omitted entirely when unknown (pre-backfill).
                            ...(hasRepoId ? [{ name: 'GITHUB_REPO_ID', value: String(repoId) }] : []),
                            // Fast scan = production default: defer per-chunk enrichment to the
                            // in-job background pass (searchable in minutes, no quality loss).
                            // INGESTION_DEFER_ENRICHMENT=0 → inline.
                            { name: 'DEFER_ENRICHMENT', value: process.env['INGESTION_DEFER_ENRICHMENT'] ?? '1' },
                            // eu.* cross-region inference profile for BedrockChunkEnricher
                            // (on-demand Claude unsupported in eu-west-1).
                            { name: 'ENRICHMENT_MODEL_ID', value: process.env['ENRICHMENT_MODEL_ID'] ?? 'eu.anthropic.claude-haiku-4-5-20251001-v1:0' },
                            // RetrievalProbe.fromEnvironment reads this directly; without it the
                            // best-effort probe silently no-ops.
                            { name: 'RETRIEVAL_PROBE_MODEL_ID', value: process.env['RETRIEVAL_PROBE_MODEL_ID'] ?? 'eu.anthropic.claude-haiku-4-5-20251001-v1:0' },
                            // Profile synthesis model ids — without these the
                            // Mirror/Direction/Reconciliation synthesizers silently disable.
                            ...ingestionModelEnv(cfg),
                            ...(tp ? [tp] : []),
                        ],
                        envFrom: [
                            { secretRef: { name: 'platform-rds-credentials' } },
                            ...(opts.extraSecretRefs ?? []).map((name) => ({ secretRef: { name } })),
                        ],
                        resources: {
                            requests: { memory: '512Mi', cpu: '250m' },
                            limits:   { memory: '1Gi',   cpu: '500m' },
                        },
                    }],
                },
            },
        },
    };
}
