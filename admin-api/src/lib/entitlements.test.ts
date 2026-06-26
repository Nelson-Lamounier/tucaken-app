/** @format */
import { ENTITLEMENTS, isFullAccess, entitlementsFor, enrichmentEnv, analysisModeFor } from './entitlements.js';

describe('analysisModeFor', () => {
    it('only premium gets the full standard analysis pipeline', () => {
        expect(analysisModeFor('premium')).toBe('standard');
    });
    it('free and pro both get the light free pipeline', () => {
        expect(analysisModeFor('free')).toBe('free');
        expect(analysisModeFor('pro')).toBe('free');
    });
    it('legacy trial falls to the light free pipeline (trials decommissioned)', () => {
        expect(analysisModeFor('trial')).toBe('free');
    });
    it('full-access admins get standard regardless of plan', () => {
        expect(analysisModeFor('free', 'admin')).toBe('standard');
        expect(analysisModeFor('pro', 'admin')).toBe('standard');
    });
    it('a non-admin role does not unlock standard', () => {
        expect(analysisModeFor('free', 'user')).toBe('free');
    });
});

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

    it('reads ingestionJobsPerMonth from the config (finite value beats static map)', () => {
        // Construct a config where the pro tier has a finite ingestion cap (e.g. 10)
        // rather than the static-map Infinity. Verifies that getPlanLimit-equivalent
        // logic reads the live config value, not the static ENTITLEMENTS table.
        const configWithCap: typeof DEFAULT_TIER_CONFIG = {
            tiers: DEFAULT_TIER_CONFIG.tiers.map((t) =>
                t.id === 'pro'
                    ? { ...t, entitlements: { ...t.entitlements, ingestionJobsPerMonth: 10 } }
                    : t,
            ),
        };
        const e = entitlementsFromConfig(configWithCap, 'pro');
        expect(e.ingestionJobsPerMonth).toBe(10);
    });

    it('null ingestionJobsPerMonth in config maps to Infinity (unlimited)', () => {
        const e = entitlementsFromConfig(DEFAULT_TIER_CONFIG, 'pro');
        expect(e.ingestionJobsPerMonth).toBe(Number.POSITIVE_INFINITY);
    });
});
