import { describe, it, expect } from '@jest/globals';
import { deriveRepoSlug, ensureDefaultProject, archiveSupersededDefaults } from './projects.js';
import type { Queryable } from '../pg.js';

describe('deriveRepoSlug', () => {
  it('lower-cases and dashes the full name (mirrors migration 031)', () => {
    expect(deriveRepoSlug('Nelson-Lamounier/cdk-monitoring'))
      .toBe('nelson-lamounier-cdk-monitoring');
  });
  it('collapses runs of non-alphanumerics to a single dash', () => {
    expect(deriveRepoSlug('Owner/My__Repo..Name')).toBe('owner-my-repo-name');
  });
  it('trims leading and trailing dashes', () => {
    expect(deriveRepoSlug('__weird__/__name__')).toBe('weird-name');
  });
});

// Minimal Queryable stub. `existsRows` controls the NOT EXISTS guard result.
function fakeDb(existsRows: number) {
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  const db = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      if (/SELECT 1 FROM project_repositories/i.test(sql)) {
        return { rows: existsRows > 0 ? [{ one: 1 }] : [], rowCount: existsRows };
      }
      if (/INSERT INTO projects/i.test(sql))           return { rows: [{ id: 'proj-1' }], rowCount: 1 };
      if (/INSERT INTO project_components/i.test(sql))  return { rows: [{ id: 'comp-1' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  } as unknown as Queryable;
  return { db, calls };
}

describe('ensureDefaultProject', () => {
  it('no-ops when the repo already has a project_repositories link', async () => {
    const { db, calls } = fakeDb(1);
    await ensureDefaultProject(db, 'user-1', 'repo-1', 'Owner/repo');
    expect(calls.some(c => /INSERT INTO projects/i.test(c.sql))).toBe(false);
  });

  it('creates project + component + link when the repo has no project', async () => {
    const { db, calls } = fakeDb(0);
    await ensureDefaultProject(db, 'user-1', 'repo-1', 'Owner/My-Repo');
    const sqls = calls.map(c => c.sql).join(' || ');
    expect(sqls).toMatch(/INSERT INTO projects/i);
    expect(sqls).toMatch(/INSERT INTO project_components/i);
    expect(sqls).toMatch(/INSERT INTO project_repositories/i);
    const projInsert = calls.find(c => /INSERT INTO projects/i.test(c.sql))!;
    expect(projInsert.params).toContain('owner-my-repo');
    expect(projInsert.sql).toMatch(/'single_repo'/);
  });
});

describe('archiveSupersededDefaults', () => {
  it('archives only pristine single_repo defaults for the confirmed project\'s repos', async () => {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    const db = {
      query: async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        if (/UPDATE projects/i.test(sql)) {
          return { rows: [{ id: 'old-default-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Queryable;

    const archived = await archiveSupersededDefaults(db, 'user-1', 'confirmed-1');
    expect(archived).toEqual(['old-default-1']);
    const upd = calls.find(c => /UPDATE projects/i.test(c.sql))!;
    expect(upd.sql).toMatch(/status\s*=\s*'archived'/i);
    expect(upd.sql).toMatch(/shape\s*=\s*'single_repo'/i);
    expect(upd.sql).toMatch(/is_user_confirmed\s*=\s*FALSE/i);
    expect(upd.sql).toMatch(/case_study_status\s+IS\s+NULL/i);
    expect(upd.sql).toMatch(/user_overrides/i);
    expect(upd.params).toEqual(['user-1', 'confirmed-1']);
  });

  it('returns empty array when nothing matches', async () => {
    const db = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Queryable;
    expect(await archiveSupersededDefaults(db, 'user-1', 'confirmed-1')).toEqual([]);
  });
});
