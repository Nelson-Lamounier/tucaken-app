/**
 * @format
 * Unit tests for the GitHub webhook HMAC-SHA256 verifier.
 *
 * Mirrors the strict semantics of ai-applications' shared
 * `verifyWebhookSignature`: `sha256=` prefix required, digest hex-decoded,
 * length-checked (catches malformed hex), constant-time compare, never throws.
 */

import { describe, it, expect } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../../src/lib/webhook-signature.js';

const SECRET = 'test-webhook-secret';
const BODY   = JSON.stringify({ action: 'created', installation: { id: 42 } });

function sign(body: string, secret: string = SECRET): string {
    return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyWebhookSignature', () => {
    it('accepts a valid signature over a string body', () => {
        expect(verifyWebhookSignature(BODY, sign(BODY), SECRET)).toBe(true);
    });

    it('accepts a valid signature over a Buffer body', () => {
        expect(verifyWebhookSignature(Buffer.from(BODY), sign(BODY), SECRET)).toBe(true);
    });

    it('rejects when the body was tampered with', () => {
        expect(verifyWebhookSignature(BODY + 'x', sign(BODY), SECRET)).toBe(false);
    });

    it('rejects when the digest was tampered with', () => {
        const sig = sign(BODY);
        const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
        expect(verifyWebhookSignature(BODY, flipped, SECRET)).toBe(false);
    });

    it('rejects when signed with a different secret', () => {
        expect(verifyWebhookSignature(BODY, sign(BODY, 'other-secret'), SECRET)).toBe(false);
    });

    it('rejects a missing header', () => {
        expect(verifyWebhookSignature(BODY, undefined, SECRET)).toBe(false);
        expect(verifyWebhookSignature(BODY, null, SECRET)).toBe(false);
    });

    it('rejects an empty header', () => {
        expect(verifyWebhookSignature(BODY, '', SECRET)).toBe(false);
    });

    it('rejects a sha1= prefixed header', () => {
        const sha1 = 'sha1=' + createHmac('sha1', SECRET).update(BODY).digest('hex');
        expect(verifyWebhookSignature(BODY, sha1, SECRET)).toBe(false);
    });

    it('rejects malformed hex after the prefix without throwing', () => {
        expect(verifyWebhookSignature(BODY, 'sha256=not-hex-at-all', SECRET)).toBe(false);
    });

    it('rejects a truncated digest without throwing', () => {
        expect(verifyWebhookSignature(BODY, sign(BODY).slice(0, 20), SECRET)).toBe(false);
    });
});
