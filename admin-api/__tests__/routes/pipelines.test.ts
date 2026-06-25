/**
 * @format
 * Tests for admin-api routes/pipelines.ts (Phase 5 - K8s Job-only).
 *
 * The legacy Lambda-based article/strategist routes were removed in Phase 5;
 * these tests cover only the K8s Job-based replacements.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// K8s + PG + repo mocks for K8s-Job routes
// ---------------------------------------------------------------------------

const createNamespacedJobMock = jest.fn<() => Promise<object>>().mockResolvedValue({});
const insertPipelineRunMock   = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const upsertArticleMock       = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const getPipelineRunMock      = jest.fn<(...args: unknown[]) => Promise<unknown>>();

const poolQueryMock = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>()
  .mockResolvedValue({ rows: [{ plan: 'pro', role: 'user', trial_started_at: null, trial_ends_at: null, subscription_status: 'active', stripe_customer_id: null, stripe_subscription_id: null, cancel_at_period_end: false, current_period_end: null, effective_plan: 'pro', trial_days_remaining: null }] });

jest.unstable_mockModule('../../src/lib/k8s.js', () => ({
  getBatchApi:     () => ({ createNamespacedJob: createNamespacedJobMock }),
  _resetBatchApi:  () => {},
}));

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
  getPool:    () => ({ query: poolQueryMock }),
  withUser:   async (_pool: unknown, _userId: string, fn: (db: { query: jest.Mock }) => Promise<unknown>) =>
    fn({ query: jest.fn() }),
  _resetPool: () => {},
}));

jest.unstable_mockModule('../../src/lib/repositories/pipeline-runs.js', () => ({
  insertPipelineRun: insertPipelineRunMock,
  getPipelineRun:    getPipelineRunMock,
}));

jest.unstable_mockModule('../../src/lib/repositories/articles.js', () => ({
  upsertArticle: upsertArticleMock,
}));

// ---------------------------------------------------------------------------
// Module imports - after mocks
// ---------------------------------------------------------------------------

/** Resolved application configuration stub for tests. */
const testConfig = {
  assetsBucketName: 'test-assets-bucket',
  cognitoUserPoolId: 'eu-west-1_TestPool',
  cognitoClientId: 'test-client-id',
  cognitoIssuerUrl: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_TestPool',
  awsRegion: 'eu-west-1',
  port: 3002,
  pgHost: 'pgbouncer.platform.svc.cluster.local',
  pgPort: 5432,
  pgDatabase: 'tucaken',
  pgUser: 'postgres',
  pgPassword: 'secret',
  ingestionNamespace: 'ingestion',
  ingestionServiceAccount: 'ingestion-sa',
  articlePipelineNamespace: 'article-pipeline',
  articlePipelineServiceAccount: 'article-pipeline-sa',
  strategistPipelineNamespace: 'job-strategist',
  strategistPipelineServiceAccount: 'job-strategist-sa',
  researchModel: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
  strategistResearchModel: 'eu.anthropic.claude-sonnet-4-6',
};

// ---------------------------------------------------------------------------
// Phase 4 - K8s-Job-based pipeline routes
// ---------------------------------------------------------------------------

const { Hono } = await import('hono');

async function buildAuthedApp(jwtSub: string | null = 'test-user') {
  const { createPipelinesRouter } = await import('../../src/routes/pipelines.js');
  const app = new Hono();
  if (jwtSub !== null) {
    app.use('*', async (c, next) => {

      (c as any).set('jwtPayload', { sub: jwtSub });

      (c as any).set('userId', jwtSub);
      await next();
    });
  } else {
    // Simulate the JWT-verify middleware blocking unauthenticated requests.
    app.use('*', async (c) => c.json({ error: 'Unauthorized' }, 401));
  }
   
  app.route('/', createPipelinesRouter(testConfig as any));
  return app;
}

// getJobImage() falls back to env vars when no file mount is present.
// Setting these globally keeps the trigger-route guards happy in tests.
process.env['ARTICLE_PIPELINE_IMAGE']    = '771826808455.dkr.ecr.eu-west-1.amazonaws.com/article-pipeline:latest';
process.env['STRATEGIST_PIPELINE_IMAGE'] = '771826808455.dkr.ecr.eu-west-1.amazonaws.com/job-strategist:latest';

describe('POST /article-job/:slug - K8s Job article pipeline', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    createNamespacedJobMock.mockResolvedValue({});
    insertPipelineRunMock.mockResolvedValue(undefined);
    upsertArticleMock.mockResolvedValue(undefined);
    poolQueryMock.mockResolvedValue({ rows: [{ plan: 'pro', role: 'user', trial_started_at: null, trial_ends_at: null, subscription_status: 'active', stripe_customer_id: null, stripe_subscription_id: null, cancel_at_period_end: false, current_period_end: null, effective_plan: 'pro', trial_days_remaining: null }] });
    const { _resetJobImageCache } = await import('../../src/lib/config.js');
    _resetJobImageCache();
  });

  it('returns 401 when JWT sub is missing', async () => {
    const app = await buildAuthedApp(null);
    const res = await app.request('/article-job/my-slug', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
  });

  it('returns 503 when assets bucket not configured', async () => {
    const { createPipelinesRouter } = await import('../../src/routes/pipelines.js');
    const app = new Hono();
    app.use('*', async (c, next) => { (c as any).set('userId', 'test-user'); await next(); });
    app.route('/', createPipelinesRouter({ ...testConfig, assetsBucketName: undefined } as any));
    const res = await app.request('/article-job/my-slug', { method: 'POST' });
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/bucket not configured/i);
  });

  it('returns 202 with pipelineRunId and creates a Job with correct env vars', async () => {
    const app = await buildAuthedApp();
    // Body is optional - s3Bucket and s3SourceKey are derived from config + slug.
    const res = await app.request('/article-job/my-slug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'kb-augmented' }),
    });
    expect(res.status).toBe(202);
    const body = await res.json() as { status: string; pipelineRunId: string; jobName: string; slug: string };
    expect(body.status).toBe('queued');
    expect(body.pipelineRunId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.jobName.length).toBeLessThanOrEqual(63);
    expect(body.slug).toBe('my-slug');

    expect(insertPipelineRunMock).toHaveBeenCalledTimes(1);
    expect(upsertArticleMock).toHaveBeenCalledTimes(1);
    expect(createNamespacedJobMock).toHaveBeenCalledTimes(1);

    const callArgs = createNamespacedJobMock.mock.calls[0] as unknown as [{ namespace: string; body: { spec: { template: { spec: { containers: Array<{ env: Array<{ name: string; value: string }> }> } } } } }];
    expect(callArgs[0].namespace).toBe('article-pipeline');
    const env = callArgs[0].body.spec.template.spec.containers[0]!.env;
    const envMap = Object.fromEntries(env.map(e => [e.name, e.value]));
    expect(envMap['PIPELINE_RUN_ID']).toBe(body.pipelineRunId);
    expect(envMap['SLUG']).toBe('my-slug');
    expect(envMap['S3_BUCKET']).toBe('test-assets-bucket');   // from testConfig
    expect(envMap['S3_SOURCE_KEY']).toBe('drafts/my-slug.md'); // derived from slug
    expect(envMap['USER_ID']).toBe('test-user');
    expect(envMap['MODE']).toBe('kb-augmented');
  });

  it('returns 500 when PG insert rejects', async () => {
    insertPipelineRunMock.mockRejectedValueOnce(new Error('pg down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = await buildAuthedApp();
    const res = await app.request('/article-job/my-slug', { method: 'POST' });
    expect(res.status).toBe(500);
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('returns 502 when K8s rejects', async () => {
    createNamespacedJobMock.mockRejectedValueOnce(new Error('k8s down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = await buildAuthedApp();
    const res = await app.request('/article-job/my-slug', { method: 'POST' });
    expect(res.status).toBe(502);
    consoleSpy.mockRestore();
  });
});

describe('POST /strategist-job - K8s Job strategist pipeline', () => {
  // Route validates targetCompany / targetRole / jobDescription only.
  // applicationId is server-generated (randomUUID) - not accepted from caller.
  const validBody = {
    targetCompany:  'Acme',
    targetRole:     'Senior Engineer',
    jobDescription: 'Build cool stuff',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createNamespacedJobMock.mockResolvedValue({});
    insertPipelineRunMock.mockResolvedValue(undefined);
    poolQueryMock.mockResolvedValue({ rows: [{ plan: 'pro', role: 'user', trial_started_at: null, trial_ends_at: null, subscription_status: 'active', stripe_customer_id: null, stripe_subscription_id: null, cancel_at_period_end: false, current_period_end: null, effective_plan: 'pro', trial_days_remaining: null }] });
  });

  it.each([
    ['targetCompany',  { ...validBody, targetCompany:  undefined }],
    ['targetRole',     { ...validBody, targetRole:     undefined }],
    ['jobDescription', { ...validBody, jobDescription: undefined }],
  ])('returns 400 when %s is missing', async (field, body) => {
    const app = await buildAuthedApp();
    const res = await app.request('/strategist-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(400);
    const out = await res.json() as { error: string };
    expect(out.error).toContain(field);
  });

  it('returns 202 with env vars containing application + target metadata', async () => {
    const app = await buildAuthedApp();
    const res = await app.request('/strategist-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(202);
    const body = await res.json() as { status: string; pipelineRunId: string; jobName: string; applicationId: string; applicationSlug: string };
    expect(body.status).toBe('queued');
    // applicationId is server-generated - verify it is a valid UUID
    expect(body.applicationId).toMatch(/^[0-9a-f-]{36}$/);
    // applicationSlug mirrors the generated applicationId
    expect(body.applicationSlug).toBe(body.applicationId);

    const callArgs = createNamespacedJobMock.mock.calls[0] as unknown as [{ namespace: string; body: { spec: { template: { spec: { containers: Array<{ env: Array<{ name: string; value: string }> }> } } } } }];
    expect(callArgs[0].namespace).toBe('job-strategist');
    const env = callArgs[0].body.spec.template.spec.containers[0]!.env;
    const envMap = Object.fromEntries(env.map(e => [e.name, e.value]));
    expect(envMap['PIPELINE_RUN_ID']).toBe(body.pipelineRunId);
    expect(envMap['APPLICATION_ID']).toBe(body.applicationId);
    expect(envMap['APPLICATION_SLUG']).toBe(body.applicationId);
    expect(envMap['USER_ID']).toBe('test-user');
    expect(envMap['TARGET_COMPANY']).toBe('Acme');
    expect(envMap['TARGET_ROLE']).toBe('Senior Engineer');
    expect(envMap['JOB_DESCRIPTION']).toBe('Build cool stuff');
    expect(envMap['MODE']).toBe('standard');
    // Matcher runs on Sonnet (strategistResearchModel), decoupled from the
    // article pipeline's Haiku researchModel.
    expect(envMap['RESEARCH_MODEL']).toBe('eu.anthropic.claude-sonnet-4-6');
    // Filter-then-rank flag forwarded from admin-api env; defaults to 'off' (fail-open).
    expect(envMap['RETRIEVAL_PREFILTER']).toBe('off');
  });

  it('forwards RETRIEVAL_PREFILTER=on into the Job env when set on admin-api', async () => {
    const prev = process.env['RETRIEVAL_PREFILTER'];
    process.env['RETRIEVAL_PREFILTER'] = 'on';
    try {
      const app = await buildAuthedApp();
      const res = await app.request('/strategist-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });
      expect(res.status).toBe(202);

      const callArgs = createNamespacedJobMock.mock.calls[0] as unknown as [{ body: { spec: { template: { spec: { containers: Array<{ env: Array<{ name: string; value: string }> }> } } } } }];
      const env = callArgs[0].body.spec.template.spec.containers[0]!.env;
      const envMap = Object.fromEntries(env.map(e => [e.name, e.value]));
      expect(envMap['RETRIEVAL_PREFILTER']).toBe('on');
    } finally {
      if (prev === undefined) delete process.env['RETRIEVAL_PREFILTER'];
      else process.env['RETRIEVAL_PREFILTER'] = prev;
    }
  });
});

describe('GET /runs/:id - pipeline run status polling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when run not found', async () => {
    getPipelineRunMock.mockResolvedValueOnce(null);
    const app = await buildAuthedApp();
    const res = await app.request('/runs/missing-id');
    expect(res.status).toBe(404);
  });

  it('returns 403 when userId mismatch', async () => {
    getPipelineRunMock.mockResolvedValueOnce({
      id: 'r1', userId: 'other-user', pipelineType: 'article',
      referenceId: null, status: 'queued', errorMessage: null, metadata: null,
    });
    const app = await buildAuthedApp('test-user');
    const res = await app.request('/runs/r1');
    expect(res.status).toBe(403);
  });

  it('returns 200 with run when ownership matches', async () => {
    const runFixture = {
      id: 'r1', userId: 'test-user', pipelineType: 'article',
      referenceId: 'slug-x', status: 'running', errorMessage: null,
      metadata: { foo: 'bar' },
    };
    getPipelineRunMock.mockResolvedValueOnce(runFixture);
    const app = await buildAuthedApp('test-user');
    const res = await app.request('/runs/r1');
    expect(res.status).toBe(200);
    const body = await res.json() as { run: typeof runFixture };
    expect(body.run.id).toBe('r1');
    expect(body.run.status).toBe('running');
  });
});
