/** @format */
import { jest, describe, it, expect } from '@jest/globals';
import {
  upsertStageFeedback,
  getStageFeedback,
  FEEDBACK_CATEGORIES,
} from '../stage-feedback.js';

function fakePool(rows: unknown[]) {
  const query = jest.fn(async () => ({ rows }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pool: { query } as any, query };
}

describe('FEEDBACK_CATEGORIES', () => {
  it('exposes the canonical category set', () => {
    expect([...FEEDBACK_CATEGORIES]).toEqual([
      'compensation',
      'skills_mismatch',
      'culture_fit',
      'communication',
      'technical_perf',
      'process_timing',
      'unclear',
      'other',
    ]);
  });
});

describe('upsertStageFeedback', () => {
  it('rejects a userCategory outside FEEDBACK_CATEGORIES (no query issued)', async () => {
    const { pool, query } = fakePool([]);
    await expect(
      upsertStageFeedback(pool, 'app-1', 'phone-screen', 'user-1', { userCategory: 'bogus' }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a non-integer prepSelfRating (no query issued)', async () => {
    const { pool, query } = fakePool([]);
    await expect(
      upsertStageFeedback(pool, 'app-1', 'phone-screen', 'user-1', { prepSelfRating: 2.5 }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a prepSelfRating out of 1..5 range (no query issued)', async () => {
    const { pool, query } = fakePool([]);
    await expect(
      upsertStageFeedback(pool, 'app-1', 'phone-screen', 'user-1', { prepSelfRating: 6 }),
    ).rejects.toThrow();
    await expect(
      upsertStageFeedback(pool, 'app-1', 'phone-screen', 'user-1', { prepSelfRating: 0 }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('issues the UPSERT with user_id + ON CONFLICT for valid input', async () => {
    const { pool, query } = fakePool([]);
    await upsertStageFeedback(pool, 'app-1', 'phone-screen', 'user-1', {
      userCategory: 'compensation',
      userNote: 'comp too low',
      companyFeedback: 'strong technically',
      companyFeedbackVerbatim: true,
      prepSelfRating: 4,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const sql = (query.mock.calls[0] as unknown[])[0] as string;
    expect(sql).toMatch(/INSERT INTO application_stage_feedback/);
    expect(sql).toMatch(/ON CONFLICT \(job_application_id, stage_type\)/);
    expect(sql).toMatch(/DO UPDATE SET/);
    expect(sql).toMatch(/updated_at\s*=\s*now\(\)/);
    expect(sql).toMatch(/user_id/);

    const params = (query.mock.calls[0] as unknown[])[1] as unknown[];
    // app_id, stage_type, user_id must be present and in the leading positions
    expect(params).toContain('app-1');
    expect(params).toContain('phone-screen');
    expect(params).toContain('user-1');
  });

  it('accepts an empty input (clears prior values) and still issues the UPSERT with user_id', async () => {
    const { pool, query } = fakePool([]);
    await upsertStageFeedback(pool, 'app-1', 'phone-screen', 'user-1', {});
    expect(query).toHaveBeenCalledTimes(1);
    const params = (query.mock.calls[0] as unknown[])[1] as unknown[];
    expect(params).toContain('user-1');
  });
});

describe('getStageFeedback', () => {
  it('SELECTs the feedback row for (app, stage)', async () => {
    const { pool, query } = fakePool([
      {
        user_category: 'compensation',
        user_note: 'comp too low',
        company_feedback: null,
        company_feedback_verbatim: false,
        prep_self_rating: 4,
      },
    ]);
    const row = await getStageFeedback(pool, 'app-1', 'phone-screen');

    expect(query).toHaveBeenCalledTimes(1);
    const sql = (query.mock.calls[0] as unknown[])[0] as string;
    expect(sql).toMatch(/SELECT/);
    expect(sql).toMatch(/FROM application_stage_feedback/);
    expect(sql).toMatch(/job_application_id\s*=\s*\$1/);
    expect(sql).toMatch(/stage_type\s*=\s*\$2/);

    const params = (query.mock.calls[0] as unknown[])[1] as unknown[];
    expect(params).toEqual(['app-1', 'phone-screen']);
    expect(row?.user_category).toBe('compensation');
  });

  it('returns null when no row exists', async () => {
    const { pool } = fakePool([]);
    const row = await getStageFeedback(pool, 'app-1', 'phone-screen');
    expect(row).toBeNull();
  });
});
