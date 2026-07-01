import { describe, it, expect, jest } from '@jest/globals';
import type { PoolClient } from 'pg';
import { getChatbotEnabled, setChatbotEnabled } from './users.js';

function clientWith(query: jest.Mock): PoolClient {
  return { query } as unknown as PoolClient;
}

describe('chatbot_enabled repo helpers', () => {
  it('getChatbotEnabled returns true when the row is true', async () => {
    const q = jest.fn(async () => ({ rows: [{ chatbot_enabled: true }] })) as unknown as jest.Mock;
    const r = await getChatbotEnabled(clientWith(q), 'u1');
    expect(r).toBe(true);
    const [sql, params] = q.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/SELECT chatbot_enabled FROM users WHERE id = \$1/);
    expect(params).toEqual(['u1']);
  });

  it('getChatbotEnabled returns false when the row is absent', async () => {
    const q = jest.fn(async () => ({ rows: [] })) as unknown as jest.Mock;
    expect(await getChatbotEnabled(clientWith(q), 'u1')).toBe(false);
  });

  it('setChatbotEnabled issues the UPDATE and returns true when a row is updated', async () => {
    const q = jest.fn(async () => ({ rowCount: 1 })) as unknown as jest.Mock;
    const r = await setChatbotEnabled(clientWith(q), 'u1', true);
    expect(r).toBe(true);
    const [sql, params] = q.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/UPDATE users SET chatbot_enabled = \$2, updated_at = NOW\(\) WHERE id = \$1/);
    expect(params).toEqual(['u1', true]);
  });

  it('setChatbotEnabled returns false when no row was updated', async () => {
    const q = jest.fn(async () => ({ rowCount: 0 })) as unknown as jest.Mock;
    expect(await setChatbotEnabled(clientWith(q), 'u1', false)).toBe(false);
  });
});
