/** @format */
import { createHash } from 'node:crypto';
import type { V1Job, V1Secret } from '@kubernetes/client-node';

import type { AdminApiConfig } from '../config.js';
import { traceParentEnv, observabilityEnv, ingestionModelEnv, MODEL_JOB_BACKOFF_LIMIT } from './k8s-job-builder.js';
import { entitlementsFor, entitlementsFromConfig, enrichmentEnv } from '../billing/entitlements.js';
import type { EffectivePlan } from '../repositories/users.js';
import type { TierConfig } from '../billing/tier-config-shape.js';

const MAX_NAME_LEN = 63;

/**
 * Map the user's EFFECTIVE plan (+ admin override) to the concrete enrichment
 * Job env vars. Premium (or a persisted admin) gets full per-chunk enrichment;
 * everyone else gets Tier-1 deterministic only. Fails closed to Tier-1.
 *
 * When `tierConfig` is provided, enrichment depth is derived from the live
 * tier config (DB-backed, 60 s cache) instead of the static entitlements map.
 */
export function resolveEnrichmentEnv(
    plan: EffectivePlan,
    role: string | null | undefined,
    tierConfig?: TierConfig | null,
): Record<string, string> {
    if (tierConfig != null) {
        return enrichmentEnv(entitlementsFromConfig(tierConfig, plan, role).enrichment);
    }
    return enrichmentEnv(entitlementsFor(plan, role).enrichment);
}

// Pod wall-clock budget. Raised 900 -> 1800s so a large repo's canonical
// enrichment finishes in ONE pass instead of hitting the deadline and leaving a
// `pending` tail (canonical enrichment is ~2.4x slower/call than free-text). The
// worker derives its enrichment cut-off from INGESTION_DEADLINE_SECONDS minus a
// margin, so both the pod deadline AND that env must use this value to align.
const INGESTION_DEADLINE_SECONDS = Number(process.env['INGESTION_ACTIVE_DEADLINE_SECONDS'] ?? 1800);

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
    /** The user's effective plan, resolved server-side via getUserPlanStatus. Drives enrichment depth. */
    readonly effectivePlan?: EffectivePlan;
    /** The user's persisted role ('admin' grants full enrichment). Resolved server-side. */
    readonly role?: string | null;
    /**
     * Live tier config (DB-backed, 60 s cache). When present, enrichment depth
     * is read from it instead of the static entitlements map.
     */
    readonly tierConfig?: TierConfig | null;
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
            activeDeadlineSeconds:   INGESTION_DEADLINE_SECONDS,
            template: {
                metadata: { labels: { app: 'ingestion-worker', userId: safeUser, repoSlug } },
                spec: {
                    restartPolicy:      'Never',
                    serviceAccountName: cfg.ingestionServiceAccount,
                    volumes: [{ name: 'work', emptyDir: { sizeLimit: '2Gi' } }],
                    containers: [{
                        name:    'worker',
                        image,
                        command: ['node', 'dist/run-ingestion.js'],
                        env: [
                            ...observabilityEnv('ingestion-worker', `${userId}:${repoFullName}:${timestamp}`),
                            { name: 'USER_ID',        value: userId },
                            { name: 'REPO_FULL_NAME', value: repoFullName },
                            { name: 'FORCE_REINDEX',  value: String(forceReindex) },
                            // P2 cutover: unified acquisition + in-job facts persistence
                            // replaces the tech-extract shadow Job (retired this PR).
                            // Deployment-env overridable; defaults on.
                            { name: 'UNIFIED_INGESTION', value: process.env['UNIFIED_INGESTION'] ?? 'on' },
                            // Scratch dir for tarball acquisition — backed by the 'work'
                            // emptyDir volume so the pod's root filesystem never fills.
                            { name: 'WORK_DIR', value: '/tmp/ingest-work' },
                            // Opt-out flag: enables the worker's GitHub dependency-graph
                            // SBOM cross-check lane (best-effort, capped, timeout-guarded) —
                            // carried over from the retired tech-extract Job spec.
                            { name: 'GITHUB_SBOM_ENABLED', value: cfg.githubSbomEnabled ? '1' : '0' },
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
                            // Enrichment cut-off (enrichmentDeadlineMs) = this minus a margin.
                            // Must match the pod activeDeadlineSeconds above so the worker stops
                            // enriching ~3 min before K8s would SIGKILL it.
                            { name: 'INGESTION_DEADLINE_SECONDS', value: String(INGESTION_DEADLINE_SECONDS) },
                            // Controlled-vocabulary enrichment: the enricher emits ONLY
                            // canonical skill_ontology terms (shared with the JD extractor)
                            // so corpus + query speak one language and d.skills && jd.skills
                            // overlaps. Default on; INGESTION_ENRICH_CANONICAL=0 reverts to
                            // free-text. Method-scoped dedup cache (ai-app) keeps the switch safe.
                            { name: 'ENRICH_CANONICAL', value: process.env['INGESTION_ENRICH_CANONICAL'] ?? '1' },
                            // Canonical chunk-packing (ai-applications feature 004, deferred
                            // lane): the enricher resolves N chunks per Haiku call, so the
                            // system prompt + controlled vocabulary — measured live as ~83%
                            // of ALL LLM spend at 68k calls/month for a 13.6k-chunk corpus —
                            // bill once per pack instead of once per chunk. Default on;
                            // INGESTION_ENRICH_PACK=0 reverts to per-chunk (rollback knob).
                            { name: 'ENRICH_PACK',      value: process.env['INGESTION_ENRICH_PACK'] ?? '1' },
                            { name: 'ENRICH_PACK_SIZE', value: process.env['INGESTION_ENRICH_PACK_SIZE'] ?? '20' },
                            // Enrichment depth: keyed on the user's effective plan + persisted role.
                            // Premium plan or admin role → full per-chunk enrichment (ENRICH_TIER1=1).
                            // All other plans → Tier-1 deterministic only (ENRICHMENT_DISABLED=1 +
                            // ENRICH_TIER1=1). Fails closed to Tier-1 when plan/role is absent.
                            // Note: ENRICHMENT_DISABLED=1 takes precedence over DEFER_ENRICHMENT
                            // because the worker checks ENRICHMENT_DISABLED first.
                            ...Object.entries(resolveEnrichmentEnv(opts.effectivePlan ?? 'free', opts.role, opts.tierConfig)).map(([name, value]) => ({ name, value })),
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
                            // Bumped 1Gi -> 2Gi for the P2 cutover: unified acquisition
                            // now buffers a repo tarball in-process alongside enrichment.
                            limits:   { memory: '2Gi',   cpu: '500m' },
                        },
                        volumeMounts: [{ name: 'work', mountPath: '/tmp/ingest-work' }],
                    }],
                },
            },
        },
    };
}

/**
 * Job spec for run-reenrich.js — drains a user's pending/skipped enrichment
 * backlog WITHOUT re-ingesting or re-embedding anything. Trimmed twin of
 * {@link buildRollupJobSpec}: same ingestion image, no GitHub token, plus the
 * enrichment env. Dispatched by the reenrich sweep (scripts/reenrich-sweep.ts)
 * for PREMIUM/ADMIN users only — LLM enrichment is a paid entitlement (a full
 * repo enrichment costs real Bedrock money), so the sweep never dispatches for
 * free-tier users, and the enrichment env below fails closed on top of that:
 * a mis-dispatched free-tier Job carries ENRICHMENT_DISABLED=1, which makes
 * run-reenrich exit before any Bedrock call.
 */
export function buildReenrichJobSpec(
    cfg: AdminApiConfig,
    image: string,
    userId: string,
    timestamp: number,
    opts: Pick<IngestionJobOptions, 'effectivePlan' | 'role' | 'tierConfig'> = {},
): V1Job {
    const safeUser = sanitizeIngestionLabel(userId);
    const suffix   = createHash('sha1').update(`reenrich:${userId}:${timestamp}`).digest('hex').slice(0, 8);
    const jobName  = `reenrich-${safeUser}-${suffix}`.slice(0, MAX_NAME_LEN);
    const tp = traceParentEnv();

    return {
        apiVersion: 'batch/v1',
        kind:       'Job',
        metadata: {
            name:      jobName,
            namespace: cfg.ingestionNamespace,
            labels:      { app: 'reenrich-worker', userId: safeUser },
            annotations: { 'ingestion.tucaken.io/user-id': userId },
        },
        spec: {
            ttlSecondsAfterFinished: 3600,
            backoffLimit:            MODEL_JOB_BACKOFF_LIMIT,
            activeDeadlineSeconds:   900,
            template: {
                metadata: { labels: { app: 'reenrich-worker', userId: safeUser } },
                spec: {
                    restartPolicy:      'Never',
                    serviceAccountName: cfg.ingestionServiceAccount,
                    containers: [{
                        name:    'reenrich',
                        image,
                        command: ['node', 'dist/run-reenrich.js'],
                        env: [
                            ...observabilityEnv('reenrich-worker', `${userId}:${timestamp}`),
                            { name: 'USER_ID', value: userId },
                            // Tier gate: premium/admin -> ENRICH_TIER1=1 (full LLM
                            // enrichment); anything else -> ENRICHMENT_DISABLED=1,
                            // on which the worker exits before any Bedrock call.
                            ...Object.entries(resolveEnrichmentEnv(opts.effectivePlan ?? 'free', opts.role, opts.tierConfig)).map(([name, value]) => ({ name, value })),
                            // Same enrichment lane config as the ingestion Job, so a
                            // swept chunk is indistinguishable from an in-job one.
                            { name: 'ENRICH_CANONICAL', value: process.env['INGESTION_ENRICH_CANONICAL'] ?? '1' },
                            { name: 'ENRICH_PACK',      value: process.env['INGESTION_ENRICH_PACK'] ?? '1' },
                            { name: 'ENRICH_PACK_SIZE', value: process.env['INGESTION_ENRICH_PACK_SIZE'] ?? '20' },
                            { name: 'ENRICHMENT_MODEL_ID', value: process.env['ENRICHMENT_MODEL_ID'] ?? 'eu.anthropic.claude-haiku-4-5-20251001-v1:0' },
                            ...(tp ? [tp] : []),
                        ],
                        envFrom: [{ secretRef: { name: 'platform-rds-credentials' } }],
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

/**
 * Job spec for run-rollup.js — recomputes a user's profile rollup + synthesis
 * WITHOUT re-ingesting any repo. Trimmed twin of buildIngestionJobSpec: same
 * ingestion image, no GitHub token / repo / enrichment env. Dispatched after a
 * repo delete so the user-level profile drops the removed repo immediately
 * (otherwise the rollup is stale until the next sync of any repo).
 */
export function buildRollupJobSpec(
    cfg: AdminApiConfig,
    image: string,
    userId: string,
    timestamp: number,
): V1Job {
    const safeUser = sanitizeIngestionLabel(userId);
    const suffix   = createHash('sha1').update(`rollup:${userId}:${timestamp}`).digest('hex').slice(0, 8);
    const jobName  = `rollup-${safeUser}-${suffix}`.slice(0, MAX_NAME_LEN);
    const tp = traceParentEnv();

    return {
        apiVersion: 'batch/v1',
        kind:       'Job',
        metadata: {
            name:      jobName,
            namespace: cfg.ingestionNamespace,
            labels:      { app: 'rollup-refresh', userId: safeUser },
            annotations: { 'ingestion.tucaken.io/user-id': userId },
        },
        spec: {
            ttlSecondsAfterFinished: 3600,
            backoffLimit:            MODEL_JOB_BACKOFF_LIMIT,
            activeDeadlineSeconds:   900,
            template: {
                metadata: { labels: { app: 'rollup-refresh', userId: safeUser } },
                spec: {
                    restartPolicy:      'Never',
                    serviceAccountName: cfg.ingestionServiceAccount,
                    containers: [{
                        name:    'rollup',
                        image,
                        command: ['node', 'dist/run-rollup.js'],
                        env: [
                            ...observabilityEnv('rollup-refresh', `${userId}:${timestamp}`),
                            { name: 'USER_ID', value: userId },
                            // Synthesis model ids — without these run-rollup re-stamps
                            // the rollup but the synthesizers silently disable.
                            ...ingestionModelEnv(cfg),
                            ...(tp ? [tp] : []),
                        ],
                        envFrom: [{ secretRef: { name: 'platform-rds-credentials' } }],
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
