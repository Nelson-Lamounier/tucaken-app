/**
 * @format
 * Tests for the coaching routes in admin-api/routes/applications.ts:
 *
 *   POST /:slug/coach   — schedule the coach K8s Job (via dispatchCoach)
 *   POST /:slug/status  — update status + auto-dispatch on prep stage
 *   GET  /:slug/coaching/:stage — read the coaching_content row
 *
 * Mocking strategy mirrors pipelines.test.ts: ESM-friendly
 * `jest.unstable_mockModule` for k8s, pg, and the pipeline-runs repo.
 *
 * pgQueryMock is used sequentially: each mockResolvedValueOnce covers one
 * db.query call in dispatch order:
 *   1. getApplication (app row)
 *   2. coachInFlightOrFresh (dedup check → [] = not in-flight)
 *   3. resolveStrategistRunId (strategist run → row with id)
 *   4. insertPipelineRun (delegated to insertPipelineRunMock; pg.query not called)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — declared before `await import()` so the mock registry is hot.
// ---------------------------------------------------------------------------

const createNamespacedJobMock = jest.fn<() => Promise<object>>().mockResolvedValue({});
const insertPipelineRunMock   = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const pgQueryMock             = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] });

jest.unstable_mockModule('../../../lib/jobs/k8s.js', () => ({
  getBatchApi:    () => ({ createNamespacedJob: createNamespacedJobMock }),
  _resetBatchApi: () => {},
}));

jest.unstable_mockModule('../../../lib/pg.js', () => ({
  getPool:    () => ({ query: pgQueryMock }),
  withUser:   async (_pool: unknown, _userId: string, fn: (db: { query: typeof pgQueryMock }) => Promise<unknown>) =>
    fn({ query: pgQueryMock }),
  _resetPool: () => {},
}));

jest.unstable_mockModule('../../../lib/repositories/pipeline-runs.js', () => ({
  insertPipelineRun: insertPipelineRunMock,
  getPipelineRun:    jest.fn(),
}));

// Mock the interview-stages repo
const linkCoachRunMock          = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const advanceStageLifecycleMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../../lib/repositories/interview-stages.js', () => ({
  upsertStageUserState:   jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  markNotApplicable:      jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  linkCoachRun:           linkCoachRunMock,
  getStagesForApp:        jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  listScheduledInterviews: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  reconcilePrepStatus:    jest.fn(),
  advanceStageLifecycle:  advanceStageLifecycleMock,
  STAGE_OUTCOMES:         ['advanced', 'rejected', 'withdrew', 'not_completed', 'skipped'],
  setStageOutcome:        jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  isStageOutcome:         (v: unknown) =>
    typeof v === 'string' &&
    ['advanced', 'rejected', 'withdrew', 'not_completed', 'skipped'].includes(v),
}));

// Mock the applications repo — getApplication, updateApplicationStatus, updateInterviewStage
const getApplicationMock          = jest.fn<() => Promise<unknown>>().mockResolvedValue(null);
const updateApplicationStatusMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const updateInterviewStageMock    = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../../lib/repositories/applications.js', () => ({
  getApplicationStatus: jest.fn<() => Promise<{ status: string; hasQueuedStage: boolean; updatedAt: Date | null } | null>>().mockResolvedValue({ status: 'analysing', hasQueuedStage: false, updatedAt: null }),
  listApplications:        jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getApplication:          getApplicationMock,
  updateApplicationStatus: updateApplicationStatusMock,
  updateInterviewStage:    updateInterviewStageMock,
  advanceStatusOffAnalysis: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  deleteApplication:       jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  updateApplicationAnnotations: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  updateApplicationCoverLetterOverride: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Test config + helpers
// ---------------------------------------------------------------------------

const testConfig = {
  assetsBucketName: 'test-assets-bucket',
  cognitoUserPoolId: 'eu-west-1_X',
  cognitoClientId: 'c',
  cognitoIssuerUrl: 'https://example.com',
  awsRegion: 'eu-west-1',
  port: 3002,
  pgHost: 'pgbouncer',
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
};

const { Hono } = await import('hono');

async function buildAuthedApp(jwtSub: string | null = 'test-user') {
  const { createApplicationsRouter } = await import('../../applications/applications.js');
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

/**
 * Canonical app row returned by getApplicationMock.
 * Uses camelCase to match the Application type returned by getApplication().
 */
const appRow = {
  id:             'app-123',
  userId:         'test-user',
  company:        'Acme',
  role:           'Senior Engineer',
  jobUrl:         null,
  jobDescription: 'Build cool stuff',
  kanbanStatus:   'interviewing',
  appliedAt:      null,
  createdAt:      undefined,
  updatedAt:      undefined,
};

/** Strategist run row used by resolveStrategistRunId. */
const strategistRow = { id: 'strat-run-1' };

// getJobImage() env-var fallback for tests (no file mount in jest).
process.env['STRATEGIST_PIPELINE_IMAGE'] = '771826808455.dkr.ecr.eu-west-1.amazonaws.com/job-strategist:latest';

// ---------------------------------------------------------------------------
// POST /:slug/coach — via dispatchCoach
// ---------------------------------------------------------------------------

describe('POST /:slug/coach', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    createNamespacedJobMock.mockResolvedValue({});
    insertPipelineRunMock.mockResolvedValue(undefined);
    getApplicationMock.mockResolvedValue(null);
    pgQueryMock.mockResolvedValue({ rows: [] });
    const { _resetJobImageCache } = await import('../../../lib/config.js');
    _resetJobImageCache();
  });

  it('returns 401 when JWT sub missing', async () => {
    const app = await buildAuthedApp(null);
    const res = await app.request('/acme-eng/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewStage: 'phone-screen' }),
    });
    expect(res.status).toBe(401);
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
  });

  it('returns 404 when app not found', async () => {
    getApplicationMock.mockResolvedValueOnce(null);
    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewStage: 'phone-screen' }),
    });
    expect(res.status).toBe(404);
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
  });

  // ── A2 new test 1: phone-screen → 202 + Job created ────────────────────
  it('returns 202 and creates a Job when interviewStage=phone-screen (dedup empty, app+strategist mocked)', async () => {
    // getApplication returns app row
    getApplicationMock.mockResolvedValueOnce(appRow);
    // dispatchCoach calls db.query twice: coachInFlightOrFresh → [], resolveStrategistRunId → strategistRow
    pgQueryMock
      .mockResolvedValueOnce({ rows: [] })           // coachInFlightOrFresh: not in-flight
      .mockResolvedValueOnce({ rows: [strategistRow] }); // resolveStrategistRunId

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewStage: 'phone-screen' }),
    });
    expect(res.status).toBe(202);
    const body = await res.json() as { status: string; coachPipelineRunId: string };
    expect(body.status).toBe('queued');
    expect(body.coachPipelineRunId).toMatch(/^[0-9a-f-]{36}$/);

    expect(insertPipelineRunMock).toHaveBeenCalledTimes(1);
    expect(createNamespacedJobMock).toHaveBeenCalledTimes(1);

    const callArgs = createNamespacedJobMock.mock.calls[0] as unknown as [{
      namespace: string;
      body: { spec: { template: { spec: { containers: Array<{ command: string[]; env: Array<{ name: string; value: string }> }> } } } };
    }];
    expect(callArgs[0].namespace).toBe('job-strategist');
    const container = callArgs[0].body.spec.template.spec.containers[0]!;
    expect(container.command).toEqual(['node', 'dist/run-coach.js']);
    const envMap = Object.fromEntries(container.env.map(e => [e.name, e.value]));
    expect(envMap['COACH_PIPELINE_RUN_ID']).toBe(body.coachPipelineRunId);
    expect(envMap['STRATEGIST_PIPELINE_RUN_ID']).toBe('strat-run-1');
    expect(envMap['APPLICATION_ID']).toBe('app-123');
    expect(envMap['APPLICATION_SLUG']).toBe('acme-eng');
    expect(envMap['USER_ID']).toBe('test-user');
    expect(envMap['TARGET_COMPANY']).toBe('Acme');
    expect(envMap['TARGET_ROLE']).toBe('Senior Engineer');
    expect(envMap['JOB_DESCRIPTION']).toBe('Build cool stuff');
    expect(envMap['INTERVIEW_STAGE']).toBe('phone-screen');
    expect(envMap['MODE']).toBe('standard');
  });

  // ── A2 new test 2: dedup → skipped, no Job ──────────────────────────────
  it('returns 200 skipped when dedup returns an in-flight row (NO job created)', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    // coachInFlightOrFresh → row present (in-flight)
    pgQueryMock.mockResolvedValueOnce({ rows: [{ status: 'queued' }] });

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewStage: 'phone-screen' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('skipped');
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
    expect(insertPipelineRunMock).not.toHaveBeenCalled();
  });

  // ── A2 new test 3: applied → 400 gated ──────────────────────────────────
  it('returns 400 gated when interviewStage=applied (not a prep stage)', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewStage: 'applied' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not an interview-prep stage/);
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
    expect(insertPipelineRunMock).not.toHaveBeenCalled();
  });

  // ── A2 new test 4: no strategist run → 409 ──────────────────────────────
  it('returns 409 when no complete strategist run exists for the application', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    pgQueryMock
      .mockResolvedValueOnce({ rows: [] })  // coachInFlightOrFresh: not in-flight
      .mockResolvedValueOnce({ rows: [] }); // resolveStrategistRunId: no run

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewStage: 'phone-screen' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/no complete strategist run/);
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
  });

  it('forwards COMPENSATION_TARGET and REGION env vars when supplied', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    pgQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [strategistRow] });

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewStage: 'technical', compensationTarget: '95000', region: 'uk' }),
    });
    expect(res.status).toBe(202);
    const callArgs = createNamespacedJobMock.mock.calls[0] as unknown as [{
      body: { spec: { template: { spec: { containers: Array<{ env: Array<{ name: string; value: string }> }> } } } };
    }];
    const env = callArgs[0].body.spec.template.spec.containers[0]!.env;
    const envMap = Object.fromEntries(env.map(e => [e.name, e.value]));
    expect(envMap['COMPENSATION_TARGET']).toBe('95000');
    expect(envMap['REGION']).toBe('uk');
  });

  it('omits COMPENSATION_TARGET and defaults REGION when not supplied', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    pgQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [strategistRow] });

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewStage: 'technical' }),
    });
    expect(res.status).toBe(202);
    const callArgs = createNamespacedJobMock.mock.calls[0] as unknown as [{
      body: { spec: { template: { spec: { containers: Array<{ env: Array<{ name: string; value: string }> }> } } } };
    }];
    const env = callArgs[0].body.spec.template.spec.containers[0]!.env;
    const envMap = Object.fromEntries(env.map(e => [e.name, e.value]));
    expect(envMap['COMPENSATION_TARGET']).toBeUndefined();
    expect(envMap['REGION']).toBe('eu-remote');
  });
});

// ---------------------------------------------------------------------------
// POST /:slug/status — A3 auto-dispatch
// ---------------------------------------------------------------------------

describe('POST /:slug/status', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    createNamespacedJobMock.mockResolvedValue({});
    insertPipelineRunMock.mockResolvedValue(undefined);
    linkCoachRunMock.mockResolvedValue(undefined);
    advanceStageLifecycleMock.mockResolvedValue(undefined);
    getApplicationMock.mockResolvedValue(null);
    updateApplicationStatusMock.mockResolvedValue(undefined);
    updateInterviewStageMock.mockResolvedValue(undefined);
    pgQueryMock.mockResolvedValue({ rows: [] });
    const { _resetJobImageCache } = await import('../../../lib/config.js');
    _resetJobImageCache();
  });

  it('returns 400 when status is invalid', async () => {
    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'not-valid' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 when status valid, no interviewStage (no dispatch)', async () => {
    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'interviewing' }),
    });
    expect(res.status).toBe(200);
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
    expect(updateInterviewStageMock).not.toHaveBeenCalled();
  });

  // ── A3 test 1: phone-screen → updates stage + creates a Job ─────────────
  it('updates interview_stage and creates a Job when interviewStage=phone-screen', async () => {
    // updateApplicationStatus uses updateApplicationStatusMock (repo mock)
    // getApplication for stage update
    getApplicationMock.mockResolvedValueOnce(appRow);
    // dispatchCoach: coachInFlightOrFresh → [], resolveStrategistRunId → strategistRow
    pgQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [strategistRow] });

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'interviewing', interviewStage: 'phone-screen' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; status: string };
    expect(body.success).toBe(true);

    expect(updateApplicationStatusMock).toHaveBeenCalledWith(expect.anything(), 'acme-eng', 'interviewing');
    expect(updateInterviewStageMock).toHaveBeenCalledWith(expect.anything(), 'app-123', 'phone-screen');
    expect(createNamespacedJobMock).toHaveBeenCalledTimes(1);
    expect(insertPipelineRunMock).toHaveBeenCalledTimes(1);
  });

  // ── A3 test 2: applied → updates stage, NO job ──────────────────────────
  it('updates interview_stage but does NOT dispatch coach when interviewStage=applied', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied', interviewStage: 'applied' }),
    });
    expect(res.status).toBe(200);
    expect(updateInterviewStageMock).toHaveBeenCalledWith(expect.anything(), 'app-123', 'applied');
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
    expect(insertPipelineRunMock).not.toHaveBeenCalled();
  });

  // ── A3 test 3: dispatch throwing still returns 200 (fail-open) ───────────
  it('returns 200 even when coach dispatch throws (fail-open)', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    // coachInFlightOrFresh → [], resolveStrategistRunId → strategistRow
    pgQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [strategistRow] });
    // Make createNamespacedJob throw to simulate K8s failure inside dispatchCoach
    createNamespacedJobMock.mockRejectedValueOnce(new Error('k8s boom'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'interviewing', interviewStage: 'phone-screen' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
    consoleSpy.mockRestore();
  });

  // ── A3 test 4: dispatch calls linkCoachRun with the returned coachPipelineRunId ──
  it('calls linkCoachRun with the dispatched coachPipelineRunId when interviewStage=technical', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);
    pgQueryMock
      .mockResolvedValueOnce({ rows: [] })           // coachInFlightOrFresh: not in-flight
      .mockResolvedValueOnce({ rows: [strategistRow] }); // resolveStrategistRunId

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'interviewing', interviewStage: 'technical' }),
    });
    expect(res.status).toBe(200);

    expect(linkCoachRunMock).toHaveBeenCalledTimes(1);
    const [, linkedAppId, linkedStage, linkedRunId] = linkCoachRunMock.mock.calls[0] as unknown[];
    expect(linkedAppId).toBe('app-123');
    expect(linkedStage).toBe('technical');
    expect(typeof linkedRunId).toBe('string');
    expect((linkedRunId as string).length).toBeGreaterThan(0);
  });

  // ── A3 test 5: advanceStageLifecycle is called for every interviewStage (incl. non-prep) ──
  it('calls advanceStageLifecycle regardless of whether the stage is a prep stage', async () => {
    getApplicationMock.mockResolvedValueOnce(appRow);

    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied', interviewStage: 'applied' }),
    });
    expect(res.status).toBe(200);
    expect(advanceStageLifecycleMock).toHaveBeenCalledTimes(1);
    expect(advanceStageLifecycleMock).toHaveBeenCalledWith(expect.anything(), 'app-123', 'applied');
    // No coach dispatch for non-prep stage
    expect(createNamespacedJobMock).not.toHaveBeenCalled();
    expect(linkCoachRunMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /:slug/coaching/:stage
// ---------------------------------------------------------------------------

describe('GET /:slug/coaching/:stage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pgQueryMock.mockResolvedValue({ rows: [] });
  });

  it('returns 400 when applicationId query param missing', async () => {
    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/coaching/technical');
    expect(res.status).toBe(400);
    const out = await res.json() as { error: string };
    expect(out.error).toMatch(/applicationId/);
  });

  it('returns 404 when no row exists yet (Job still running)', async () => {
    pgQueryMock.mockResolvedValueOnce({ rows: [] });
    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/coaching/technical?applicationId=app-123');
    expect(res.status).toBe(404);
  });

  it('returns 200 with coaching content when row exists', async () => {
    const generatedAt = new Date('2026-04-25T12:00:00Z');
    pgQueryMock.mockResolvedValueOnce({
      rows: [{
        topics_to_study:     { stage: 'technical' },
        expected_questions:  { technical: [], behavioural: [], difficult: [] },
        personal_highlights: [],
        generated_at:        generatedAt,
      }],
    });
    const app = await buildAuthedApp();
    const res = await app.request('/acme-eng/coaching/technical?applicationId=app-123');
    expect(res.status).toBe(200);
    const body = await res.json() as {
      applicationId: string; stage: string;
      coaching: unknown; questions: unknown; personalHighlights: unknown;
      generatedAt: string;
    };
    expect(body.applicationId).toBe('app-123');
    expect(body.stage).toBe('technical');
    expect(body.coaching).toEqual({ stage: 'technical' });
    expect(body.questions).toEqual({ technical: [], behavioural: [], difficult: [] });
    expect(body.personalHighlights).toEqual([]);
  });
});
