/**
 * @format
 * Portfolio ISR revalidation — best-effort publish hook.
 *
 * After an article's status flips to 'published' in Postgres, the portfolio
 * (nextjs) still serves a cached page until its 1-hour ISR window lapses. This
 * calls the portfolio's on-demand revalidation endpoint so a freshly published
 * (or edited-and-republished) article appears immediately.
 *
 * Best-effort by design: a revalidation failure must NEVER fail the publish.
 * The article is already published in PG; the worst case without this call is
 * the pre-existing up-to-1-hour delay. All failures are logged, not thrown.
 */

import type { AdminApiConfig } from './config.js';
import { logger } from './observability/logger.js';

/** How long to wait on the portfolio before giving up (ms). */
const REVALIDATE_TIMEOUT_MS = 5_000;

/**
 * Fire a best-effort ISR revalidation for a published article slug.
 * Never throws — returns a small result for logging/testing only.
 *
 * @param config - Resolved admin-api config (carries URL + secret).
 * @param slug   - The published article slug to revalidate.
 */
export async function revalidatePortfolioArticle(
    config: AdminApiConfig,
    slug: string,
): Promise<{ ok: boolean; skipped?: boolean; status?: number }> {
    const { portfolioRevalidateUrl, portfolioRevalidateSecret } = config;

    if (!portfolioRevalidateSecret) {
        logger.warn(
            { slug },
            'portfolio revalidation skipped — REVALIDATION_SECRET not configured',
        );
        return { ok: false, skipped: true };
    }

    try {
        const res = await fetch(`${portfolioRevalidateUrl}/api/revalidate`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ secret: portfolioRevalidateSecret, slug }),
            signal:  AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
        });
        if (!res.ok) {
            logger.warn({ slug, status: res.status }, 'portfolio revalidation returned non-2xx');
            return { ok: false, status: res.status };
        }
        logger.info({ slug }, 'portfolio revalidation triggered');
        return { ok: true, status: res.status };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.warn({ slug, error: message }, 'portfolio revalidation failed — publish unaffected');
        return { ok: false };
    }
}
