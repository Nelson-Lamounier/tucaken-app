/** @format */
import { jest } from '@jest/globals';

const SAMPLE_ROWS = [
  { family_key: 'devops', candidate_type: 'tool', value: 'argocd', votes: 4 },
  { family_key: 'backend', candidate_type: 'concept', value: 'cqrs', votes: 2 },
];

// Capture the params the handler passes so we can assert min_votes clamping.
const queryCalls: unknown[][] = [];

/** The params array ([minVotes]) from the first captured pool.query call. */
function firstQueryParams(): unknown {
  const call = queryCalls[0];
  if (call === undefined) throw new Error('pool.query was not called');
  return call[1];
}

jest.unstable_mockModule('../../../lib/pg.js', () => ({
  getPool: () => ({
    query: async (...args: unknown[]) => {
      queryCalls.push(args);
      return { rows: SAMPLE_ROWS, rowCount: SAMPLE_ROWS.length };
    },
  }),
}));

jest.unstable_mockModule('../../../lib/observability/logger.js', () => ({
  logger: { error: () => {}, warn: () => {}, info: () => {} },
}));

const { createRoleOntologyRouter } = await import('../role-ontology.js');
const router = createRoleOntologyRouter({} as never);

describe('GET /candidates', () => {
  beforeEach(() => {
    queryCalls.length = 0;
  });

  it('returns candidate rows and defaults min_votes to 1', async () => {
    const res = await router.request('/candidates');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { candidates: unknown[] };
    expect(body.candidates).toEqual(SAMPLE_ROWS);
    // Second positional arg to pool.query is the params array: [minVotes].
    expect(firstQueryParams()).toEqual([1]);
  });

  it('parses and clamps min_votes (>= 1)', async () => {
    await router.request('/candidates?min_votes=3');
    expect(firstQueryParams()).toEqual([3]);

    queryCalls.length = 0;
    await router.request('/candidates?min_votes=0');
    expect(firstQueryParams()).toEqual([1]);

    queryCalls.length = 0;
    await router.request('/candidates?min_votes=not-a-number');
    expect(firstQueryParams()).toEqual([1]);
  });
});
