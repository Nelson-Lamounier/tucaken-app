/**
 * @format
 * Tests for admin-api RLS helper safety.
 */

import { describe, expect, it, jest } from '@jest/globals';

const { withUser } = await import('../../src/lib/pg.js');

describe('withUser', () => {
  it('rejects non-UUID user ids before acquiring a database client', async () => {
    const connectMock = jest.fn();
    const pool = { connect: connectMock };

    await expect(
      withUser(pool as never, "00000000-0000-0000-0000-000000000001'; RESET ROLE; --", async () => 'never'),
    ).rejects.toThrow(/Invalid user id/i);

    expect(connectMock).not.toHaveBeenCalled();
  });
});
