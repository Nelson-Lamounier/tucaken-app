/**
 * @format
 * Unit tests for isCaseStudyStale — the "repository changed, regenerate"
 * signal. A case study is stale only when a member repo synced strictly after
 * it was generated.
 */
import { describe, it, expect } from '@jest/globals';
import { isCaseStudyStale } from '../../../src/lib/repositories/projects.js';

describe('isCaseStudyStale', () => {
    it('is stale when a repo synced after the case study was generated', () => {
        expect(isCaseStudyStale('2026-06-18T12:00:00Z', '2026-06-18T10:00:00Z')).toBe(true);
    });

    it('is not stale when the case study is newer than the latest sync', () => {
        expect(isCaseStudyStale('2026-06-18T10:00:00Z', '2026-06-18T12:00:00Z')).toBe(false);
    });

    it('is not stale at the exact same instant (no strict change)', () => {
        const t = '2026-06-18T10:00:00Z';
        expect(isCaseStudyStale(t, t)).toBe(false);
    });

    it('is not stale when the case study was never generated', () => {
        expect(isCaseStudyStale('2026-06-18T12:00:00Z', null)).toBe(false);
    });

    it('is not stale when no member repo has ever synced', () => {
        expect(isCaseStudyStale(null, '2026-06-18T10:00:00Z')).toBe(false);
    });
});
