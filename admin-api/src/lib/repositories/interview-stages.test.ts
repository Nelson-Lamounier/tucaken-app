/** @format */
import { jest, describe, it, expect } from '@jest/globals';
import {
  reconcilePrepStatus,
  upsertStageUserState,
  markNotApplicable,
  getStagesForApp,
  advanceStageLifecycle,
} from './interview-stages.js';

function fakePool(rows: unknown[]) {
  const query = jest.fn(async () => ({ rows }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pool: { query } as any, query };
}

describe('reconcilePrepStatus', () => {
  it('maps coach run status (+ content presence) → prep_status', () => {
    expect(reconcilePrepStatus(null, false)).toBe('none');
    expect(reconcilePrepStatus('queued', false)).toBe('queued');
    expect(reconcilePrepStatus('coaching', false)).toBe('queued');
    expect(reconcilePrepStatus('complete', true)).toBe('ready');
    expect(reconcilePrepStatus('complete', false)).toBe('queued');
    expect(reconcilePrepStatus('failed', false)).toBe('failed');
  });
});

describe('upsertStageUserState', () => {
  it('UPSERTs on (app, stage)', async () => {
    const { pool, query } = fakePool([]);
    await upsertStageUserState(pool, 'app-1', 'phone-screen', { compTarget: '95000' }, '2026-06-05T14:00');
    const sql = (query.mock.calls[0] as unknown[])[0] as string;
    expect(sql).toMatch(/INSERT INTO interview_stages/);
    expect(sql).toMatch(/ON CONFLICT \(job_application_id, stage_type\)/);
  });
});

describe('markNotApplicable', () => {
  it('sets stage_status to not_applicable', async () => {
    const { pool, query } = fakePool([]);
    await markNotApplicable(pool, 'app-1', 'technical');
    const sql = (query.mock.calls[0] as unknown[])[0] as string;
    expect(sql).toMatch(/INSERT INTO interview_stages/);
    expect(sql).toMatch(/not_applicable/);
  });
});

describe('advanceStageLifecycle', () => {
  it('issues UPDATE completed then INSERT/ON CONFLICT current', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = { query } as any;
    await advanceStageLifecycle(pool, 'app-1', 'technical');

    expect(query).toHaveBeenCalledTimes(2);

    const firstSql = (query.mock.calls[0] as unknown[])[0] as string;
    expect(firstSql).toMatch(/UPDATE interview_stages/);
    expect(firstSql).toMatch(/stage_status = 'completed'/);
    expect(firstSql).toMatch(/stage_status = 'current'/);
    expect(firstSql).toMatch(/stage_type <> \$2/);
    const firstParams = (query.mock.calls[0] as unknown[])[1] as unknown[];
    expect(firstParams).toEqual(['app-1', 'technical']);

    const secondSql = (query.mock.calls[1] as unknown[])[0] as string;
    expect(secondSql).toMatch(/INSERT INTO interview_stages/);
    expect(secondSql).toMatch(/ON CONFLICT \(job_application_id, stage_type\)/);
    expect(secondSql).toMatch(/stage_status = 'current'/);
    const secondParams = (query.mock.calls[1] as unknown[])[1] as unknown[];
    expect(secondParams).toEqual(['app-1', 'technical']);
  });
});

describe('getStagesForApp', () => {
  it('reconciles prep_status from joined coach run + content', async () => {
    const { pool } = fakePool([
      {
        stage_type: 'phone-screen',
        stage_status: 'current',
        scheduled_at: null,
        user_state: {},
        coach_run_id: 'c1',
        coach_status: 'complete',
        has_content: true,
      },
      {
        stage_type: 'technical',
        stage_status: 'upcoming',
        scheduled_at: null,
        user_state: {},
        coach_run_id: null,
        coach_status: null,
        has_content: false,
      },
    ]);
    const out = await getStagesForApp(pool, 'app-1');
    expect(out.find(s => s.stage_type === 'phone-screen')!.prep_status).toBe('ready');
    expect(out.find(s => s.stage_type === 'technical')!.prep_status).toBe('none');
  });
});
