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
    it('is true only for a persisted admin role', () => {
        expect(isFullAccess('admin')).toBe(true);
    });
    it('is false for a normal user, an unknown role, and null/undefined', () => {
        expect(isFullAccess('user')).toBe(false);
        expect(isFullAccess('owner')).toBe(false);
        expect(isFullAccess(null)).toBe(false);
        expect(isFullAccess(undefined)).toBe(false);
    });
});

describe('entitlementsFor', () => {
    it('returns the plan map for a normal (non-admin) user', () => {
        expect(entitlementsFor('free', 'user')).toEqual(ENTITLEMENTS.free);
        expect(entitlementsFor('premium', 'user')).toEqual(ENTITLEMENTS.premium);
    });
    it('grants premium-equivalent + full enrichment to an admin regardless of plan', () => {
        expect(entitlementsFor('free', 'admin')).toEqual(ENTITLEMENTS.premium);
    });
    it('treats a missing role as non-admin (fail-closed)', () => {
        expect(entitlementsFor('free')).toEqual(ENTITLEMENTS.free);
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

import { entitlementsFromConfig } from './entitlements.js';
import { DEFAULT_TIER_CONFIG } from './tier-config-shape.js';

describe('entitlementsFromConfig', () => {
    it('maps free tier limits from config', () => {
        const e = entitlementsFromConfig(DEFAULT_TIER_CONFIG, 'free');
        expect(e.repos).toBe(1);
        expect(e.resumesPerMonth).toBe(1);
        expect(e.enrichment).toBe('tier1');
    });

    it('maps null entitlements to Infinity', () => {
        const e = entitlementsFromConfig(DEFAULT_TIER_CONFIG, 'pro');
        expect(e.repos).toBe(Number.POSITIVE_INFINITY);
    });

    it('admin role gets premium entitlements regardless of plan', () => {
        const e = entitlementsFromConfig(DEFAULT_TIER_CONFIG, 'free', 'admin');
        expect(e.repos).toBe(Number.POSITIVE_INFINITY);
        expect(e.enrichment).toBe('full');
    });

    it('trial plan falls back to unlimited (trial is not a stored tier id)', () => {
        const e = entitlementsFromConfig(DEFAULT_TIER_CONFIG, 'trial');
        expect(e.repos).toBe(Number.POSITIVE_INFINITY);
    });
});
