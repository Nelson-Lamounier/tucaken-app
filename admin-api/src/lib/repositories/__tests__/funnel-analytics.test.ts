/** @format */
import { jest, describe, it, expect } from '@jest/globals';
import { computeFunnel } from '../funnel-analytics.js';

/**
 * Build a fake Queryable that returns `appRows` for the job_applications SELECT
 * and `stageRows` for the interview_stages SELECT. The funnel repo issues the
 * applications query first, then the stages query — we discriminate on the SQL.
 */
function fakeDb(appRows: unknown[], stageRows: unknown[]) {
  const query = jest.fn(async (sql: string) => {
    if (/FROM\s+interview_stages/i.test(sql)) return { rows: stageRows };
    return { rows: appRows };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { query } as any, query };
}

const DAY = 86_400_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

describe('computeFunnel', () => {
  it('computes furthest-stage counts, transition rates, and excludes a ghosted app from active', async () => {
    // App A: reached technical, currently active (recent activity, no outcome on current).
    // App B: reached final, accepted (offer) — terminal.
    // App C: phone-screen, stale (>21d) with null outcome → derived ghosted (NOT active).
    const appRows = [
      { id: 'A', kanban_status: 'interviewing', applied_at: iso(now - 60 * DAY) },
      { id: 'B', kanban_status: 'accepted',     applied_at: iso(now - 90 * DAY) },
      { id: 'C', kanban_status: 'interviewing', applied_at: iso(now - 40 * DAY) },
    ];
    const stageRows = [
      // App A — advanced through phone-screen, currently on technical (active).
      { job_application_id: 'A', stage_type: 'phone-screen', stage_status: 'completed', outcome: 'advanced', last_activity_at: iso(now - 30 * DAY) },
      { job_application_id: 'A', stage_type: 'technical',    stage_status: 'current',   outcome: null,        last_activity_at: iso(now - 2 * DAY) },
      // App B — advanced all the way to final, accepted.
      { job_application_id: 'B', stage_type: 'phone-screen',  stage_status: 'completed', outcome: 'advanced', last_activity_at: iso(now - 80 * DAY) },
      { job_application_id: 'B', stage_type: 'technical',     stage_status: 'completed', outcome: 'advanced', last_activity_at: iso(now - 70 * DAY) },
      { job_application_id: 'B', stage_type: 'final',         stage_status: 'completed', outcome: 'advanced', last_activity_at: iso(now - 60 * DAY) },
      // App C — current phone-screen, stale, null outcome → ghosted.
      { job_application_id: 'C', stage_type: 'phone-screen',  stage_status: 'current',   outcome: null,       last_activity_at: iso(now - 30 * DAY) },
    ];

    const { db } = fakeDb(appRows, stageRows);
    const result = await computeFunnel(db, 21);

    // Summary counts.
    expect(result.summary.totalApplied).toBe(3);
    expect(result.summary.daysSinceFirstApplied).toBe(90);
    // Active: only A. B is accepted (terminal); C is ghosted (terminal).
    expect(result.summary.active).toBe(1);
    // advancedPastScreen = reached >= technical: A and B.
    expect(result.summary.advancedPastScreen).toBe(2);
    expect(result.summary.reachedFinal).toBe(1); // B only.
    expect(result.summary.offers).toBe(1);       // B accepted.

    // applied -> phone-screen: all 3 reached phone-screen (>= phone-screen). from=3, to=3.
    const appliedToPhone = result.transitions.find(t => t.key === 'applied_to_phone_screen');
    expect(appliedToPhone).toBeDefined();
    expect(appliedToPhone!.fromCount).toBe(3);
    expect(appliedToPhone!.toCount).toBe(3);
    expect(appliedToPhone!.rate).toBe(1);

    // phone-screen -> technical: A and B reached technical. from=3, to=2.
    const phoneToTech = result.transitions.find(t => t.key === 'phone_screen_to_technical');
    expect(phoneToTech!.fromCount).toBe(3);
    expect(phoneToTech!.toCount).toBe(2);
    expect(phoneToTech!.rate).toBeCloseTo(2 / 3, 5);
  });

  it('does not ghost a recently-active app and yields rate 0 when fromCount is 0', async () => {
    const appRows = [
      { id: 'A', kanban_status: 'interviewing', applied_at: iso(now - 5 * DAY) },
    ];
    const stageRows = [
      // Only reached phone-screen; recent activity, null outcome → still active (not ghosted).
      { job_application_id: 'A', stage_type: 'phone-screen', stage_status: 'current', outcome: null, last_activity_at: iso(now - 1 * DAY) },
    ];

    const { db } = fakeDb(appRows, stageRows);
    const result = await computeFunnel(db, 21);

    expect(result.summary.active).toBe(1);
    expect(result.summary.advancedPastScreen).toBe(0);

    // technical -> system-design: nobody reached technical → fromCount 0, rate 0 (no divide-by-zero).
    const techToSd = result.transitions.find(t => t.key === 'technical_to_system_design');
    expect(techToSd!.fromCount).toBe(0);
    expect(techToSd!.rate).toBe(0);
  });
});
