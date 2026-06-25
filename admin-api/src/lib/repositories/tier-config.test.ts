/** @format */
/**
 * Tests for the tier-config repository.
 *
 * Strategy: inject a fake Queryable (no DB, no jest.mock) so tests are
 * deterministic and free of infrastructure dependencies.
 */
import { jest, describe, it, expect } from '@jest/globals';
import { getTierConfigRow, upsertTierConfig } from './tier-config.js';
import { DEFAULT_TIER_CONFIG } from '../tier-config-shape.js';

function fakeDb(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = jest.fn(async () => ({ rows })) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { query } as any, query };
}

describe('tier-config repository', () => {
  it('returns null when no row exists', async () => {
    const { db } = fakeDb([]);
    expect(await getTierConfigRow(db)).toBeNull();
  });

  it('parses a stored config row', async () => {
    const { db } = fakeDb([{ config: DEFAULT_TIER_CONFIG }]);
    expect(await getTierConfigRow(db)).toEqual(DEFAULT_TIER_CONFIG);
  });

  it('upserts a single row with id=1 and userId', async () => {
    const { db, query } = fakeDb([]);
    await upsertTierConfig(db, DEFAULT_TIER_CONFIG, 'user-123');
    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).toContain('INSERT INTO tier_config');
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(params[0]).toBe(JSON.stringify(DEFAULT_TIER_CONFIG));
    expect(params[1]).toBe('user-123');
  });
});
