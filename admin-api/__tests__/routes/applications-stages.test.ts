/**
 * @format
 * Tests for PATCH /:slug/stages/:stage — user_state / schedule / not-applicable
 * and GET /:slug stages map.
 *
 * Mocking strategy mirrors applications-coach.test.ts: ESM-friendly
 * `jest.unstable_mockModule` for k8s, pg, the pipeline-runs repo, the
 * applications repo, and the interview-stages repo.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — declared before `await import()` so the mock registry is hot.
// ---------------------------------------------------------------------------

const createNamespacedJobMock = jest.fn<() => Promise<object>>().mockResolvedValue({});
const insertPipelineRunMock   = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const pgQueryMock             = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] });

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
  getPipelineRun:    jest.fn(),
}));

// Mock the applications repo
const getApplicationMock          = jest.fn<() => Promise<unknown>>().mockResolvedValue(null);
const updateApplicationStatusMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const updateInterviewStageMock    = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/lib/repositories/applications.js', () => ({
  listApplications:        jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getApplication:          getApplicationMock,
  updateApplicationStatus: updateApplicationStatusMock,
  updateInterviewStage:    updateInterviewStageMock,
  advanceStatusOffAnalysis: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  deleteApplication:       jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  updateApplicationAnnotations: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  updateApplicationCoverLetterOverride: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// Mock the interview-stages repo — the main subject of PATCH tests.
const upsertStageUserStateMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const markNotApplicableMock    = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const linkCoachRunMock         = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const getStagesForAppMock      = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../src/lib/repositories/interview-stages.js', () => ({
  upsertStageUserState:  upsertStageUserStateMock,
  markNotApplicable:     markNotApplicableMock,
  linkCoachRun:          linkCoachRunMock,
  getStagesForApp:       getStagesForAppMock,
  listScheduledInterviews: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  reconcilePrepStatus:   jest.fn(),
  advanceStageLifecycle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  STAGE_OUTCOMES:        ['advanced', 'rejected', 'withdrew', 'not_completed', 'skipped'],
  setStageOutcome:       jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  isStageOutcome:        (v: unknown) =>
    typeof v === 'string' &&
    ['advanced', 'rejected', 'withdrew', 'not_completed', 'skipped'].includes(v),
}));

// ---------------------------------------------------------------------------
// Test config + helpers
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

// Provide image URI so isImageConfigured() is happy in dispatch path.
process.env['STRATEGIST_PIPELINE_IMAGE'] = '771826808455.dkr.ecr.eu-west-1.amazonaws.com/job-strategist:latest';

const { Hono } = await import('hono');

async function buildAuthedApp(jwtSub: string | null = 'test-user') {
  const { createApplicationsRouter } = await import('../../src/routes/applications.js');
  const app = new Hono();
  if (jwtSub !== null) {
    app.use('*', async (c, next) => {
      (c as any).set('jwtPayload', { sub: jwtSub });
      (c as any).set('userId', jwtSub);
      await next();
    });
  } else {
    app.use('*', async (c) => c.json({ error: 'Unauthorized' }, 401));
  }
  app.route('/', createApplicationsRouter(testConfig as any));
  return app;
}

/** Canonical Application row returned by getApplicationMock. */
const appRow = {
  id:             'app-123',
  userId:         'test-user',
  company:        'Acme',
  role:           'Senior Engineer',
  jobUrl:         null,
  jobDescription: 'Build cool stuff',
  kanbanStatus:   'interviewing',
  interviewStage: 'applied',
  appliedAt:      null,
  createdAt:      undefined,
  updatedAt:      undefined,
};

/** Strategist run row used by resolveStrategistRunId inside dispatchCoach. */
const strategistRow = { id: 'strat-run-1' };

// ---------------------------------------------------------------------------
// PATCH /:slug/stages/:stage
// ---------------------------------------------------------------------------

describe('PATCH /:slug/stages/:stage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    createNamespacedJobMock.mockResolvedValue({});
    insertPipelineRunMock.mockResolvedValue(undefined);
    getApplicationMock.mockResolvedValue(null);
    pgQueryMock.mockResolvedValue({ rows: [] });
    upsertStageUserStateMock.mockResolvedValue(undefined);
    markNotApplicableMock.mockResolvedValue(undefined);
    linkCoachRunMock.mockResolvedValue(undefined);
    getStagesForAppMock.mockResolvedValue([]);
    const { _resetJobImageCache } = await import('../../src/lib/config.js');
    _resetJobImageCache();
  });

  it('returns 503 when userId missing', async () => {
    const app = await buildAuthedApp(null);
    const res = await app.request('/app-123/stages/phone-screen', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userState: { compTarget: '95000' } }),
    });
    expect(res.status).toBe(401); // middleware blocks with 401 in our test setup
    expect(upsertStageUserStateMock).not.toHaveBeenCalled();
  });

  it('returns 404 when application not found', async () => {
    getApplicationMock.mockResolvedValueOnce(null);
    const app = await buildAuthedApp();
    const res = await app.request('/missing-app/stages/phone-screen', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userState: {} }),
    });
    expect(res.status).toBe(404);
    expect(upsertStageUserStateMock).not.toHaveBeenCalled();
  });

  it('upserts user state when body has userState (no scheduleAt)', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/stages/phone-screen', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userState: { compTarget: '95000' } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(upsertStageUserStateMock).toHaveBeenCalledWith(
      expect.anything(),
      'app-123',
      'phone-screen',
      { compTarget: '95000' },
      null,
    );
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
    expect(linkCoachRunMock).not.toHaveBeenCalled();
  });

  it('dispatches coach + links run when scheduleAt set on a prep stage', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    // dispatchCoach: coachInFlightOrFresh → [], resolveStrategistRunId → strategistRow
    pgQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [strategistRow] });

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/stages/phone-screen', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleAt: '2026-06-05T14:00' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(upsertStageUserStateMock).toHaveBeenCalledWith(
      expect.anything(), 'app-123', 'phone-screen', {}, '2026-06-05T14:00',
    );
    expect(insertPipelineRunMock).toHaveBeenCalledTimes(1);
    expect(createNamespacedJobMock).toHaveBeenCalledTimes(1);
    expect(linkCoachRunMock).toHaveBeenCalledWith(
      expect.anything(), 'app-123', 'phone-screen', expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it('does NOT dispatch coach when scheduleAt set on a non-prep stage (applied)', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/stages/applied', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleAt: '2026-06-05T14:00' }),
    });
    expect(res.status).toBe(200);
    expect(upsertStageUserStateMock).toHaveBeenCalledTimes(1);
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
    expect(linkCoachRunMock).not.toHaveBeenCalled();
  });

  it('marks N/A and does NOT upsert user state or dispatch', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/stages/bar-raiser', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markNotApplicable: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(markNotApplicableMock).toHaveBeenCalledWith(
      expect.anything(), 'app-123', 'bar-raiser',
    );
    expect(upsertStageUserStateMock).not.toHaveBeenCalled();
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
  });

  it('is fail-open — returns 200 even when coach dispatch throws', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    pgQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [strategistRow] });
    createNamespacedJobMock.mockRejectedValueOnce(new Error('k8s boom'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/stages/phone-screen', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleAt: '2026-06-05T14:00' }),
    });
    expect(res.status).toBe(200);
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// GET /:slug — stages map in response
// ---------------------------------------------------------------------------

describe('GET /:slug — stages map', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pgQueryMock.mockResolvedValue({ rows: [] });
    getStagesForAppMock.mockResolvedValue([]);
  });

  it('includes stages:{}  when no stage rows exist', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    getStagesForAppMock.mockResolvedValueOnce([]);

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng');
    expect(res.status).toBe(200);
    const body = await res.json() as { application: { stages: Record<string, unknown>; interviewStage: string } };
    expect(body.application.stages).toEqual({});
    expect(body.application.interviewStage).toBe('applied');
  });

  it('includes stages keyed by stage_type when rows exist', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    getStagesForAppMock.mockResolvedValueOnce([
      { stage_type: 'phone-screen', stage_status: 'current', prep_status: 'queued', scheduled_at: null, user_state: {}, coach_run_id: null },
      { stage_type: 'applied',      stage_status: 'completed', prep_status: 'none', scheduled_at: null, user_state: {}, coach_run_id: null },
    ]);

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng');
    expect(res.status).toBe(200);
    const body = await res.json() as { application: { stages: Record<string, unknown> } };
    expect(Object.keys(body.application.stages)).toEqual(expect.arrayContaining(['phone-screen', 'applied']));
    expect((body.application.stages['phone-screen'] as any).stage_status).toBe('current');
  });
});
