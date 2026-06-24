import { describe, it, expect, jest } from '@jest/globals';

import { runCaseStudyReconcileTick, selectPendingCaseStudies } from './case-study-reconciler.js';

// ── selectPendingCaseStudies ─────────────────────────────────────────────────

describe('selectPendingCaseStudies', () => {
    it('queries pipeline_runs with a NOT EXISTS debounce/active-run guard', async () => {
        let capturedSql = '';
        const pool = {
            query: jest.fn(async (sql: string) => {
                capturedSql = sql;
                return { rows: [], rowCount: 0 };
            }),
        } as never;

        await selectPendingCaseStudies(pool);

        expect(capturedSql).toMatch(/pipeline_runs/i);
        expect(capturedSql).toMatch(/'case_study'/i);
        expect(capturedSql).toMatch(/case_study_status\s*=\s*'pending'/i);
        expect(capturedSql).toMatch(/is_user_confirmed\s*=\s*TRUE/i);
        expect(capturedSql).toMatch(/NOT EXISTS/i);
    });
});

// ── runCaseStudyReconcileTick ────────────────────────────────────────────────

it('dispatches a case-study job for each pending project and reports the count', async () => {
    const pool = {
        query: jest.fn(async (sql: string) => {
            if (/FROM projects/i.test(sql)) {
                return { rows: [{ id: 'p1', user_id: 'u1' }, { id: 'p2', user_id: 'u1' }], rowCount: 2 };
            }
            return { rows: [], rowCount: 0 };
        }),
    } as never;
    const dispatch = jest.fn(async () => ({ ok: true, pipelineRunId: 'r1', jobName: 'j1' }));
    const n = await runCaseStudyReconcileTick(pool, {} as never, dispatch as never);
    expect(n).toBe(2);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(pool, {}, 'u1', 'p1', 'reconciler');
    expect(dispatch).toHaveBeenCalledWith(pool, {}, 'u1', 'p2', 'reconciler');
});
