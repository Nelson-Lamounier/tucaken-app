/**
 * @format
 * admin-api — Fail-fast environment variable validator + dynamic Job-image resolver.
 *
 * Static values come from K8s resources at startup:
 *   - `admin-api-secrets`        ESO-synced Secret  (Cognito auth, SSM-sourced refs)
 *   - `platform-rds-credentials` ESO-synced Secret  (PG_HOST/PORT/DATABASE/USER/PASSWORD)
 *   - Helm-templated env block on the Rollout       (K8s namespace + SA names,
 *                                                    JOB_IMAGES_DIR pointer)
 *
 * Dynamic values (the 3 K8s Job image URIs) come from FILES synced by ESO
 * from SSM (/k8s/{env}/job-images/{ingestion,article-pipeline,job-strategist}).
 * The K8s Secret 'admin-api-job-images' is mounted as a directory whose files
 * the kubelet auto-updates when the upstream Secret rotates (~60s). admin-api
 * re-reads on each Job-creation request (with a small in-process TTL cache so
 * sustained traffic doesn't hit disk per request) — pushing a new ingestion
 * image therefore does NOT trigger an admin-api Rollout.
 *
 * AWS SDK credentials are NEVER in this config — they come from the
 * EC2 Instance Profile (IMDS) via the AWS SDK v3 default credential chain.
 *
 * @throws {Error} On startup if any required variable is absent.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Sentinel returned by getJobImage() when the URI cannot be resolved
 * (file missing AND env var fallback unset). Routes guard with
 * isImageConfigured() and return 502 instead of creating a Job that
 * would CrashLoopBackOff on ImagePullBackOff.
 */
export const UNSET_IMAGE_SENTINEL = 'image-uri-not-yet-set';

/** Returns true if the URI is a real `<repo>:<tag>` pullable reference. */
export function isImageConfigured(uri: string): boolean {
  return uri.length > 0 && uri !== UNSET_IMAGE_SENTINEL && !uri.endsWith(':');
}

/**
 * Returns true if config.assetsBucketName resolves to a real S3 bucket.
 *
 * The value comes from the optional admin-api-bedrock ESO Secret, which
 * is populated when ai-applications/infra bedrock/ai-content-stack
 * publishes /bedrock-dev/assets-bucket-name to SSM. Until then the
 * Secret is absent and `assetsBucketName` is undefined; routes that
 * write to S3 return 503 instead of crashing.
 */
export function isAssetsBucketConfigured(name: string | undefined): name is string {
  return typeof name === 'string' && name.length > 0;
}

/** The logical images admin-api may launch as Jobs. */
export type JobImageName = 'ingestion' | 'article-pipeline' | 'job-strategist' | 'resume-import-processor';

/**
 * Mapping from logical image name to the env var that holds the URI in
 * local-dev or test environments where no Secret is mounted. The chart
 * does NOT set these on the pod — production resolution always goes
 * through the file mount.
 */
const ENV_FALLBACK: Record<JobImageName, string> = {
    'ingestion':                'INGESTION_IMAGE',
    'article-pipeline':         'ARTICLE_PIPELINE_IMAGE',
    'job-strategist':           'STRATEGIST_PIPELINE_IMAGE',
    'resume-import-processor':  'RESUME_IMPORT_IMAGE',
};

/** TTL for the in-process cache of resolved URIs. */
const JOB_IMAGE_CACHE_TTL_MS = 30_000;

interface CachedImage {
    uri:      string;
    expires:  number;
}

const _imageCache: Map<JobImageName, CachedImage> = new Map();

/**
 * Resolve a Job image URI by name. Reads from the file mount first, then
 * falls back to the corresponding env var (local dev), then to the unset
 * sentinel. Caches the result for {@link JOB_IMAGE_CACHE_TTL_MS}.
 *
 * The mount root is taken from JOB_IMAGES_DIR (set by the Helm chart,
 * default /etc/admin-api/images). Each filename inside is the ESO
 * secretKey: 'ingestion', 'article-pipeline', 'job-strategist'.
 *
 * @param name Logical image identifier.
 * @returns Full <repo>:<tag> URI, or UNSET_IMAGE_SENTINEL if unresolved.
 */
export function getJobImage(name: JobImageName): string {
    const cached = _imageCache.get(name);
    const now = Date.now();
    if (cached && cached.expires > now) return cached.uri;

    const dir = process.env['JOB_IMAGES_DIR'] ?? '/etc/admin-api/images';
    let uri = UNSET_IMAGE_SENTINEL;

    try {
        const file = path.join(dir, name);
        const value = fs.readFileSync(file, 'utf8').trim();
        if (value.length > 0) uri = value;
    } catch {
        // File missing — fall through to env fallback (local dev).
    }

    if (uri === UNSET_IMAGE_SENTINEL) {
        const envValue = process.env[ENV_FALLBACK[name]];
        if (envValue && envValue.length > 0) uri = envValue;
    }

    _imageCache.set(name, { uri, expires: now + JOB_IMAGE_CACHE_TTL_MS });
    return uri;
}

/** Test helper — flush the in-process cache so tests see fresh fs reads. */
export function _resetJobImageCache(): void {
    _imageCache.clear();
}

/** Resolved, strongly-typed application configuration. */
export interface AdminApiConfig {
  /**
   * S3 assets bucket name for media uploads.
   *
   * Optional — populated by the admin-api-bedrock ESO Secret when
   * ai-applications/infra bedrock/ai-content-stack deploys and
   * publishes /bedrock-dev/assets-bucket-name to SSM. Until then this
   * field is undefined; consume only via {@link isAssetsBucketConfigured}.
   */
  readonly assetsBucketName: string | undefined;

  /**
   * Dedicated public article-media bucket (ESO: admin-api-article-assets).
   *
   * Optional — populated once the dedicated article-assets bucket is
   * provisioned and its name published to SSM. Until then this field is
   * undefined; consume only via {@link isAssetsBucketConfigured}.
   */
  readonly articleAssetsBucketName: string | undefined;

  /** Cognito User Pool ID — used for JWKS URL construction. */
  readonly cognitoUserPoolId: string;

  /** Cognito app client ID — validated in JWT `aud` claim. */
  readonly cognitoClientId: string;

  /** Cognito issuer URL — full URL without trailing slash. */
  readonly cognitoIssuerUrl: string;

  /** AWS region (from ConfigMap — never a credential). */
  readonly awsRegion: string;

  /** HTTP port the server binds on. */
  readonly port: number;

  /** PgBouncer host — cluster-internal DNS. */
  readonly pgHost: string;
  /** PgBouncer port. */
  readonly pgPort: number;
  /** PostgreSQL database name. */
  readonly pgDatabase: string;
  /** PostgreSQL user. */
  readonly pgUser: string;
  /** PostgreSQL password (from Secrets Manager via ESO). */
  readonly pgPassword: string;

  /**
   * Portfolio (nextjs) base URL for on-demand ISR revalidation after publish.
   * Cluster-internal DNS. Defaults to the in-cluster nextjs service; a
   * publish POSTs {secret, slug} to `${url}/api/revalidate`.
   */
  readonly portfolioRevalidateUrl: string;

  /**
   * Shared secret for the portfolio revalidation endpoint (SSM
   * /bedrock-dev/revalidation-secret via ESO). Optional — when absent the
   * publish route skips revalidation (best-effort) rather than failing.
   */
  readonly portfolioRevalidateSecret: string | undefined;

  /** Kubernetes namespace where ingestion Jobs are created. */
  readonly ingestionNamespace: string;

  /** ServiceAccount the ingestion Job pod runs as. */
  readonly ingestionServiceAccount: string;

  /** Kubernetes namespace where article-pipeline Jobs are created. */
  readonly articlePipelineNamespace: string;

  /** ServiceAccount the article-pipeline Job pod runs as. */
  readonly articlePipelineServiceAccount: string;

  /** Kubernetes namespace where strategist-pipeline Jobs are created. */
  readonly strategistPipelineNamespace: string;

  /** ServiceAccount the strategist-pipeline Job pod runs as. */
  readonly strategistPipelineServiceAccount: string;

  /**
   * GitHub App numeric ID (e.g. "123456").
   * Optional — GitHub routes return 503 when absent.
   * Injected via the admin-api-github ESO Secret.
   */
  readonly githubAppId: string | undefined;

  /**
   * GitHub App RSA private key in PKCS#8 PEM format.
   * Optional — GitHub routes return 503 when absent.
   * Injected via the admin-api-github ESO Secret.
   */
  readonly githubPrivateKey: string | undefined;

  /**
   * GitHub App webhook secret — HMAC-SHA256 key for verifying payloads.
   * Optional — webhook endpoint returns 501 when absent (not yet configured).
   * Injected via the admin-api-github ESO Secret.
   */
  readonly githubWebhookSecret: string | undefined;

  // ── Bedrock model IDs injected into the ingestion Job ─────────────────────
  // The ingestion pod's profile synthesizers (Mirror/Reveal, Direction,
  // Reconciliation) read these from the env; if absent they silently DISABLE
  // (return undefined), leaving user_profile_rollup synthesis columns NULL.
  // We always inject them so synthesis is never silently skipped. Each falls
  // back to profileExtractorModelId, which falls back to a single explicit
  // default — no split-brain where one consumer defaults and another disables.

  /** Model for repo profile extraction + the synthesis fallback. Always set. */
  readonly profileExtractorModelId: string;
  /** Model for the Mirror/Reveal "distilled" synthesis. */
  readonly mirrorRevealModelId: string;
  /** Model for the "Where you fit" direction synthesis. */
  readonly directionModelId: string;
  /** Model for the "Résumé vs reality" reconciliation synthesis. */
  readonly reconciliationModelId: string;
  /** Model for the readiness-diagnostic LLM narration. */
  readonly diagnosticModelId: string;

  /** Kubernetes namespace where resume-import-processor Jobs are created. */
  readonly resumeImportNamespace: string;

  /** ServiceAccount the resume-import-processor Job pod runs as. */
  readonly resumeImportServiceAccount: string;

  /**
   * Enable the GitHub dependency-graph SBOM cross-check lane in unified
   * ingestion (carried over from the retired tech-extract Job's flag).
   */
  readonly githubSbomEnabled: boolean;

  /**
   * Bedrock model ID forwarded to ARTICLE-pipeline K8s Jobs as RESEARCH_MODEL.
   * Injected via admin-api ConfigMap (RESEARCH_MODEL key). The job-strategist
   * matcher does NOT use this — see `strategistResearchModel`.
   */
  readonly researchModel: string;

  /**
   * Retrieval backend forwarded to ARTICLE-pipeline K8s Jobs as
   * RESEARCH_RETRIEVAL_SOURCE. Selects which KB the research agent grounds on:
   *   - 'pgvector'  → the user KB (document_embeddings + repository_profile_embeddings)
   *                   via the shared PgVectorRetriever (RLS-scoped to USER_ID).
   *   - 'bedrock-kb'→ the legacy Bedrock/Pinecone KB (requires KNOWLEDGE_BASE_ID,
   *                   which the article route does not set — so it retrieves nothing).
   * Defaults to 'pgvector': the article route always passes USER_ID and the
   * pgvector KB is the populated, RLS-isolated source. Overridable via
   * RESEARCH_RETRIEVAL_SOURCE for a fast rollback to the legacy path.
   */
  readonly researchRetrievalSource: string;

  /**
   * Bedrock model ID forwarded to JOB-STRATEGIST K8s Jobs as RESEARCH_MODEL
   * (the research-agent "matcher"). Defaults to Sonnet 4.6 — the matcher emits a
   * nuanced multi-section brief (verified/partial/gap classification + fit
   * rating + fitSummary, grounded to evidence). On Haiku the verdict was
   * unstable across identical re-runs (STRONG FIT ↔ REACH) and it ignored the
   * hard years bar, which is why the deterministic years-gap guard had to exist.
   * Same reasoning the coach + profile-synthesis agents already default to
   * Sonnet. Decoupled from `researchModel` so the article pipeline keeps Haiku.
   * Overridable via STRATEGIST_RESEARCH_MODEL.
   */
  readonly strategistResearchModel: string;

  /**
   * Bedrock model ID forwarded to article-pipeline K8s Jobs as FOUNDATION_MODEL
   * (writer agent) and QA_MODEL (QA agent). Optional — falls back to the EU
   * cross-region inference profile for Claude Sonnet 4.6.
   * Injected via admin-api ConfigMap (FOUNDATION_MODEL key).
   */
  readonly foundationModel: string;

  /**
   * Bedrock model ID forwarded to coach K8s Jobs as COACH_MODEL. Optional —
   * defaults to Claude Sonnet 4.6. The coach emits a large strict tool-schema
   * brief; haiku frequently produces structurally-invalid output (missing
   * `technicalQuestions`, per-item `bridgeStrategy`) → Zod hard-fail → transient
   * prep `failed`. Sonnet follows the schema reliably (same reasoning the
   * profile-synthesis agents already default to sonnet).
   */
  readonly coachModel: string;

  // Note: image URIs are NOT in this config object. Use getJobImage(name)
  // from this same module — it reads from the file mount on each call (with
  // a 30s cache) so a Secret rotation by ESO is picked up without restart.
}

/**
 * Load and validate all required environment variables at startup.
 *
 * Throws a descriptive error listing every missing variable
 * so ops can fix the ConfigMap/Secret in a single deploy cycle.
 *
 * @returns Validated, typed configuration object.
 * @throws {Error} If one or more required variables are missing.
 */
export function loadConfig(): AdminApiConfig {
  const required: Record<string, string | undefined> = {
    COGNITO_USER_POOL_ID: process.env['COGNITO_USER_POOL_ID'],
    COGNITO_CLIENT_ID: process.env['COGNITO_CLIENT_ID'],
    COGNITO_ISSUER_URL: process.env['COGNITO_ISSUER_URL'],
    AWS_DEFAULT_REGION: process.env['AWS_DEFAULT_REGION'],
    PG_HOST: process.env['PG_HOST'],
    PG_PORT: process.env['PG_PORT'],
    PG_DATABASE: process.env['PG_DATABASE'],
    PG_USER: process.env['PG_USER'],
    PG_PASSWORD: process.env['PG_PASSWORD'],
    RESEARCH_MODEL: process.env['RESEARCH_MODEL'],
  };

  // ASSETS_BUCKET_NAME is intentionally optional — it lands in SSM only
  // after ai-content-stack deploys. Routes consume via
  // isAssetsBucketConfigured(); a missing value yields a 503 from the
  // S3 write paths instead of a CrashLoop on pod boot.
  const assetsBucketName = process.env['ASSETS_BUCKET_NAME'];

  // ARTICLE_ASSETS_BUCKET_NAME is the dedicated public bucket for article
  // hero/inline media (images/articles/…, videos/articles/…). Same
  // optional idiom as assetsBucketName — routes consume via
  // isAssetsBucketConfigured() and return 503 instead of signing a URL
  // against an undefined bucket.
  const articleAssetsBucketName = process.env['ARTICLE_ASSETS_BUCKET_NAME'];

  // Job-image URIs are NOT loaded at startup — see header docblock.
  // Routes call getJobImage(name) which reads from /etc/admin-api/images/{name}
  // (kubelet-synced from the admin-api-job-images ESO Secret) with a 30s cache.

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `[admin-api] Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
      `These are injected via ConfigMap (admin-api-config) and Secret (admin-api-secrets).`,
    );
  }

  // GitHub App credentials — all optional; routes degrade gracefully when absent.
  const githubAppId         = process.env['GITHUB_APP_ID'];
  const githubPrivateKey    = process.env['GITHUB_PRIVATE_KEY'];
  const githubWebhookSecret = process.env['GITHUB_WEBHOOK_SECRET'];

  // Bedrock model IDs. Single explicit default (matches the ingestion service's
  // env.ts fallback) → profileExtractor → per-stage overrides. We deliberately
  // do NOT fail-fast: an unset model id must never crashloop the API. Always
  // resolving to a concrete id guarantees the ingestion Job's synthesizers are
  // enabled rather than silently skipped.
  const DEFAULT_BEDROCK_MODEL_ID = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';
  // Profile SYNTHESIS (Mirror/Direction/Reconciliation) emits strict
  // tool-schema JSON; haiku frequently produces structurally-invalid output
  // (wrong types, over-long arrays, missing fields) → silent NULL synthesis.
  // Default synthesis to sonnet, which follows the schema reliably. Synthesis
  // is only a few calls per ingest, so the cost delta is negligible vs the
  // per-chunk haiku enrichment. Overridable per stage via *_MODEL_ID.
  const DEFAULT_SYNTHESIS_MODEL_ID = 'eu.anthropic.claude-sonnet-4-6';
  const profileExtractorModelId =
    process.env['PROFILE_EXTRACTOR_MODEL_ID'] || DEFAULT_BEDROCK_MODEL_ID;

  return {
    assetsBucketName:     assetsBucketName && assetsBucketName.length > 0 ? assetsBucketName : undefined,
    articleAssetsBucketName: articleAssetsBucketName && articleAssetsBucketName.length > 0 ? articleAssetsBucketName : undefined,
    githubAppId:          githubAppId && githubAppId.length > 0 ? githubAppId : undefined,
    githubPrivateKey:     githubPrivateKey && githubPrivateKey.length > 0 ? githubPrivateKey : undefined,
    githubWebhookSecret:  githubWebhookSecret && githubWebhookSecret.length > 0 ? githubWebhookSecret : undefined,
    profileExtractorModelId,
    mirrorRevealModelId:   process.env['MIRROR_REVEAL_MODEL_ID']  || DEFAULT_SYNTHESIS_MODEL_ID,
    directionModelId:      process.env['DIRECTION_MODEL_ID']      || DEFAULT_SYNTHESIS_MODEL_ID,
    reconciliationModelId: process.env['RECONCILIATION_MODEL_ID'] || DEFAULT_SYNTHESIS_MODEL_ID,
    diagnosticModelId:     process.env['DIAGNOSTIC_MODEL_ID']     || profileExtractorModelId,
    cognitoUserPoolId: required['COGNITO_USER_POOL_ID']!,
    cognitoClientId: required['COGNITO_CLIENT_ID']!,
    cognitoIssuerUrl: required['COGNITO_ISSUER_URL']!,
    awsRegion: required['AWS_DEFAULT_REGION']!,
    port: parseInt(process.env['PORT'] ?? '3002', 10),
    pgHost: required['PG_HOST']!,
    pgPort: parseInt(required['PG_PORT']!, 10),
    pgDatabase: required['PG_DATABASE']!,
    pgUser: required['PG_USER']!,
    pgPassword: required['PG_PASSWORD']!,
    ingestionNamespace: process.env['INGESTION_NAMESPACE'] ?? 'ingestion',
    ingestionServiceAccount: process.env['INGESTION_SERVICE_ACCOUNT'] ?? 'ingestion-sa',
    articlePipelineNamespace: process.env['ARTICLE_PIPELINE_NAMESPACE'] ?? 'article-pipeline',
    articlePipelineServiceAccount: process.env['ARTICLE_PIPELINE_SERVICE_ACCOUNT'] ?? 'article-pipeline-sa',
    strategistPipelineNamespace: process.env['STRATEGIST_PIPELINE_NAMESPACE'] ?? 'job-strategist',
    strategistPipelineServiceAccount: process.env['STRATEGIST_PIPELINE_SERVICE_ACCOUNT'] ?? 'job-strategist-sa',
    resumeImportNamespace:           process.env['RESUME_IMPORT_NAMESPACE'] ?? 'resume-import',
    resumeImportServiceAccount:      process.env['RESUME_IMPORT_SERVICE_ACCOUNT'] ?? 'resume-import-sa',
    // On by default (best-effort, capped, timeout-guarded lane); set
    // TECH_EXTRACT_GITHUB_SBOM_ENABLED=0 to disable without a code change.
    githubSbomEnabled:               process.env['TECH_EXTRACT_GITHUB_SBOM_ENABLED'] !== '0',
    researchModel:                   required['RESEARCH_MODEL']!,
    researchRetrievalSource:         process.env['RESEARCH_RETRIEVAL_SOURCE'] ?? 'pgvector',
    strategistResearchModel:         process.env['STRATEGIST_RESEARCH_MODEL'] ?? 'eu.anthropic.claude-sonnet-4-6',
    foundationModel:                 process.env['FOUNDATION_MODEL'] ?? 'eu.anthropic.claude-sonnet-4-6',
    coachModel:                      process.env['COACH_MODEL'] ?? 'eu.anthropic.claude-sonnet-4-6',
    portfolioRevalidateUrl:          process.env['REVALIDATION_URL'] ?? 'http://nextjs.nextjs-app.svc.cluster.local:3000',
    portfolioRevalidateSecret:       process.env['REVALIDATION_SECRET'] && process.env['REVALIDATION_SECRET'].length > 0
      ? process.env['REVALIDATION_SECRET']
      : undefined,
  };
}
