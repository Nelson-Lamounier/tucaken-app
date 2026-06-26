import { jest } from '@jest/globals';
import { buildDailySeries, getDailyActivity, getUserRepositories, getUserDiagnostic, summariseKbHealth } from './user-rag.js';

function repos(rows: Array<Record<string, unknown>>) {
  const mapped = rows.map((r) => ({
    repoFullName: 'a/b', classification: 'project', extractionStatus: 'complete', syncStatus: 'complete',
    kbQualityScore: null, kbQualityBreakdown: null, retrievalScore: null, retrievalBreakdown: null,
    chunkCount: null, fileCount: null, embeddedCount: null, lastSyncedAt: null, ...r,
  }));
  return mapped as unknown as Parameters<typeof summariseKbHealth>[0];
}

function poolReturning(...results: Array<{ rows: unknown[] }>) {
  const query = jest.fn<() => Promise<{ rows: unknown[] }>>();
  for (const r of results) query.mockResolvedValueOnce(r);
  return { query } as unknown as Pick<import('pg').Pool, 'query'>;
}

describe('buildDailySeries', () => {
  it('zero-fills a dense window ending on todayUtc, oldest first', () => {
    const s = buildDailySeries([{ day: '2026-06-25', n: 2 }], [{ day: '2026-06-24', n: 1 }], 3, '2026-06-25');
    expect(s.days.map((d) => d.date)).toEqual(['2026-06-23', '2026-06-24', '2026-06-25']);
    expect(s.days).toEqual([
      { date: '2026-06-23', applications: 0, resumes: 0 },
      { date: '2026-06-24', applications: 0, resumes: 1 },
      { date: '2026-06-25', applications: 2, resumes: 0 },
    ]);
  });

  it('totals sum across the window', () => {
    const s = buildDailySeries(
      [{ day: '2026-06-25', n: 2 }, { day: '2026-06-24', n: 3 }],
      [{ day: '2026-06-25', n: 1 }],
      7,
      '2026-06-25',
    );
    expect(s.totals).toEqual({ applications: 5, resumes: 1 });
    expect(s.days).toHaveLength(7);
  });

  it('ignores counts outside the window (does not leak into totals)', () => {
    const s = buildDailySeries([{ day: '2026-01-01', n: 9 }], [], 3, '2026-06-25');
    expect(s.totals).toEqual({ applications: 0, resumes: 0 });
  });
});

describe('getDailyActivity', () => {
  it('runs both grouped reads and merges them', async () => {
    const pool = poolReturning(
      { rows: [{ day: '2026-06-25', n: 2 }] }, // applications
      { rows: [{ day: '2026-06-25', n: 1 }] }, // resumes
    );
    const s = await getDailyActivity(pool, 'u1', 30, '2026-06-25');
    expect(s.days).toHaveLength(30);
    expect(s.days.at(-1)).toEqual({ date: '2026-06-25', applications: 2, resumes: 1 });
    expect(s.totals).toEqual({ applications: 2, resumes: 1 });
  });
});

describe('getUserRepositories', () => {
  it('maps RAG columns and coerces numerics', async () => {
    const pool = poolReturning({
      rows: [{
        repo_full_name: 'a/b', classification: 'project', extraction_status: 'complete',
        sync_status: 'complete', kb_quality_score: '0.80', kb_quality_breakdown: { has_readme: 0.25 },
        retrieval_score: '0.71', retrieval_breakdown: null, chunk_count: 120, file_count: 40,
        embedded_count: 120, last_synced_at: new Date('2026-06-24T05:42:58Z'),
      }],
    });
    const [r] = await getUserRepositories(pool, 'u1');
    expect(r).toMatchObject({
      repoFullName: 'a/b', classification: 'project', kbQualityScore: 0.8,
      retrievalScore: 0.71, lastSyncedAt: '2026-06-24T05:42:58.000Z',
    });
  });
});

describe('summariseKbHealth', () => {
  it('sums files/chunks/embedded and averages only repos with a quality score', () => {
    const h = summariseKbHealth(repos([
      { fileCount: 40, chunkCount: 120, embeddedCount: 120, kbQualityScore: 0.8 },
      { fileCount: 10, chunkCount: 30, embeddedCount: 25, kbQualityScore: 0.4 },
      { fileCount: 5, chunkCount: 12, embeddedCount: 0, kbQualityScore: null },
    ]));
    expect(h.totals).toMatchObject({ repoCount: 3, files: 55, chunks: 162, embedded: 145 });
    expect(h.totals.avgKbQuality).toBeCloseTo(0.6);
  });

  it('is empty-safe (no repos → zeros, null avg)', () => {
    expect(summariseKbHealth([]).totals).toEqual({ repoCount: 0, files: 0, chunks: 0, embedded: 0, avgKbQuality: null });
  });
});

describe('getUserDiagnostic', () => {
  it('returns the diagnostic blob + refreshedAt, or null when no row', async () => {
    const withRow = poolReturning({ rows: [{ diagnostic: { overall: 62 }, refreshed_at: new Date('2026-06-24T05:42:58Z') }] });
    await expect(getUserDiagnostic(withRow, 'u1')).resolves.toEqual({
      diagnostic: { overall: 62 }, refreshedAt: '2026-06-24T05:42:58.000Z',
    });
    const noRow = poolReturning({ rows: [] });
    await expect(getUserDiagnostic(noRow, 'u1')).resolves.toBeNull();
  });
});
