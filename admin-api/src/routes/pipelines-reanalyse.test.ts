/** @format */
import { jest } from '@jest/globals';
import { Hono } from 'hono';

const APP_ID = '00000000-0000-0000-0000-000000000001';

// Scripted application row returned by the RLS SELECT — mutated per test.
let appRow: { company: string; role: string; job_description: string | null; kanban_status: string } | null = {
  company: 'The Mater Private Network',
  role: 'Full Stack Developer',
  job_description: 'About the job — stored JD',
  kanban_status: 'analysis-ready',
};

const queries: Array<{ sql: string; params: unknown[] }> = [];
const upsertApplication = jest.fn(async () => {});
const insertPipelineRun = jest.fn(async (_db: unknown, _run: unknown) => {});
const createNamespacedJob = jest.fn(async () => ({}));

jest.unstable_mockModule('../lib/pg.js', () => ({
  getPool: () => ({}),
  withUser: async (
    _pool: unknown,
    _uid: string,
    fn: (db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> }) => unknown,
  ) => fn({
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      if (sql.includes('SELECT company, role, job_description')) {
        return appRow ? { rows: [appRow], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    },
  }),
}));

jest.unstable_mockModule('../lib/repositories/applications.js', () => ({ upsertApplication }));
jest.unstable_mockModule('../lib/repositories/articles.js', () => ({ upsertArticle: async () => {} }));
jest.unstable_mockModule('../lib/repositories/pipeline-runs.js', () => ({
  insertPipelineRun,
  getPipelineRun: async () => null,
}));

jest.unstable_mockModule('../lib/config.js', () => ({
  getJobImage: () => 'ecr.example/job-strategist:test',
  isImageConfigured: () => true,
  isAssetsBucketConfigured: () => false,
}));

jest.unstable_mockModule('../lib/k8s.js', () => ({
  getBatchApi: () => ({ createNamespacedJob }),
}));

jest.unstable_mockModule('../lib/k8s-job-builder.js', () => ({
  buildPipelineJob: (params: { env: Array<{ name: string; value: string }> }) => ({
    metadata: { name: 'strategist-test-job' },
    __env: params.env,
  }),
  sanitizeLabel: (s: string) => s,
}));

const { createPipelinesRouter } = await import('./pipelines.js');

function makeApp(): Hono {
  const app = new Hono();
  app.use('*', async (c, next) => {
    (c as unknown as { set: (k: string, v: string) => void }).set('userId', 'user-1');
    await next();
  });
  app.route('/', createPipelinesRouter({
    strategistPipelineNamespace: 'strategist',
    strategistPipelineServiceAccount: 'sa',
    articlePipelineNamespace: 'articles',
    articlePipelineServiceAccount: 'sa',
    researchModel: 'model-r',
    foundationModel: 'model-f',
    awsRegion: 'eu-west-1',
    assetsBucketName: null,
  } as never));
  return app;
}

async function post(body: unknown): Promise<Response> {
  return makeApp().request('/strategist-job', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  queries.length = 0;
  upsertApplication.mockClear();
  insertPipelineRun.mockClear();
  createNamespacedJob.mockClear();
  appRow = {
    company: 'The Mater Private Network',
    role: 'Full Stack Developer',
    job_description: 'About the job — stored JD',
    kanban_status: 'analysis-ready',
  };
});

describe('POST /strategist-job — reanalysis variant ({ applicationId })', () => {
  it('rejects a non-UUID applicationId with 400', async () => {
    const res = await post({ applicationId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the application is not visible to the caller', async () => {
    appRow = null;
    const res = await post({ applicationId: APP_ID });
    expect(res.status).toBe(404);
    expect(createNamespacedJob).not.toHaveBeenCalled();
  });

  it('returns 409 when an analysis is already running', async () => {
    appRow!.kanban_status = 'analysing';
    const res = await post({ applicationId: APP_ID });
    expect(res.status).toBe(409);
    expect(createNamespacedJob).not.toHaveBeenCalled();
  });

  it('returns 422 when the stored job description is empty', async () => {
    appRow!.job_description = '   ';
    const res = await post({ applicationId: APP_ID });
    expect(res.status).toBe(422);
    expect(createNamespacedJob).not.toHaveBeenCalled();
  });

  it('dispatches from the STORED row: same applicationId, stored JD in env, no new application row, no stage seeding', async () => {
    const res = await post({ applicationId: APP_ID });
    expect(res.status).toBe(202);
    const body = await res.json() as { applicationId: string; pipelineRunId: string };
    expect(body.applicationId).toBe(APP_ID);

    // No application insert, no stage seeding — the row already exists.
    expect(upsertApplication).not.toHaveBeenCalled();
    expect(queries.some((q) => q.sql.includes('interview_stages'))).toBe(false);

    // kanban flips to analysing so the card reflects the run and a double
    // dispatch hits the 409 guard.
    expect(queries.some((q) => q.sql.includes(`SET kanban_status = 'analysing'`))).toBe(true);

    // The K8s Job env carries the stored inputs.
    expect(createNamespacedJob).toHaveBeenCalledTimes(1);
    const job = (createNamespacedJob.mock.calls[0] as unknown as [{ body: { __env: Array<{ name: string; value: string }> } }])[0].body;
    const env = Object.fromEntries(job.__env.map((e) => [e.name, e.value]));
    expect(env['APPLICATION_ID']).toBe(APP_ID);
    expect(env['TARGET_COMPANY']).toBe('The Mater Private Network');
    expect(env['TARGET_ROLE']).toBe('Full Stack Developer');
    expect(env['JOB_DESCRIPTION']).toBe('About the job — stored JD');

    // pipeline_runs metadata is stamped as a reanalysis.
    const run = (insertPipelineRun.mock.calls[0] as unknown as [unknown, { referenceId: string; metadata: Record<string, unknown> }])[1];
    expect(run.referenceId).toBe(APP_ID);
    expect(run.metadata['reanalysis']).toBe(true);
  });
});

describe('POST /strategist-job — new-analysis variant (regression)', () => {
  it('still requires the company/role/JD trio when no applicationId is given', async () => {
    const res = await post({ targetRole: 'Engineer' });
    expect(res.status).toBe(400);
  });

  it('still creates the application row and seeds stages', async () => {
    const res = await post({
      targetCompany: 'Acme', targetRole: 'Engineer', jobDescription: 'JD text',
    });
    expect(res.status).toBe(202);
    expect(upsertApplication).toHaveBeenCalledTimes(1);
    const run = (insertPipelineRun.mock.calls[0] as unknown as [unknown, { metadata: Record<string, unknown> }])[1];
    expect(run.metadata['reanalysis']).toBeUndefined();
  });
});
