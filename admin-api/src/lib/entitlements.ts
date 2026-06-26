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
import { nullToInfinity, type TierConfig, type PlanId } from './tier-config-shape.js';

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

/** The JD-analysis pipeline tier (strategist MODE env) a plan unlocks. */
export type AnalysisMode = 'free' | 'standard';

/**
 * Which JD-analysis pipeline a user's plan unlocks. The full 'standard'
 * research pipeline (fit rating, verified matches, gaps, ATS, cover letter) is
 * the PREMIUM differentiator — only premium (and full-access admins) get it.
 * Free, pro, and any legacy trial get the lighter 'free' pipeline. This is the
 * single source of truth for the dispatch fork; do not key the MODE off an A/B
 * allowlist or the request body.
 */
export function analysisModeFor(plan: EffectivePlan, role?: string | null): AnalysisMode {
    if (isFullAccess(role)) return 'standard';
    return plan === 'premium' ? 'standard' : 'free';
}

const STORED_IDS = new Set<string>(['free', 'pro', 'premium']);

function pickStoredId(plan: EffectivePlan): PlanId {
    if (STORED_IDS.has(plan)) return plan as PlanId;
    return 'premium'; // trial has no stored row → unlimited, matches static map
}

/**
 * Entitlements derived from the live tier config. `trial` has no stored row,
 * so it keeps the static UNLIMITED treatment via `pickStoredId` → 'premium'.
 * Admin role still overrides to the premium row regardless of plan.
 * `null` entitlement values in config map to `Infinity`.
 */
export function entitlementsFromConfig(
    config: TierConfig,
    plan: EffectivePlan,
    role?: string | null,
): Entitlements {
    const targetId: PlanId = isFullAccess(role) ? 'premium' : pickStoredId(plan);
    const entry = config.tiers.find((t) => t.id === targetId);
    if (!entry) return ENTITLEMENTS[plan];
    const e = entry.entitlements;
    return {
        repos: nullToInfinity(e.repos),
        projects: nullToInfinity(e.projects),
        resumesPerMonth: nullToInfinity(e.resumesPerMonth),
        ingestionJobsPerMonth: nullToInfinity(e.ingestionJobsPerMonth),
        enrichment: e.enrichment,
    };
}

/** Worker env vars for an enrichment mode (consumed by the ingestion Job). */
export function enrichmentEnv(mode: EnrichmentMode): Record<string, string> {
    return mode === 'full'
        ? { ENRICH_TIER1: '1' }
        : { ENRICHMENT_DISABLED: '1', ENRICH_TIER1: '1' };
}
