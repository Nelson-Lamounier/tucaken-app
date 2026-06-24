/**
 * @format
 * Central tier-entitlements map -- the single source of truth for per-plan
 * limits and enrichment mode. Every enforcement point (repo/project/resume/
 * ingestion quotas) and the ingestion dispatch read from here so the tier
 * definition lives in exactly one place.
 *
 * Keyed on EFFECTIVE plan (trial/active resolution), not the raw column.
 * `trial` mirrors `pro` -- a trial is a paid-tier taste.
 *
 * The full-access override (`isFullAccess`) reuses the existing email
 * allowlists (AB_FREE_TIER_EMAILS / ENRICHMENT_TOGGLE_EMAILS) so the test
 * user keeps unlimited access without a hardcoded address.
 */
import { isFreeTierAllowed } from './ab-free-tier.js';
import { isEnrichmentToggleAllowed } from './enrichment-toggle.js';
import type { EffectivePlan } from './repositories/users.js';

export type { EffectivePlan };
export type EnrichmentMode = 'tier1' | 'full';

export interface Entitlements {
    /** Max connected repositories. Infinity = unlimited. */
    repos: number;
    /** Max projects. Infinity = unlimited. */
    projects: number;
    /** Max JD resume generations per calendar month. Infinity = unlimited. */
    resumesPerMonth: number;
    /** Max ingestion (sync/build) jobs per calendar month. Infinity = unlimited. */
    ingestionJobsPerMonth: number;
    /** Chunk-enrichment depth during sync/build. */
    enrichment: EnrichmentMode;
}

const UNLIMITED: Entitlements = {
    repos: Infinity,
    projects: Infinity,
    resumesPerMonth: Infinity,
    ingestionJobsPerMonth: Infinity,
    enrichment: 'tier1',
};

export const ENTITLEMENTS: Record<EffectivePlan, Entitlements> = {
    free:    { repos: 1, projects: 1, resumesPerMonth: 1, ingestionJobsPerMonth: 3, enrichment: 'tier1' },
    trial:   { ...UNLIMITED },
    pro:     { ...UNLIMITED },
    premium: { ...UNLIMITED, enrichment: 'full' },
};

/**
 * Full-access override for the test/owner account. Driven by the existing
 * allowlists so it is env-configurable and not hardcoded.
 */
export function isFullAccess(email: string | null | undefined): boolean {
    return isFreeTierAllowed(email) || isEnrichmentToggleAllowed(email ?? undefined);
}

/** Effective entitlements: full-access override first, else the plan map. */
export function entitlementsFor(plan: EffectivePlan, email?: string | null): Entitlements {
    if (isFullAccess(email)) return ENTITLEMENTS.premium;
    return ENTITLEMENTS[plan];
}

/** Worker env vars for an enrichment mode (consumed by the ingestion Job). */
export function enrichmentEnv(mode: EnrichmentMode): Record<string, string> {
    return mode === 'full'
        ? { ENRICH_TIER1: '1' }
        : { ENRICHMENT_DISABLED: '1', ENRICH_TIER1: '1' };
}
