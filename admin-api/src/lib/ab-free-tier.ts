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

/**
 * Resolve the mode to actually dispatch. Free is permitted ONLY for an
 * allowlisted email; any other free request is downgraded to standard
 * (fail-safe — never reject). Standard always passes through.
 */
export function resolveDispatchMode(
    requestedMode: string,
    email: string | null | undefined,
): { mode: 'free' | 'standard'; downgraded: boolean } {
    if (requestedMode === 'free') {
        return isFreeTierAllowed(email)
            ? { mode: 'free', downgraded: false }
            : { mode: 'standard', downgraded: true };
    }
    return { mode: 'standard', downgraded: false };
}
