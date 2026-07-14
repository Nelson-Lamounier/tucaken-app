/** @format */
import { __test } from '../redis-cache.js';

describe('projectCaseStudyKey (admin-api copy)', () => {
  it('matches the cross-repo contract format', () => {
    expect(__test.projectCaseStudyKey('abc-123')).toBe('shared:project:case_study:abc-123:v1');
  });
});

describe('invalidateProject', () => {
  it('DELs the project key and counts ok', async () => {
    const deleted: string[] = [];
    const client = { del: async (k: string) => { deleted.push(k); return 1; } };
    const counts: Array<{ cache: string; result: string }> = [];
    await __test.invalidateProjectWith(client, 'abc-123', (l) => counts.push(l));
    expect(deleted).toEqual(['shared:project:case_study:abc-123:v1']);
    expect(counts).toEqual([{ cache: 'project_case_study', result: 'ok' }]);
  });

  it('fail-open: a throwing client never throws, counts error', async () => {
    const client = { del: async () => { throw new Error('down'); } };
    const counts: Array<{ cache: string; result: string }> = [];
    await expect(
      __test.invalidateProjectWith(client, 'abc-123', (l) => counts.push(l)),
    ).resolves.toBeUndefined();
    expect(counts).toEqual([{ cache: 'project_case_study', result: 'error' }]);
  });
});
