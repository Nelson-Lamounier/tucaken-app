/**
 * @format
 * A/B free-tier allowlist. The list of emails permitted to dispatch the
 * MODE='free' resume pipeline lives in the AB_FREE_TIER_EMAILS env var
 * (comma-separated). Pure + env-driven so the gate has a single definition
 * shared by the `me` endpoint (UI visibility) and the dispatch route
 * (authoritative enforcement).
 */
function allowlist(): Set<string> {
    return new Set(
        (process.env.AB_FREE_TIER_EMAILS ?? '')
            .split(',')
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e.length > 0),
    );
}

export function isFreeTierAllowed(email: string | null | undefined): boolean {
    if (!email) return false;
    return allowlist().has(email.trim().toLowerCase());
}

// NOTE: the JD-analysis dispatch MODE is no longer resolved from this allowlist.
// It is derived authoritatively from the user's effective plan — see
// `analysisModeFor` in entitlements.ts (free/pro → 'free', premium → 'standard').
// `isFreeTierAllowed` is retained only for the `/me` `abFreeTier` UI flag.
