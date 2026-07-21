/**
 * @format
 * Pure HMAC-SHA256 verifier for GitHub webhook signatures.
 *
 * GitHub signs every delivery with the App's webhook secret and ships the
 * digest in `X-Hub-Signature-256: sha256=<hex>`. This helper hex-decodes the
 * supplied digest, length-checks it (which also catches malformed hex), and
 * compares against a freshly computed digest in constant time. It returns
 * false on every malformed-input case — it never throws.
 *
 * Kept semantically identical to ai-applications'
 * `applications/shared/src/github/webhookSignature.ts` — if one changes, the
 * other must change with it.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(
    rawBody:     Buffer | string,
    headerValue: string | undefined | null,
    secret:      string,
): boolean {
    if (!headerValue || !headerValue.startsWith('sha256=')) return false;

    const expected = Buffer.from(headerValue.slice('sha256='.length), 'hex');
    const actual   = createHmac('sha256', secret).update(rawBody).digest();

    if (expected.length !== actual.length) return false; // also catches malformed hex
    return timingSafeEqual(expected, actual);
}
