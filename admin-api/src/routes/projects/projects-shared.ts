/**
 * @format
 * admin-api — Projects route-private shared validators.
 */

export const VALID_TYPES        = new Set(['side_project', 'open_source', 'production_saas', 'client_work', 'internal_tool', 'learning_project']);
export const VALID_STATUSES     = new Set(['active', 'stable', 'dormant', 'archived']);
export const VALID_VISIBILITIES = new Set(['private', 'unlisted', 'public']);
export const VALID_ROLES        = new Set(['sole_builder', 'lead', 'contributor', 'maintainer']);
export const VALID_CONFIDENCE   = new Set(['high', 'medium', 'low']);

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;


export function isUuid(value: unknown): value is string {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function parsePositiveInt(input: string | undefined, fallback: number, max: number): number {
    if (!input) return fallback;
    const n = Number.parseInt(input, 10);
    if (Number.isNaN(n) || n < 0) return fallback;
    return Math.min(n, max);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Normalise a nullable text patch field: null → null, string → string, else undefined. */
export function nullableString(value: unknown): string | null | undefined {
    if (value === null) return null;
    return typeof value === 'string' ? value : undefined;
}

/** True when `value` is a string that belongs to the allowed set. */
export function isValidOption(allowed: Set<string>, value: unknown): boolean {
    return typeof value === 'string' && allowed.has(value);
}
