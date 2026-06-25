/**
 * @format
 * Focused tests for the interview-stage seeding logic added to
 * POST /strategist-job in pipelines.ts (Task B4).
 *
 * Verifies that:
 *  - Creating with interviewStage:'applied' issues only the UPDATE
 *    interview_stage='applied' query and no interview_stages INSERTs.
 *  - Creating with interviewStage:'technical' issues:
 *      UPDATE interview_stage='technical'
 *      INSERT stage_status='completed' for 'applied' and 'phone-screen'
 *      INSERT stage_status='current'   for 'technical'
 *
 * Mock strategy: pgQueryMock is a shared reference captured by withUser,
 * so we can assert all SQL strings issued during the handler.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createNamespacedJobMock = jest.fn<() => Promise<object>>().mockResolvedValue({});
const insertPipelineRunMock   = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const upsertApplicationMock   = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const upsertArticleMock       = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const getPipelineRunMock      = jest.fn<(...args: unknown[]) => Promise<unknown>>();

// A single shared pgQueryMock so withUser always passes the same fn.
const pgQueryMock = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] });

jest.unstable_mockModule('../../src/lib/k8s.js', () => ({
  getBatchApi:    () => ({ createNamespacedJob: createNamespacedJobMock }),
  _resetBatchApi: () => {},
}));

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
  getPool:    () => ({ query: pgQueryMock }),
  withUser:   async (_pool: unknown, _userId: string, fn: (db: { query: typeof pgQueryMock }) => Promise<unknown>) =>
    fn({ query: pgQueryMock }),
  _resetPool: () => {},
}));

jest.unstable_mockModule('../../src/lib/repositories/pipeline-runs.js', () => ({
  insertPipelineRun: insertPipelineRunMock,
  getPipelineRun:    getPipelineRunMock,
}));

jest.unstable_mockModule('../../src/lib/repositories/articles.js', () => ({
  upsertArticle: upsertArticleMock,
}));

// Mock applications repo - upsertApplication should succeed without hitting pg.
jest.unstable_mockModule('../../src/lib/repositories/applications.js', () => ({
  upsertApplication:       upsertApplicationMock,
  listApplications:        jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getApplication:          jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
  updateApplicationStatus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  updateInterviewStage:    jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  advanceStatusOffAnalysis: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  deleteApplication:       jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  updateApplicationAnnotations: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Config + helpers
// ---------------------------------------------------------------------------

const testConfig = {
  assetsBucketName:              'test-assets-bucket',
  cognitoUserPoolId:             'eu-west-1_X',
  cognitoClientId:               'c',
  cognitoIssuerUrl:              'https://example.com',
  awsRegion:                     'eu-west-1',
  port:                          3002,
  pgHost:                        'pgbouncer',
  pgPort:                        5432,
  pgDatabase:                    'tucaken',
  pgUser:                        'postgres',
  pgPassword:                    'secret',
  ingestionNamespace:            'ingestion',
  ingestionServiceAccount:       'ingestion-sa',
  articlePipelineNamespace:      'article-pipeline',
  articlePipelineServiceAccount: 'article-pipeline-sa',
  strategistPipelineNamespace:   'job-strategist',
  strategistPipelineServiceAccount: 'job-strategist-sa',
};

process.env['STRATEGIST_PIPELINE_IMAGE'] = '771826808455.dkr.ecr.eu-west-1.amazonaws.com/job-strategist:latest';

const { Hono } = await import('hono');

async function buildAuthedApp() {
  const { createPipelinesRouter } = await import('../../src/routes/pipelines.js');
  const app = new Hono();
  app.use('*', async (c, next) => {
    (c as any).set('jwtPayload', { sub: 'test-user' });
    (c as any).set('userId', 'test-user');
    await next();
  });
  app.route('/', createPipelinesRouter(testConfig as any));
  return app;
}

const validBody = {
  targetCompany:  'Acme',
  targetRole:     'Senior Engineer',
  jobDescription: 'Build cool stuff',
};

/** Extract all SQL strings passed to pgQueryMock. */
function sqlCalls(): string[] {
  return pgQueryMock.mock.calls.map(call => (call[0] as string).replace(/\s+/g, ' ').trim());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /strategist-job - interview stage seeding', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    createNamespacedJobMock.mockResolvedValue({});
    insertPipelineRunMock.mockResolvedValue(undefined);
    upsertApplicationMock.mockResolvedValue(undefined);
    pgQueryMock.mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      // getUserPlanStatus -> return pro plan (unlimited resumes, no quota enforced)
      if (s.includes('effective_plan') || (s.includes('FROM users') && s.includes('trial_ends_at'))) {
        return { rows: [{ plan: 'pro', role: 'user', trial_started_at: null, trial_ends_at: null, subscription_status: 'active', stripe_customer_id: null, stripe_subscription_id: null, cancel_at_period_end: false, current_period_end: null, effective_plan: 'pro', trial_days_remaining: null }] };
      }
      return { rows: [] };
    });
    const { _resetJobImageCache } = await import('../../src/lib/config.js');
    _resetJobImageCache();
  });

  it('with interviewStage:"applied" - only issues UPDATE interview_stage, no stage INSERTs', async () => {
    const app = await buildAuthedApp();
    const res = await app.request('/strategist-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, interviewStage: 'applied' }),
    });
    expect(res.status).toBe(202);

    const sqls = sqlCalls();
    // UPDATE interview_stage should be present
    const updateCall = sqls.find(s => s.includes('UPDATE job_applications SET interview_stage'));
    expect(updateCall).toBeDefined();

    // The UPDATE value should be 'applied'
    const updateArgs = pgQueryMock.mock.calls.find(c => (c[0] as string).includes('UPDATE job_applications SET interview_stage'));
    expect(updateArgs?.[1]).toEqual(expect.arrayContaining(['applied']));

    // No interview_stages INSERTs
    const stageInserts = sqls.filter(s => s.includes('INSERT INTO interview_stages'));
    expect(stageInserts).toHaveLength(0);
  });

  it('with interviewStage:"technical" - seeds applied+phone-screen as completed, technical as current', async () => {
    const app = await buildAuthedApp();
    const res = await app.request('/strategist-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, interviewStage: 'technical' }),
    });
    expect(res.status).toBe(202);

    const sqls = sqlCalls();

    // UPDATE interview_stage = 'technical'
    const updateArgs = pgQueryMock.mock.calls.find(c => (c[0] as string).includes('UPDATE job_applications SET interview_stage'));
    expect(updateArgs?.[1]).toEqual(expect.arrayContaining(['technical']));

    // 'completed' inserts for applied + phone-screen
    const completedInserts = pgQueryMock.mock.calls.filter(c =>
      (c[0] as string).includes('INSERT INTO interview_stages') &&
      (c[0] as string).includes("'completed'"),
    );
    expect(completedInserts).toHaveLength(2);
    const completedStages = completedInserts.map(c => (c[1] as string[])[1]);
    expect(completedStages).toEqual(expect.arrayContaining(['applied', 'phone-screen']));

    // 'current' insert for technical
    const currentInserts = pgQueryMock.mock.calls.filter(c =>
      (c[0] as string).includes('INSERT INTO interview_stages') &&
      (c[0] as string).includes("'current'"),
    );
    expect(currentInserts).toHaveLength(1);
    expect((currentInserts[0]?.[1] as string[])[1]).toBe('technical');
  });

  it('with no interviewStage - defaults to applied (no stage INSERTs)', async () => {
    const app = await buildAuthedApp();
    const res = await app.request('/strategist-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(202);

    const sqls = sqlCalls();
    const updateArgs = pgQueryMock.mock.calls.find(c => (c[0] as string).includes('UPDATE job_applications SET interview_stage'));
    expect(updateArgs?.[1]).toEqual(expect.arrayContaining(['applied']));
    const stageInserts = sqls.filter(s => s.includes('INSERT INTO interview_stages'));
    expect(stageInserts).toHaveLength(0);
  });
});
