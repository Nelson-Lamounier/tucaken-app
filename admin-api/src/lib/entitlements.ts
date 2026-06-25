/**
 * @format
 * Central tier-entitlements map - the single source of truth for per-plan
 * limits and enrichment mode. Every enforcement point and the ingestion
 * dispatch read from here so the tier definition lives in one place.
 *
 * Keyed on EFFECTIVE plan (trial/active resolution), not the raw column.
 * `trial` mirrors `pro` - a trial is a paid-tier taste.
 *
 * The full-access override (`isFullAccess`) is driven by the user's persisted
 * `role === 'admin'` (returned by getUserPlanStatus), so the grant is tied to
 * an authenticated, auditable privilege rather than an env-var allowlist.
 */
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
 * Full-access override for the test/owner (and any other) account: ONLY a
 * persisted admin (users.role = 'admin') bypasses tier limits. Decoupled from
 * the A/B email allowlists; fail-closed (a non-admin or missing role gets the
 * normal plan map).
 */
export function isFullAccess(role: string | null | undefined): boolean {
    return role === 'admin';
}

/** Effective entitlements: admin override first, else the plan map. */
export function entitlementsFor(plan: EffectivePlan, role?: string | null): Entitlements {
    if (isFullAccess(role)) return ENTITLEMENTS.premium;
    return ENTITLEMENTS[plan];
}

/** Worker env vars for an enrichment mode (consumed by the ingestion Job). */
export function enrichmentEnv(mode: EnrichmentMode): Record<string, string> {
    return mode === 'full'
        ? { ENRICH_TIER1: '1' }
        : { ENRICHMENT_DISABLED: '1', ENRICH_TIER1: '1' };
}
