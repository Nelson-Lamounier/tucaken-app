/** @format */
import { ENTITLEMENTS, isFullAccess, entitlementsFor, enrichmentEnv } from './entitlements.js';

describe('ENTITLEMENTS', () => {
    it('free is the only metered tier; pro/premium are unlimited', () => {
        expect(ENTITLEMENTS.free).toEqual({
            repos: 1, projects: 1, resumesPerMonth: 1, ingestionJobsPerMonth: 3, enrichment: 'tier1',
        });
        expect(ENTITLEMENTS.pro.repos).toBe(Infinity);
        expect(ENTITLEMENTS.premium.repos).toBe(Infinity);
    });
    it('only premium gets full chunk enrichment; trial mirrors pro', () => {
        expect(ENTITLEMENTS.free.enrichment).toBe('tier1');
        expect(ENTITLEMENTS.pro.enrichment).toBe('tier1');
        expect(ENTITLEMENTS.premium.enrichment).toBe('full');
        expect(ENTITLEMENTS.trial).toEqual(ENTITLEMENTS.pro);
    });
});

describe('isFullAccess', () => {
    const A = process.env.AB_FREE_TIER_EMAILS, E = process.env.ENRICHMENT_TOGGLE_EMAILS;
    afterEach(() => { process.env.AB_FREE_TIER_EMAILS = A; process.env.ENRICHMENT_TOGGLE_EMAILS = E; });

    it('is true when the email is on either existing allowlist (case-insensitive)', () => {
        process.env.AB_FREE_TIER_EMAILS = 'lamounier_88@hotmail.com';
        process.env.ENRICHMENT_TOGGLE_EMAILS = '';
        expect(isFullAccess('LAMOUNIER_88@hotmail.com')).toBe(true);
    });
    it('is false for a normal user and for null', () => {
        process.env.AB_FREE_TIER_EMAILS = 'lamounier_88@hotmail.com';
        process.env.ENRICHMENT_TOGGLE_EMAILS = 'lamounier_88@hotmail.com';
        expect(isFullAccess('someone@else.com')).toBe(false);
        expect(isFullAccess(null)).toBe(false);
    });
});

describe('entitlementsFor', () => {
    const A = process.env.AB_FREE_TIER_EMAILS, E = process.env.ENRICHMENT_TOGGLE_EMAILS;
    beforeEach(() => { process.env.AB_FREE_TIER_EMAILS = 'lamounier_88@hotmail.com'; process.env.ENRICHMENT_TOGGLE_EMAILS = ''; });
    afterEach(() => { process.env.AB_FREE_TIER_EMAILS = A; process.env.ENRICHMENT_TOGGLE_EMAILS = E; });

    it('returns the plan map for a normal user', () => {
        expect(entitlementsFor('free', 'someone@else.com')).toEqual(ENTITLEMENTS.free);
    });
    it('grants premium-equivalent + full enrichment to a full-access email regardless of plan', () => {
        expect(entitlementsFor('free', 'lamounier_88@hotmail.com')).toEqual(ENTITLEMENTS.premium);
    });
});

describe('enrichmentEnv', () => {
    it('tier1 disables the enricher but keeps deterministic Tier 1', () => {
        expect(enrichmentEnv('tier1')).toEqual({ ENRICHMENT_DISABLED: '1', ENRICH_TIER1: '1' });
    });
    it('full lets the enricher run (Tier 1 still flagged)', () => {
        expect(enrichmentEnv('full')).toEqual({ ENRICH_TIER1: '1' });
    });
});
