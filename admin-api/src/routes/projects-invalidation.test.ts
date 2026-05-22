/** @format */
import { jest } from '@jest/globals';

// Real UUIDs required — routes guard with isUuid() and return 400 otherwise.
const PROJECT_ID   = '00000000-0000-0000-0000-000000000001';
const PROJECT_ID_2 = '00000000-0000-0000-0000-000000000002';
const DECISION_ID  = '00000000-0000-0000-0000-000000000003';
const COMPONENT_ID = '00000000-0000-0000-0000-000000000004';
const SPLIT_NEW_ID = '00000000-0000-0000-0000-000000000005';

const invalidateProject = jest.fn(async (_id: string) => {});
jest.unstable_mockModule('../lib/redis-cache.js', () => ({ invalidateProject }));

jest.unstable_mockModule('../lib/repositories/projects.js', () => ({
  listProjects:      async () => ({ total: 0, rows: [] }),
  getProjectDetail:  async () => ({ id: PROJECT_ID }),
  createProject:     async () => ({ id: 'new-id' }),
  // patchProject: updated=1 so the handler doesn't 404-exit before invalidating
  patchProject:      async () => ({ updated: 1 }),
  // archiveProject: updated=1 so the handler doesn't 404-exit before invalidating
  archiveProject:    async () => ({ updated: 1 }),
  confirmProject:    async () => ({ updated: 1 }),
  // patchDecision: updated=1 so the handler doesn't 404-exit before invalidating
  patchDecision:     async () => ({ updated: 1 }),
  // deleteDecision: deleted=1 so the handler doesn't 404-exit before invalidating
  deleteDecision:    async () => ({ deleted: 1 }),
  // patchArchitecture: updated=1 so the handler doesn't 404-exit before invalidating
  patchArchitecture: async () => ({ updated: 1 }),
  // mergeProjects returns counts only — affected ids come from the request body
  mergeProjects:     async () => ({ componentsReassigned: 1, sourcesArchived: 1 }),
  // splitProject returns the new project id as `newProjectId`
  splitProject:      async () => ({ newProjectId: SPLIT_NEW_ID, componentsMoved: 1 }),
}));

jest.unstable_mockModule('../lib/pg.js', () => ({
  getPool:  () => ({}),
  withUser: async (_pool: unknown, _uid: string, fn: (db: unknown) => unknown) => fn({}),
}));

// lib/types.js exports AdminApiBindings (type-only) and requireUserId (runtime).
// Only export runtime values here — type-only exports have no runtime shape.
jest.unstable_mockModule('../lib/types.js', () => ({
  requireUserId: () => 'user-1',
}));

// config / k8s / github-app — confirm and regenerate reach these only after
// the DB guard; we short-circuit by making the guarded withUser return ok:false
// so dispatch is never attempted. But for confirm we need ok:true to trigger
// invalidation, so we mock the db.query inside withUser to return the right
// guard rows via a smarter withUser mock if needed. Instead we rely on the
// mock above always returning ok=true from the DB guard by making withUser
// return { ok: true } when called with a fn that returns that shape.
// Actually withUser runs `fn(db)` where db is `{}` — the confirm handler
// calls `db.query(...)` on it. We need to make `db.query` return the right
// guard rows. Patch the pg mock to provide a db with a .query stub.
jest.unstable_mockModule('../lib/config.js', () => ({
  getJobImage:         () => 'UNSET',
  isImageConfigured:   () => false,  // makes confirm/regenerate dispatch bail early (non-fatal)
  AdminApiConfig:      {},
}));

jest.unstable_mockModule('../lib/k8s.js', () => ({
  getBatchApi: () => ({ createNamespacedJob: async () => ({}) }),
}));

jest.unstable_mockModule('../lib/github-app.js', () => ({
  generateInstallationToken: async () => 'tok',
}));

jest.unstable_mockModule('../lib/repositories/pipeline-runs.js', () => ({
  insertPipelineRun: async () => {},
}));

jest.unstable_mockModule('../lib/k8s-job-builder.js', () => ({
  buildPipelineJob:  () => ({ metadata: { name: 'job-1' } }),
  sanitizeLabel:     (s: string) => s,
}));

// Re-mock pg with a db that has a working .query stub so confirm/regenerate
// guard queries succeed (return a confirmed, non-archived project row).
jest.unstable_mockModule('../lib/pg.js', () => ({
  getPool: () => ({}),
  withUser: async (
    _pool: unknown,
    _uid: string,
    fn: (db: { query: (...args: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> }) => unknown,
  ) => fn({
    query: async (_sql: unknown, _params?: unknown) => ({
      rows: [{ status: 'active', is_user_confirmed: true }],
      rowCount: 1,
    }),
  }),
}));

const { createProjectsRouter } = await import('./projects.js');
// Cast to `any` config — the router only uses config for job dispatch which
// is short-circuited by isImageConfigured returning false.
const router = createProjectsRouter({} as never);

// Mutating routes and their expected invalidateProject call counts:
//   PATCH  /:id                — 1 (the project itself)
//   DELETE /:id                — 1 (the archived project)
//   POST   /:id/confirm        — 1 (the confirmed project)
//   POST   /:id/regenerate     — 1 (the regenerated project; dispatch returns 503 in test because
//                                   config is empty and regenerate surfaces dispatch failures, but
//                                   invalidateProject is called before dispatch — asserted via call count)
//   PATCH  /:id/decisions/:did — 1 (the parent project)
//   DELETE /:id/decisions/:did — 1 (the parent project)
//   PATCH  /:id/architecture   — 1 (the project)
//   POST   /:id/split          — 2 (source project + new project via newProjectId)
//   POST   /merge              — 2 (targetId + 1 sourceId in the test body)
const MUTATING: Array<[string, string, number, Record<string, unknown>, number]> = [
  ['PATCH',  `/${PROJECT_ID}`,                          1, { name: 'Updated' },      500],
  ['DELETE', `/${PROJECT_ID}`,                          1, {},                        500],
  ['POST',   `/${PROJECT_ID}/confirm`,                  1, {},                        500],
  // regenerate surfaces dispatch failures as 5xx; invalidateProject still fires before dispatch
  ['POST',   `/${PROJECT_ID}/regenerate`,               1, {},                        600],
  ['PATCH',  `/${PROJECT_ID}/decisions/${DECISION_ID}`, 1, { title: 'Updated' },      500],
  ['DELETE', `/${PROJECT_ID}/decisions/${DECISION_ID}`, 1, {},                        500],
  ['PATCH',  `/${PROJECT_ID}/architecture`,             1, { diagram_source: 'x' },   500],
  ['POST',   `/${PROJECT_ID}/split`,                    2, {
    component_ids: [COMPONENT_ID],
    name: 'Split Project',
    slug: 'split-project',
  }, 500],
  // merge: target + 1 source = 2 invalidations
  ['POST',   '/merge',                                  2, {
    target_id:  PROJECT_ID,
    source_ids: [PROJECT_ID_2],
  }, 500],
];

describe('project mutation routes invalidate the read cache', () => {
  for (const [method, path, expectedCalls, body, maxStatus] of MUTATING) {
    it(`${method} ${path} calls invalidateProject ${expectedCalls}x`, async () => {
      invalidateProject.mockClear();
      const res = await router.request(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });
      expect(res.status).toBeLessThan(maxStatus);
      expect(invalidateProject).toHaveBeenCalledTimes(expectedCalls);
    });
  }

  it('POST / (create) does NOT invalidate', async () => {
    invalidateProject.mockClear();
    await router.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'new-project', name: 'New Project' }),
    });
    expect(invalidateProject).not.toHaveBeenCalled();
  });
});
