import { describe, it, expect } from '@jest/globals';
import { deriveRepoSlug, ensureDefaultProject, archiveSupersededDefaults, cleanupOrphanedDefaultProjects, stampProjectIntent } from './projects.js';
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

// Minimal Queryable stub. `existsRows` controls the NOT EXISTS guard result;
// `existingComponentId` simulates a project that already has a default component
// (the orphan case — a project left behind after its repo was removed).
function fakeDb(existsRows: number, existingComponentId?: string) {
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  const db = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      if (/SELECT 1 FROM project_repositories/i.test(sql)) {
        return { rows: existsRows > 0 ? [{ one: 1 }] : [], rowCount: existsRows };
      }
      if (/INSERT INTO projects/i.test(sql))           return { rows: [{ id: 'proj-1' }], rowCount: 1 };
      if (/SELECT id FROM project_components/i.test(sql)) {
        return existingComponentId
          ? { rows: [{ id: existingComponentId }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
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
    // Upsert reads the real id back so the component never references a
    // non-existent project (the FK-violation bug on re-add).
    expect(projInsert.sql).toMatch(/ON CONFLICT \(user_id, slug\) DO UPDATE/i);
    expect(projInsert.sql).toMatch(/RETURNING id/i);
  });

  it('reuses the existing component when the project lingers (orphan re-add)', async () => {
    const { db, calls } = fakeDb(0, 'existing-comp');
    await ensureDefaultProject(db, 'user-1', 'repo-1', 'Owner/My-Repo');
    // Project already had a component -> do NOT insert a duplicate 'Main'.
    expect(calls.some(c => /INSERT INTO project_components/i.test(c.sql))).toBe(false);
    // The repo link is attached to the reused component id.
    const link = calls.find(c => /INSERT INTO project_repositories/i.test(c.sql))!;
    expect(link.params).toContain('existing-comp');
  });
});

describe('cleanupOrphanedDefaultProjects', () => {
  function fakeDelDb() {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    const db = {
      query: async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        // The final project DELETE returns the ids it removed.
        if (/DELETE FROM projects/i.test(sql)) {
          return { rows: [{ id: 'orphan-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Queryable;
    return { db, calls };
  }

  it('no-ops (no queries) when there are no seeded project ids', async () => {
    const { db, calls } = fakeDelDb();
    const removed = await cleanupOrphanedDefaultProjects(db, 'user-1', []);
    expect(removed).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('only ever targets pristine single_repo orphans (cluster-safe predicate)', async () => {
    const { db, calls } = fakeDelDb();
    const removed = await cleanupOrphanedDefaultProjects(db, 'user-1', ['p-1']);
    expect(removed).toEqual(['orphan-1']);
    const del = calls.find(c => /DELETE FROM projects/i.test(c.sql))!;
    // Every guard that protects a curated cluster must be present.
    expect(del.sql).toMatch(/shape\s*=\s*'single_repo'/i);
    expect(del.sql).toMatch(/is_user_confirmed\s*=\s*FALSE/i);
    expect(del.sql).toMatch(/case_study_status\s+IS\s+NULL/i);
    expect(del.sql).toMatch(/NOT EXISTS/i);
    expect(del.params).toEqual(['user-1', ['p-1']]);
  });
});

describe('stampProjectIntent', () => {
  function db(capture: { sql: string; params: readonly unknown[] }[]) {
    return { query: async (sql: string, params: readonly unknown[] = []) => { capture.push({ sql, params }); return { rows: [], rowCount: 1 }; } } as unknown as import('../pg.js').Queryable;
  }
  it('build: sets post_sync_action=build on the single_repo default by slug', async () => {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    await stampProjectIntent(db(calls), 'user-1', 'Owner/My-Repo', { action: 'build' });
    const u = calls.find(c => /UPDATE projects/i.test(c.sql))!;
    expect(u.sql).toMatch(/post_sync_action\s*=\s*\$/i);
    expect(u.sql).toMatch(/shape\s*=\s*'single_repo'/i);
    expect(u.params).toEqual(['user-1', 'owner-my-repo', 'build', null]);
  });
  it('link: stores the target project id', async () => {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    await stampProjectIntent(db(calls), 'user-1', 'Owner/My-Repo', { action: 'link', targetProjectId: 'proj-9' });
    const u = calls.find(c => /UPDATE projects/i.test(c.sql))!;
    expect(u.params).toEqual(['user-1', 'owner-my-repo', 'link', 'proj-9']);
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
