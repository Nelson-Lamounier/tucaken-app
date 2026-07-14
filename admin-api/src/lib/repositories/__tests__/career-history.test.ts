/**
 * @format
 * Unit tests for updateCareerEntry correction logging.
 *
 * Verifies that field-level diffs between the existing raw_data and the
 * incoming rawData are written to resume_import_corrections inside the same
 * transaction as the UPDATE, and that the model_id is sourced from
 * prompt_invocations for the import.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockClientQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>();
const mockRelease = jest.fn<() => void>();
const mockConnect = jest.fn(async () => ({ query: mockClientQuery, release: mockRelease }));

jest.unstable_mockModule('pg', () => {
  class Pool {
    connect = mockConnect;
    query = jest.fn();
  }
  return { Pool, default: { Pool } };
});

const { updateCareerEntry, confirmImportForEnrichment, getImportProgress, getGapReport } =
  await import('../career-history.js');

const fakePool = { connect: mockConnect } as unknown as import('pg').Pool;

const ENTRY_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID  = '22222222-2222-2222-2222-222222222222';
const IMPORT_ID = '33333333-3333-3333-3333-333333333333';

function setupSelectAndUpdate(beforeRaw: Record<string, unknown>) {
  mockClientQuery.mockImplementation(async (sql: unknown) => {
    const text = String(sql).trim().toUpperCase();
    if (text.startsWith('BEGIN'))    return { rows: [], rowCount: 0 };
    if (text.startsWith('COMMIT'))   return { rows: [], rowCount: 0 };
    if (text.startsWith('ROLLBACK')) return { rows: [], rowCount: 0 };
    if (text.startsWith('SELECT RAW_DATA')) {
      return {
        rows: [{ raw_data: beforeRaw, import_id: IMPORT_ID, entry_type: 'experience' }],
        rowCount: 1,
      };
    }
    if (text.startsWith('UPDATE USER_CAREER_HISTORY')) {
      return {
        rows: [{
          id: ENTRY_ID, user_id: USER_ID, import_id: IMPORT_ID,
          entry_type: 'experience',
          raw_data: {}, enriched_data: null,
          enrichment_status: 'pending', enrichment_skipped_reason: null,
          display_order: 0, created_at: new Date(), updated_at: new Date(),
        }],
        rowCount: 1,
      };
    }
    if (text.startsWith('SELECT MODEL_ID')) {
      return { rows: [{ model_id: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0' }], rowCount: 1 };
    }
    if (text.startsWith('INSERT INTO RESUME_IMPORT_CORRECTIONS')) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

function correctionInserts(): unknown[][] {
  return mockClientQuery.mock.calls
    .filter(([sql]) => String(sql).trim().toUpperCase().startsWith('INSERT INTO RESUME_IMPORT_CORRECTIONS'))
    .map(([, params]) => params as unknown[]);
}

describe('updateCareerEntry — correction logging', () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
    mockRelease.mockReset();
    mockConnect.mockClear();
  });

  it('returns null and rolls back when entry does not exist', async () => {
    mockClientQuery.mockImplementation(async (sql: unknown) => {
      const text = String(sql).trim().toUpperCase();
      if (text.startsWith('SELECT RAW_DATA')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    const result = await updateCareerEntry(fakePool, ENTRY_ID, USER_ID, { title: 'X' });
    expect(result).toBeNull();

    const sqlCalls = mockClientQuery.mock.calls.map(([sql]) => String(sql).trim().toUpperCase());
    expect(sqlCalls.some((s) => s.startsWith('BEGIN'))).toBe(true);
    expect(sqlCalls.some((s) => s.startsWith('ROLLBACK'))).toBe(true);
    expect(sqlCalls.some((s) => s.startsWith('COMMIT'))).toBe(false);
    expect(mockRelease).toHaveBeenCalled();
  });

  it('logs one correction row per changed top-level field', async () => {
    setupSelectAndUpdate({
      title:   'Senior Engineer',
      company: 'TechCorp',
      period:  '2020-2023',
      highlights: ['Led team'],
    });

    await updateCareerEntry(fakePool, ENTRY_ID, USER_ID, {
      title:   'Staff Engineer',          // changed
      company: 'TechCorp',                // unchanged
      period:  '2020-2024',               // changed
      highlights: ['Led team'],           // unchanged
    });

    const inserts = correctionInserts();
    expect(inserts).toHaveLength(2);
    const fields = inserts.map((params) => params[4]).sort();
    expect(fields).toEqual(['period', 'title']);
  });

  it('diffs array elements positionally as path[i]', async () => {
    setupSelectAndUpdate({
      title:      'Senior Engineer',
      company:    'TechCorp',
      period:     '2020-2023',
      highlights: ['Led team', 'Shipped features'],
    });

    await updateCareerEntry(fakePool, ENTRY_ID, USER_ID, {
      title:      'Senior Engineer',
      company:    'TechCorp',
      period:     '2020-2023',
      highlights: ['Led team', 'Shipped 12 features in 2023'],   // index 1 changed
    });

    const inserts = correctionInserts();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[4]).toBe('highlights[1]');
  });

  it('emits zero correction rows when rawData is unchanged', async () => {
    const same = { title: 'Engineer', company: 'C', period: 'P', highlights: ['a'] };
    setupSelectAndUpdate(same);
    await updateCareerEntry(fakePool, ENTRY_ID, USER_ID, { ...same });
    expect(correctionInserts()).toHaveLength(0);
  });

  it('attaches model_id from the most recent extraction prompt_invocations row', async () => {
    setupSelectAndUpdate({ title: 'A' });
    await updateCareerEntry(fakePool, ENTRY_ID, USER_ID, { title: 'B' });
    const inserts = correctionInserts();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[7]).toBe('eu.anthropic.claude-haiku-4-5-20251001-v1:0');
  });

  it('logs added field with extracted_value = null', async () => {
    setupSelectAndUpdate({ title: 'A' });
    await updateCareerEntry(fakePool, ENTRY_ID, USER_ID, { title: 'A', company: 'NewCo' });
    const inserts = correctionInserts();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[4]).toBe('company');
    expect(inserts[0]?.[5]).toBeNull();                  // extracted_value
    expect(inserts[0]?.[6]).toBe(JSON.stringify('NewCo'));
  });
});

describe('confirmImportForEnrichment', () => {
  it('transitions ready_for_review → confirmed and returns the record', async () => {
    const row = {
      id: IMPORT_ID, user_id: USER_ID, s3_key: 'k', original_filename: 'cv.pdf',
      content_type: 'application/pdf', file_size_bytes: 1, status: 'confirmed',
      status_message: null, current_step: null, total_steps: null,
      career_entries_created: [], embeddings_created_count: 0,
      error_code: null, error_details: null, retry_count: 0,
      created_at: new Date(), started_at: null, completed_at: null,
    };
    const query = jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [row] });
    const pool = { query } as unknown as import('pg').Pool;

    const result = await confirmImportForEnrichment(pool, IMPORT_ID, USER_ID);

    expect(result?.status).toBe('confirmed');
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/UPDATE resume_imports/i);
    expect(sql).toMatch(/status = 'confirmed'/i);
    // Status guard makes a double-confirm safe — only ready_for_review flips.
    expect(sql).toMatch(/status = 'ready_for_review'/i);
    expect(params).toEqual([IMPORT_ID, USER_ID]);
  });

  it('returns null when the import is not in ready_for_review', async () => {
    const query = jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as import('pg').Pool;

    const result = await confirmImportForEnrichment(pool, IMPORT_ID, USER_ID);
    expect(result).toBeNull();
  });
});

describe('getImportProgress', () => {
  function poolReturning(row: Record<string, unknown> | undefined) {
    const query = jest.fn<() => Promise<{ rows: unknown[] }>>()
      .mockResolvedValue({ rows: row ? [row] : [] });
    return { query } as unknown as import('pg').Pool;
  }

  it('returns null when the import is absent', async () => {
    const p = await getImportProgress(poolReturning(undefined), IMPORT_ID, USER_ID);
    expect(p).toBeNull();
  });

  it('maps extracting_career → phase extracting, non-terminal, 1500ms cadence', async () => {
    const p = await getImportProgress(
      poolReturning({ status: 'extracting_career', error_code: null, error_details: null, gap_report_generated_at: null }),
      IMPORT_ID, USER_ID,
    );
    expect(p?.phase).toBe('extracting');
    expect(p?.terminal).toBe(false);
    expect(p?.retryAfterMs).toBe(1500);
    expect(p?.gapReportReady).toBe(false);
    expect(p?.error).toBeNull();
  });

  it('ready_for_review is terminal with retryAfterMs 0', async () => {
    const p = await getImportProgress(
      poolReturning({ status: 'ready_for_review', error_code: null, error_details: null, gap_report_generated_at: new Date() }),
      IMPORT_ID, USER_ID,
    );
    expect(p?.terminal).toBe(true);
    expect(p?.retryAfterMs).toBe(0);
    expect(p?.gapReportReady).toBe(true);
  });

  it('failed surfaces error code + message from error_details', async () => {
    const p = await getImportProgress(
      poolReturning({ status: 'failed', error_code: 'PIPELINE_ERROR', error_details: { message: 'boom' }, gap_report_generated_at: null }),
      IMPORT_ID, USER_ID,
    );
    expect(p?.phase).toBe('error');
    expect(p?.terminal).toBe(true);
    expect(p?.error).toEqual({ code: 'PIPELINE_ERROR', message: 'boom' });
  });
});

describe('getGapReport', () => {
  function poolReturning(rows: unknown[]) {
    const query = jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows });
    return { query } as unknown as import('pg').Pool;
  }

  it('undefined when import not found', async () => {
    expect(await getGapReport(poolReturning([]), IMPORT_ID, USER_ID)).toBeUndefined();
  });

  it('null when import exists but report is absent', async () => {
    expect(await getGapReport(poolReturning([{ gap_report: null }]), IMPORT_ID, USER_ID)).toBeNull();
  });

  it('returns the report object when present', async () => {
    const report = { overallScore: 80, perRole: [] };
    expect(await getGapReport(poolReturning([{ gap_report: report }]), IMPORT_ID, USER_ID)).toEqual(report);
  });
});
