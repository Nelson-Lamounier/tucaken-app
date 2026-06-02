/** @format */
import { jest, describe, it, expect } from '@jest/globals';
import { INTERVIEW_PREP_STAGES, isPrepStage, coachInFlightOrFresh, resolveStrategistRunId } from './coach-dispatch.js';

function pool(rows: unknown[]) {
  const query = jest.fn(async () => ({ rows }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { query } as any;
}

describe('isPrepStage', () => {
  it('accepts interview-prep stages, rejects applied/offer', () => {
    expect(isPrepStage('phone-screen')).toBe(true);
    expect(isPrepStage('final')).toBe(true);
    expect(isPrepStage('applied')).toBe(false);
    expect(isPrepStage('offer')).toBe(false);
  });
  it('INTERVIEW_PREP_STAGES excludes applied', () => {
    expect(INTERVIEW_PREP_STAGES).not.toContain('applied');
  });
});

describe('resolveStrategistRunId', () => {
  it('returns the latest complete strategist run id', async () => {
    expect(await resolveStrategistRunId(pool([{ id: 'strat-1' }]), 'app-uuid')).toBe('strat-1');
  });
  it('returns null when none', async () => {
    expect(await resolveStrategistRunId(pool([]), 'app-uuid')).toBeNull();
  });
});

describe('coachInFlightOrFresh', () => {
  it('true when a queued/coaching/complete coach run exists for the stage', async () => {
    expect(await coachInFlightOrFresh(pool([{ status: 'coaching' }]), 'app-uuid', 'phone-screen')).toBe(true);
  });
  it('false when none', async () => {
    expect(await coachInFlightOrFresh(pool([]), 'app-uuid', 'phone-screen')).toBe(false);
  });
});
