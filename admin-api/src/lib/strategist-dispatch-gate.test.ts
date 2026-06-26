/** @format */
import { claimStrategistDispatch } from './strategist-dispatch-gate.js';

/** Fake tx client: advisory lock is a no-op; the SELECT returns `latest`. */
function fakeDb(latest: { status: string; age_sec: number } | null) {
    return {
        query: async (sql: string) => {
            if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
            return { rows: latest ? [latest] : [] };
        },
    } as never;
}

const MIN = 15;

describe('claimStrategistDispatch', () => {
    it('allows the first run (no prior strategist run)', async () => {
        expect(await claimStrategistDispatch(fakeDb(null), 'u1', MIN)).toBe('ok');
    });

    it('blocks while a recent run is still in-flight (non-terminal)', async () => {
        expect(await claimStrategistDispatch(fakeDb({ status: 'queued', age_sec: 5 }), 'u1', MIN)).toBe('in_flight');
        expect(await claimStrategistDispatch(fakeDb({ status: 'analysing', age_sec: 120 }), 'u1', MIN)).toBe('in_flight');
    });

    it('throttles a brand-new run right after one just completed', async () => {
        expect(await claimStrategistDispatch(fakeDb({ status: 'complete', age_sec: 5 }), 'u1', MIN)).toBe('throttled');
        expect(await claimStrategistDispatch(fakeDb({ status: 'failed', age_sec: 3 }), 'u1', MIN)).toBe('throttled');
    });

    it('allows a new run once the throttle window has passed', async () => {
        expect(await claimStrategistDispatch(fakeDb({ status: 'complete', age_sec: 50 }), 'u1', MIN)).toBe('ok');
        expect(await claimStrategistDispatch(fakeDb({ status: 'failed', age_sec: 999 }), 'u1', MIN)).toBe('ok');
    });

    it('treats a hung non-terminal run older than the stale window as free (escape hatch)', async () => {
        // age beyond activeDeadlineSeconds → the Job is dead; do not lock the user out.
        expect(await claimStrategistDispatch(fakeDb({ status: 'analysing', age_sec: 2000 }), 'u1', MIN)).toBe('ok');
    });
});
