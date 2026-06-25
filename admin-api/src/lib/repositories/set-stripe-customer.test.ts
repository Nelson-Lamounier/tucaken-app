/** @format */
/**
 * Unit tests for setStripeCustomerId's typed-error contract. The Stripe webhook
 * relies on the distinction: UserNotFoundError is retryable (provisioning may
 * lag), StripeCustomerConflictError is a skip-and-reconcile anomaly. Conflating
 * them would let a webhook drop a legitimate sync for a not-yet-provisioned user.
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  setStripeCustomerId,
  UserNotFoundError,
  StripeCustomerConflictError,
} from './users.js';

interface QueryResult {
  rowCount: number;
  rows: Array<{ stripe_customer_id: string | null }>;
}

function poolReturning(...results: QueryResult[]): Pick<import('pg').Pool, 'query'> {
  const query = jest.fn<() => Promise<QueryResult>>();
  for (const r of results) query.mockResolvedValueOnce(r);
  return { query } as unknown as Pick<import('pg').Pool, 'query'>;
}

describe('setStripeCustomerId', () => {
  it('resolves when the UPDATE links the row', async () => {
    const pool = poolReturning({ rowCount: 1, rows: [{ stripe_customer_id: 'cus_1' }] });
    await expect(setStripeCustomerId(pool, 'u1', 'cus_1')).resolves.toBeUndefined();
  });

  it('throws UserNotFoundError when the user row does not exist (retryable)', async () => {
    const pool = poolReturning(
      { rowCount: 0, rows: [] }, // UPDATE matched nothing
      { rowCount: 0, rows: [] }, // SELECT finds no user
    );
    await expect(setStripeCustomerId(pool, 'u1', 'cus_1')).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('throws StripeCustomerConflictError when a different customer is already linked', async () => {
    const pool = poolReturning(
      { rowCount: 0, rows: [] }, // UPDATE matched nothing
      { rowCount: 1, rows: [{ stripe_customer_id: 'cus_other' }] }, // SELECT finds a different id
    );
    await expect(
      setStripeCustomerId(pool, 'u1', 'cus_new'),
    ).rejects.toBeInstanceOf(StripeCustomerConflictError);
  });
});
