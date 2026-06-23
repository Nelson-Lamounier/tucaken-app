/**
 * @format
 * Enrichment-toggle entitlement allowlist. The list of emails permitted to
 * access the premium enrichment toggle lives in the ENRICHMENT_TOGGLE_EMAILS
 * env var (comma-separated). Defaults to `lamounier_88@hotmail.com` when the
 * env is unset or empty. Pure + env-driven so the gate has a single definition
 * shared by the `me` endpoint (UI visibility) and any future enforcement sites.
 */
function allowlist(): Set<string> {
    const raw = process.env.ENRICHMENT_TOGGLE_EMAILS ?? '';
    const entries = raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0);

    if (entries.length === 0) {
        return new Set(['lamounier_88@hotmail.com']);
    }

    return new Set(entries);
}

export function isEnrichmentToggleAllowed(email: string | null | undefined): boolean {
    if (!email) return false;
    return allowlist().has(email.trim().toLowerCase());
}
