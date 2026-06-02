/**
 * @format
 * Tests for admin-api routes/applications.ts (PG-only after Phase 5).
 *
 * Covers the CRUD-shaped routes:
 *   GET    /                — list applications
 *   GET    /:slug           — application detail (assembled from PG)
 *   DELETE /:slug           — delete application
 *   POST   /:slug/status    — update kanban status
 *
 * The /:slug/coach and /:slug/coaching/:stage routes are covered by
 * applications-coach.test.ts.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Repository + pool mocks
// ---------------------------------------------------------------------------

const pgListApplicationsMock     = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
const pgGetApplicationMock       = jest.fn<() => Promise<unknown>>().mockResolvedValue(null);
const pgDeleteApplicationMock    = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const pgUpdateApplicationStatusMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

 
const poolQueryMock = jest.fn() as jest.Mock<any>;
poolQueryMock.mockResolvedValue({ rows: [] });

jest.unstable_mockModule('../../src/lib/repositories/applications.js', () => ({
  listApplications:        pgListApplicationsMock,
  getApplication:          pgGetApplicationMock,
  deleteApplication:       pgDeleteApplicationMock,
  updateApplicationStatus: pgUpdateApplicationStatusMock,
  updateInterviewStage:    jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../src/lib/repositories/interview-stages.js', () => ({
  upsertStageUserState:  jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  markNotApplicable:     jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  linkCoachRun:          jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getStagesForApp:       jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  reconcilePrepStatus:   jest.fn(),
  advanceStageLifecycle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../src/lib/repositories/pipeline-runs.js', () => ({
  insertPipelineRun: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getPipelineRun:    jest.fn(),
}));

jest.unstable_mockModule('../../src/lib/k8s.js', () => ({
  getBatchApi:    () => ({ createNamespacedJob: jest.fn() }),
  _resetBatchApi: () => {},
}));

jest.unstable_mockModule('../../src/lib/pg.js', () => ({
  getPool:    () => ({ query: poolQueryMock }),
  withUser:   async (_pool: unknown, _userId: string, fn: (db: { query: typeof poolQueryMock }) => Promise<unknown>) =>
    fn({ query: poolQueryMock }),
  _resetPool: () => {},
}));

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { Hono } = await import('hono');
const { createApplicationsRouter } = await import('../../src/routes/applications.js');

// ---------------------------------------------------------------------------
// Test configuration
// ---------------------------------------------------------------------------

const testConfig = {
  assetsBucketName: 'b',
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
  strategistPipelineNamespace: 'job-strategist',
  strategistPipelineServiceAccount: 'job-strategist-sa',
} as const;

function buildApp() {
  const app = new Hono();
  app.use('*', async (ctx, next) => {
     
    (ctx as any).set('jwtPayload', { sub: 'test-user' });
    (ctx as any).set('userId', 'test-user');
    await next();
  });
   
  app.route('/', createApplicationsRouter(testConfig as any));
  return app;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const APPLICATION_ROW = {
  id: 'app-uuid-1',
  userId: 'user-1',
  company: 'Acme',
  role: 'Senior Engineer',
  jobUrl: 'https://acme.example/jobs/1',
  jobDescription: 'Cool role',
  kanbanStatus: 'analysing',
  appliedAt: null,
  createdAt: new Date('2026-04-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
};

// ---------------------------------------------------------------------------
// GET / — list
// ---------------------------------------------------------------------------

describe('GET / — list applications', () => {
  beforeEach(() => {
    pgListApplicationsMock.mockReset();
  });

  it('returns 200 with summaries from PG', async () => {
    pgListApplicationsMock.mockResolvedValue([APPLICATION_ROW]);
    const res = await buildApp().request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { applications: unknown[]; count: number };
    expect(body.applications).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  it('forwards the status filter to the repository', async () => {
    pgListApplicationsMock.mockResolvedValue([]);
    await buildApp().request('/?status=interviewing');
    expect(pgListApplicationsMock).toHaveBeenCalledWith(expect.anything(), 'interviewing');
  });

  it('omits the status filter when not provided', async () => {
    pgListApplicationsMock.mockResolvedValue([]);
    await buildApp().request('/');
    expect(pgListApplicationsMock).toHaveBeenCalledWith(expect.anything(), undefined);
  });
});

// ---------------------------------------------------------------------------
// GET /:slug — detail
// ---------------------------------------------------------------------------

describe('GET /:slug — application detail', () => {
  beforeEach(() => {
    pgGetApplicationMock.mockReset();
    poolQueryMock.mockReset();
    poolQueryMock.mockResolvedValue({ rows: [] });
  });

  it('returns 404 when the application does not exist', async () => {
    pgGetApplicationMock.mockResolvedValue(null);
    const res = await buildApp().request('/missing');
    expect(res.status).toBe(404);
  });

  it('returns 200 with assembled application detail', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    poolQueryMock
      // pipeline_runs (analysis + research, raw pipeline field names)
      .mockResolvedValueOnce({
        rows: [{
          id: 'run-1',
          metadata: {
            analysis: {
              analysisXml:       '<analysis/>',
              coverLetter:       'Dear hiring team',
              resumeSuggestions: ['Add Kubernetes'],
              tailoredResumeData: { basics: { name: 'Raw Blob' } },
            },
            research: {
              fitSummary:       'Strong fit',
              overallFitRating: 'STRONG MATCH',
              verifiedMatches:  [{ skill: 'AWS', sourceCitation: 'cv', depth: 'deep', recency: 'current' }],
              gaps:             [{ skill: 'Go', gapType: 'missing', impactSeverity: 'blocking' }],
              experienceSignals: {
                yearsExpected:        5,
                domainExperience:     'fintech',
                leadershipExpectation: 'tech-lead',
                scaleIndicators:      'hyperscale',
              },
            },
          },
          created_at: new Date('2026-04-02T00:00:00Z'),
        }],
      })
      // coaching_content
      .mockResolvedValueOnce({
        rows: [{
          stage_type: 'technical',
          topics_to_study:     { topics: ['x'] },
          expected_questions:  { technical: [] },
          personal_highlights: ['win-1'],
        }],
      })
      // resumes
      .mockResolvedValueOnce({
        rows: [{
          id: 'resume-1',
          content_json: { basics: { name: 'Nelson' } },
          generated_at: new Date('2026-04-03T00:00:00Z'),
        }],
      })
      // company_interview_profiles — no profile for this company
      .mockResolvedValueOnce({ rows: [] })
      // dsa_evidence — no rows for this user
      .mockResolvedValueOnce({ rows: [] });

    const res = await buildApp().request('/app-uuid-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { application: Record<string, unknown> };
    expect(body.application['id']).toBe('app-uuid-1');
    expect(body.application['slug']).toBe('app-uuid-1');
    expect(body.application['targetCompany']).toBe('Acme');
    expect(body.application['targetRole']).toBe('Senior Engineer');
    expect(body.application['status']).toBe('analysing');
    // analysis: raw strategist output mapped to AnalysisOutput shape;
    // tailoredResume prefers the validated resumes row over the raw blob.
    expect(body.application['analysis']).toEqual({
      analysisXml:       '<analysis/>',
      coverLetter:       'Dear hiring team',
      metadata:          null,
      resumeSuggestions: ['Add Kubernetes'],
      tailoredResume:    { basics: { name: 'Nelson' } },
    });
    // research: pipeline field names normalised to UI ResearchOutput shape.
    expect(body.application['research']).toEqual({
      fitSummary:     'Strong fit',
      fitRating:      'STRONG_MATCH',
      verifiedMatches: [{ skill: 'AWS', sourceCitation: 'cv', depthBadge: 'deep', recency: 'current' }],
      partialMatches: [],
      gaps:           [{ skill: 'Go', gapType: 'missing', severity: 'blocking', isDisqualifying: true }],
      experienceSignals: {
        yearsExpected: 5,
        domain:        'fintech',
        leadership:    'tech-lead',
        scale:         'hyperscale',
      },
      technologyInventory: null,
    });
    // technicalRoundType defaults to 'dsa' when no company profile exists.
    expect(body.application['technicalRoundType']).toBe('dsa');
    expect(body.application['latestAnalysisRunId']).toBe('run-1');
    expect(body.application['context']).toEqual({
      pipelineId:               'run-1',
      cumulativeInputTokens:    0,
      cumulativeOutputTokens:   0,
      cumulativeThinkingTokens: 0,
      cumulativeCostUsd:        0,
    });
    expect(body.application['coaching']).toEqual({
      technical: {
        topics:    { topics: ['x'] },
        questions: { technical: [] },
        personal:  ['win-1'],
      },
    });
  });

  it('includes dsaTopicCalibration in research when present in pipeline metadata', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    const calibration = {
      likelyTopics: [{
        canonicalName:    'binary-search',
        displayName:      'Binary Search',
        confidence:       0.9,
        rationale:        'Mentioned in JD',
        jdEvidenceQuote:  'strong algorithmic skills required',
      }],
      honestyNote: 'Based on limited public data',
    };
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [{
          id: 'run-2',
          metadata: {
            analysis: null,
            research: {
              fitSummary:            'Good fit',
              overallFitRating:      'REASONABLE FIT',
              verifiedMatches:       [],
              gaps:                  [],
              dsaTopicCalibration:   calibration,
            },
          },
          created_at: new Date('2026-04-04T00:00:00Z'),
        }],
      })
      .mockResolvedValueOnce({ rows: [] })  // coaching_content
      .mockResolvedValueOnce({ rows: [] })  // resumes
      .mockResolvedValueOnce({ rows: [] })  // company_interview_profiles
      .mockResolvedValueOnce({ rows: [] }); // dsa_evidence

    const res = await buildApp().request('/app-uuid-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { application: Record<string, unknown> };
    const research = body.application['research'] as Record<string, unknown>;
    expect(research['dsaTopicCalibration']).toEqual(calibration);
  });

  it('passes pillarClassification through verbatim when present', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', metadata: { research: {
        fitSummary: 'x', overallFitRating: 'STRONG FIT', verifiedMatches: [], gaps: [],
        pillarClassification: { primaryPillar: 'devops-sre-platform', secondaryPillars: [], confidence: 0.8, jdEvidenceTokens: ['Kubernetes'], classificationNote: 'inferred' },
      } }, created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [] })  // coaching_content
      .mockResolvedValueOnce({ rows: [] })  // resumes
      .mockResolvedValueOnce({ rows: [] })  // company_interview_profiles
      .mockResolvedValueOnce({ rows: [] }); // dsa_evidence
    const res = await buildApp().request('/app-uuid-1');
    const body = (await res.json()) as { application: { research: Record<string, unknown> } };
    expect(body.application.research.pillarClassification).toEqual({
      primaryPillar: 'devops-sre-platform', secondaryPillars: [], confidence: 0.8, jdEvidenceTokens: ['Kubernetes'], classificationNote: 'inferred',
    });
  });

  it('resolves technicalRoundType from a mocked company profile', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })  // pipeline_runs
      .mockResolvedValueOnce({ rows: [] })  // coaching_content
      .mockResolvedValueOnce({ rows: [] })  // resumes
      // company_interview_profiles — profile with a technical stage
      .mockResolvedValueOnce({
        rows: [{
          process_shape: [
            { stage: 'phone-screen', round_type: 'behavioural' },
            { stage: 'technical-1',  round_type: 'practical'  },
            { stage: 'system-design', round_type: 'system-design' },
          ],
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // dsa_evidence

    const res = await buildApp().request('/app-uuid-1');
    const body = (await res.json()) as { application: Record<string, unknown> };
    expect(body.application['technicalRoundType']).toBe('practical');
  });

  it('accepts a new DevOps/AI round type (hands-on-lab) without rewriting it to dsa', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })  // pipeline_runs
      .mockResolvedValueOnce({ rows: [] })  // coaching_content
      .mockResolvedValueOnce({ rows: [] })  // resumes
      .mockResolvedValueOnce({ rows: [{ process_shape: [{ stage: 'technical-1', round_type: 'hands-on-lab' }] }] })  // company_interview_profiles
      .mockResolvedValueOnce({ rows: [] }); // dsa_evidence
    const res = await buildApp().request('/app-uuid-1');
    const body = (await res.json()) as { application: Record<string, unknown> };
    expect(body.application['technicalRoundType']).toBe('hands-on-lab');
  });

  it('defaults technicalRoundType to "dsa" when the profile has no technical stage', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })  // pipeline_runs
      .mockResolvedValueOnce({ rows: [] })  // coaching_content
      .mockResolvedValueOnce({ rows: [] })  // resumes
      // company_interview_profiles — profile with no technical round
      .mockResolvedValueOnce({
        rows: [{
          process_shape: [
            { stage: 'phone-screen', round_type: 'behavioural' },
          ],
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // dsa_evidence

    const res = await buildApp().request('/app-uuid-1');
    const body = (await res.json()) as { application: Record<string, unknown> };
    expect(body.application['technicalRoundType']).toBe('dsa');
  });

  it('returns null analysis/resume when no rows exist', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })  // pipeline_runs
      .mockResolvedValueOnce({ rows: [] })  // coaching_content
      .mockResolvedValueOnce({ rows: [] })  // resumes
      .mockResolvedValueOnce({ rows: [] })  // company_interview_profiles
      .mockResolvedValueOnce({ rows: [] })  // dsa_evidence
      .mockResolvedValueOnce({ rows: [] }); // devops_topic_mappings

    const res = await buildApp().request('/app-uuid-1');
    const body = (await res.json()) as { application: Record<string, unknown> };
    expect(body.application['analysis']).toBeNull();
    expect(body.application['research']).toBeNull();
    expect(body.application['latestAnalysisRunId']).toBeNull();
    expect(body.application['coaching']).toEqual({});
    expect(body.application['technicalRoundType']).toBe('dsa');
  });

  it('serves devopsEvidence aggregated by topic', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })  // pipeline_runs
      .mockResolvedValueOnce({ rows: [] })  // coaching_content
      .mockResolvedValueOnce({ rows: [] })  // resumes
      .mockResolvedValueOnce({ rows: [] })  // company_interview_profiles
      .mockResolvedValueOnce({ rows: [] })  // dsa_evidence
      // devops_topic_mappings aggregation
      .mockResolvedValueOnce({
        rows: [{
          canonical_topic_name: 'devops_iac',
          display_name:         'Infrastructure as Code',
          topic_group:          'iac',
          artifact_count:       2,
          samples:              [{ repo: 'o/r', file: 'main.tf', line: 3, rawName: 'terraform' }],
        }],
      });

    const res = await buildApp().request('/app-uuid-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { application: Record<string, unknown> };
    expect(body.application['devopsEvidence']).toEqual([
      {
        canonicalTopicName: 'devops_iac',
        displayName:        'Infrastructure as Code',
        topicGroup:         'iac',
        artifactCount:      2,
        samples:            [{ repo: 'o/r', file: 'main.tf', line: 3, rawName: 'terraform' }],
      },
    ]);
    // Honesty/RLS guardrails must be in the executed SQL: user-scoped + prose-suppressed.
    const devopsSql = poolQueryMock.mock.calls
      .map((c) => String(c[0]))
      .find((s) => /devops_topic_mappings/.test(s)) ?? '';
    expect(devopsSql).toMatch(/current_setting\('app\.current_user_id'\)/);
    expect(devopsSql).toMatch(/source_layer NOT IN \('readme','code-prose'\)/);
    expect(devopsSql).toMatch(/file_path !~\* /);
  });

  it('returns dsaRealWork aggregated by topic when dsa_evidence rows exist', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    const dsaRows = [
      {
        dsa_topic:      'graphs',
        match_count:    '3',
        top_confidence: 0.82,
        signals:        ['networkx_import'],
        samples:        [
          { repo: 'user/algo-repo', file: 'graph.py', line: 42 },
          { repo: 'user/algo-repo', file: 'bfs.py',   line: 10 },
        ],
      },
      {
        dsa_topic:      'heaps',
        match_count:    '1',
        top_confidence: 0.75,
        signals:        ['heap'],
        samples:        [{ repo: 'user/algo-repo', file: 'heap.py', line: 5 }],
      },
    ];
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })       // pipeline_runs
      .mockResolvedValueOnce({ rows: [] })       // coaching_content
      .mockResolvedValueOnce({ rows: [] })       // resumes
      .mockResolvedValueOnce({ rows: [] })       // company_interview_profiles
      .mockResolvedValueOnce({ rows: dsaRows }); // dsa_evidence

    const res = await buildApp().request('/app-uuid-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { application: Record<string, unknown> };
    const dsaRealWork = body.application['dsaRealWork'] as Array<Record<string, unknown>>;
    expect(Array.isArray(dsaRealWork)).toBe(true);
    expect(dsaRealWork).toHaveLength(2);

    const graphsTopic = dsaRealWork.find(t => t['canonicalName'] === 'graphs')!;
    expect(graphsTopic).toBeDefined();
    expect(graphsTopic['matchCount']).toBe(3);
    expect(graphsTopic['topConfidence']).toBe(0.82);
    expect(graphsTopic['signals']).toEqual(['networkx_import']);
    expect(graphsTopic['samples']).toHaveLength(2);
    expect(graphsTopic['samples'][0]).toEqual({ repo: 'user/algo-repo', file: 'graph.py', line: 42 });

    const heapsTopic = dsaRealWork.find(t => t['canonicalName'] === 'heaps')!;
    expect(heapsTopic).toBeDefined();
    expect(heapsTopic['matchCount']).toBe(1);
  });

  it('omits dsaRealWork and still returns 200 when the dsa_evidence query throws', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })      // pipeline_runs
      .mockResolvedValueOnce({ rows: [] })      // coaching_content
      .mockResolvedValueOnce({ rows: [] })      // resumes
      .mockResolvedValueOnce({ rows: [] })      // company_interview_profiles
      .mockRejectedValueOnce(new Error('relation "dsa_evidence" does not exist')); // dsa_evidence fails

    const res = await buildApp().request('/app-uuid-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { application: Record<string, unknown> };
    // dsaRealWork must be absent (fail-open), not present as null or an error
    expect(body.application['dsaRealWork']).toBeUndefined();
    // Other fields must still be present
    expect(body.application['id']).toBe('app-uuid-1');
    expect(body.application['technicalRoundType']).toBe('dsa');
  });

  it('fail-open: devops query throws → field omitted, still 200', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })  // pipeline_runs
      .mockResolvedValueOnce({ rows: [] })  // coaching_content
      .mockResolvedValueOnce({ rows: [] })  // resumes
      .mockResolvedValueOnce({ rows: [] })  // company_interview_profiles
      .mockResolvedValueOnce({ rows: [] })  // dsa_evidence
      .mockRejectedValueOnce(new Error('devops query exploded')); // devops_topic_mappings

    const res = await buildApp().request('/app-uuid-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { application: Record<string, unknown> };
    expect(body.application['devopsEvidence']).toBeUndefined();
  });

  it('returns empty dsaRealWork array when user has no dsa_evidence rows', async () => {
    pgGetApplicationMock.mockResolvedValue(APPLICATION_ROW);
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })  // pipeline_runs
      .mockResolvedValueOnce({ rows: [] })  // coaching_content
      .mockResolvedValueOnce({ rows: [] })  // resumes
      .mockResolvedValueOnce({ rows: [] })  // company_interview_profiles
      .mockResolvedValueOnce({ rows: [] }); // dsa_evidence — no rows

    const res = await buildApp().request('/app-uuid-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { application: Record<string, unknown> };
    expect(body.application['dsaRealWork']).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DELETE /:slug
// ---------------------------------------------------------------------------

describe('DELETE /:slug — delete application (PG-only)', () => {
  beforeEach(() => {
    pgDeleteApplicationMock.mockReset();
    pgDeleteApplicationMock.mockResolvedValue(undefined);
  });

  it('returns 200 with deleted: true', async () => {
    const res = await buildApp().request('/app-uuid-1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: boolean; slug: string };
    expect(body.deleted).toBe(true);
    expect(body.slug).toBe('app-uuid-1');
  });

  it('calls deleteApplication exactly once with the slug', async () => {
    await buildApp().request('/app-uuid-1', { method: 'DELETE' });
    expect(pgDeleteApplicationMock).toHaveBeenCalledTimes(1);
    expect(pgDeleteApplicationMock).toHaveBeenCalledWith(expect.anything(), 'app-uuid-1');
  });
});

// ---------------------------------------------------------------------------
// POST /:slug/status
// ---------------------------------------------------------------------------

describe('POST /:slug/status — update kanban status (PG-only)', () => {
  beforeEach(() => {
    pgUpdateApplicationStatusMock.mockReset();
    pgUpdateApplicationStatusMock.mockResolvedValue(undefined);
  });

  it('returns 200 and forwards the status to the repository', async () => {
    const res = await buildApp().request('/app-uuid-1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'interviewing' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; status: string };
    expect(body.success).toBe(true);
    expect(body.status).toBe('interviewing');
    expect(pgUpdateApplicationStatusMock).toHaveBeenCalledWith(
      expect.anything(),
      'app-uuid-1',
      'interviewing',
    );
  });

  it('returns 400 for an unknown status', async () => {
    const res = await buildApp().request('/app-uuid-1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'bogus' }),
    });
    expect(res.status).toBe(400);
    expect(pgUpdateApplicationStatusMock).not.toHaveBeenCalled();
  });

  it('returns 400 when status is missing', async () => {
    const res = await buildApp().request('/app-uuid-1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(pgUpdateApplicationStatusMock).not.toHaveBeenCalled();
  });

  it('processes interviewStage in the body when present', async () => {
    pgGetApplicationMock.mockResolvedValueOnce({
      id: 'app-uuid-1',
      userId: 'user-1',
      company: 'Acme',
      role: 'Senior Engineer',
      jobUrl: null,
      jobDescription: 'Cool role',
      kanbanStatus: 'applied',
      interviewStage: 'applied',
      appliedAt: null,
    });
    const res = await buildApp().request('/app-uuid-1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied', interviewStage: 'applied' }),
    });
    expect(res.status).toBe(200);
    expect(pgUpdateApplicationStatusMock).toHaveBeenCalledTimes(1);
    // updateApplicationStatus receives (pool, slug, status) — 3 args
    expect(pgUpdateApplicationStatusMock.mock.calls[0]?.length).toBe(3);
  });
});
