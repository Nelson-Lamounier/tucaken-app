/** @format */
import { jest, describe, it, expect } from '@jest/globals';
import {
  reconcilePrepStatus,
  upsertStageUserState,
  markNotApplicable,
  getStagesForApp,
  listScheduledInterviews,
  advanceStageLifecycle,
  setStageOutcome,
  STAGE_OUTCOMES,
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

describe('listScheduledInterviews', () => {
  it('selects scheduled stages joined to the application, ordered by time', async () => {
    const row = {
      slug: 'app-1', company: 'Acme', role: 'SWE', kanban_status: 'interviewing',
      stage_type: 'technical', stage_status: 'current', scheduled_at: '2026-06-10T14:00:00Z',
    };
    const { pool, query } = fakePool([row]);
    const out = await listScheduledInterviews(pool);
    const sql = (query.mock.calls[0] as unknown[])[0] as string;
    expect(sql).toMatch(/FROM interview_stages/);
    expect(sql).toMatch(/JOIN job_applications/);
    expect(sql).toMatch(/scheduled_at IS NOT NULL/);
    expect(sql).toMatch(/ORDER BY s\.scheduled_at ASC/);
    expect(out).toEqual([row]);
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

describe('setStageOutcome', () => {
  it('rejects an outcome outside STAGE_OUTCOMES (no query issued)', async () => {
    const { pool, query } = fakePool([]);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setStageOutcome(pool, 'app-1', 'phone-screen', 'bogus' as any),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('exposes the canonical outcome set', () => {
    expect([...STAGE_OUTCOMES]).toEqual(['advanced', 'rejected', 'withdrew', 'not_completed', 'skipped']);
  });

  it('issues the owner-scoped UPDATE on (app, stage) setting outcome/outcome_at/last_activity_at', async () => {
    const { pool, query } = fakePool([]);
    await setStageOutcome(pool, 'app-1', 'phone-screen', 'advanced');

    expect(query).toHaveBeenCalledTimes(1);
    const sql = (query.mock.calls[0] as unknown[])[0] as string;
    expect(sql).toMatch(/UPDATE interview_stages/);
    expect(sql).toMatch(/outcome\s*=\s*\$3/);
    expect(sql).toMatch(/outcome_at\s*=\s*now\(\)/);
    expect(sql).toMatch(/last_activity_at\s*=\s*now\(\)/);
    expect(sql).toMatch(/job_application_id\s*=\s*\$1/);
    expect(sql).toMatch(/stage_type\s*=\s*\$2/);

    const params = (query.mock.calls[0] as unknown[])[1] as unknown[];
    expect(params).toEqual(['app-1', 'phone-screen', 'advanced']);
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
