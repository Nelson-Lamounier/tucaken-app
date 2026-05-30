/** @format */
import { describe, it, expect, jest } from '@jest/globals';

const sqls: string[] = [];
const client = {
  query: jest.fn(async (sql: string) => {
    sqls.push(sql);
    if (/SELECT 1 FROM project_repositories/i.test(sql)) return { rows: [], rowCount: 0 };
    if (/INSERT INTO repositories/i.test(sql))           return { rows: [{ id: 'repo-1' }], rowCount: 1 };
    if (/INSERT INTO projects/i.test(sql))               return { rows: [{ id: 'p-1' }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  }),
  release: jest.fn(),
};

describe('connectRepoWithDefaultProject', () => {
  it('creates the repo and its default project in one transaction', async () => {
    const { connectRepoWithDefaultProject } = await import('../../src/routes/github.js');
    const fakePool = { connect: async () => client } as never;
    await connectRepoWithDefaultProject(fakePool, 'user-1', 'Owner/repo', 'main');
    const order = sqls.map(s =>
      /^\s*BEGIN/i.test(s) ? 'BEGIN'
      : /INSERT INTO repositories/i.test(s) ? 'REPO'
      : /INSERT INTO projects/i.test(s) ? 'PROJ'
      : /^\s*COMMIT/i.test(s) ? 'COMMIT' : '_');
    expect(order.filter(x => x !== '_')).toEqual(['BEGIN', 'REPO', 'PROJ', 'COMMIT']);
  });
});
