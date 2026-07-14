/**
 * @format
 * admin-api — Asset upload routes.
 *
 * Routes (all protected by Cognito JWT middleware):
 *
 *   POST /api/admin/assets/presign — Generate a pre-signed S3 PUT URL
 *               for direct browser-to-S3 upload (avoids proxy overhead).
 *   DELETE /api/admin/assets/:key  — Delete an asset from S3 by key.
 *
 * Pre-signed URL design:
 *   The TanStack tucaken-app frontend requests a signed URL, then puts
 *   the file directly to S3 from the browser. This avoids routing
 *   binary content through the Kubernetes pod, drastically reducing
 *   memory pressure and upload latency.
 *
 *   URL expiry: 5 minutes — sufficient for a direct upload.
 *
 * Bucket + key contract:
 *   Both routes sign/operate against the dedicated public article-assets
 *   bucket (`config.articleAssetsBucketName`), never the general
 *   `assetsBucketName`. Keys must already be in the canonical shape the
 *   article pipeline and public-api serving path expect —
 *   `images/articles/<slug>.<ext>` or `videos/articles/<slug>.<ext>` —
 *   and are used verbatim; this route no longer prepends an `articles/`
 *   prefix. Legacy `articles/`-prefixed (or any other non-canonical) keys
 *   are rejected with 400, so nothing gets uploaded to a key nothing
 *   serves.
 */

import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Hono } from 'hono';

import type { AdminApiConfig } from '../../lib/config.js';
import { isAssetsBucketConfigured } from '../../lib/config.js';
import { requireAdminGroup } from '../../middleware/auth.js';

/** S3 client singleton — credentials from IMDS, no explicit config. */
const s3 = new S3Client({
  region: process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'eu-west-1',
});

/** Allowed MIME types for article asset uploads. */
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
]);

/** Maximum upload size via pre-signed URL (50 MB). */
const MAX_CONTENT_LENGTH = 50 * 1024 * 1024;

/** Canonical article-media keys only — must mirror public-api's serving allowlist. */
const KEY_RE = /^(images|videos)\/articles\/[a-z0-9][a-z0-9-]*\.(jpeg|jpg|png|webp|gif|mp4|webm)$/;

/**
 * Create the assets admin router.
 *
 * @param config - Resolved application configuration.
 * @returns Hono router with asset upload/delete routes.
 */
export function createAssetsRouter(config: AdminApiConfig): Hono {
  const router = new Hono();

  router.use('*', requireAdminGroup());

  // -----------------------------------------------------------------------
  // POST /api/admin/assets/presign
  // Generate a pre-signed S3 PUT URL for browser-to-S3 direct upload.
  //
  // Request body:
  //   { key: string, contentType: string, contentLength: number }
  //
  // Response:
  //   { url: string, key: string, expiresIn: number }
  // -----------------------------------------------------------------------
  router.post('/presign', async (ctx) => {
    const body = await ctx.req.json<{
      key: string;
      contentType: string;
      contentLength: number;
    }>();

    const { key, contentType, contentLength } = body;

    if (!key || !contentType || !contentLength) {
      return ctx.json({ error: 'key, contentType, and contentLength are required' }, 400);
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return ctx.json(
        { error: `Unsupported content type: ${contentType}` },
        415,
      );
    }

    if (contentLength > MAX_CONTENT_LENGTH) {
      return ctx.json(
        { error: `File exceeds maximum allowed size of ${MAX_CONTENT_LENGTH / 1024 / 1024} MB` },
        413,
      );
    }

    // Canonical key shape only — images/articles/<slug>.<ext> or
    // videos/articles/<slug>.<ext>. No prefixing, no traversal, no
    // uppercase, no unlisted extensions. This mirrors public-api's
    // serving allowlist so a signed upload always lands somewhere served.
    if (!KEY_RE.test(key)) {
      return ctx.json({ error: `Key must match ${KEY_RE.source}` }, 400);
    }

    // articleAssetsBucketName is the dedicated public article-media
    // bucket. Until it is provisioned and published to SSM, refuse
    // uploads with 503 instead of producing a signed URL that points at
    // an undefined bucket.
    if (!isAssetsBucketConfigured(config.articleAssetsBucketName)) {
      return ctx.json(
        { error: 'Asset uploads unavailable — article-assets S3 bucket not configured' },
        503,
      );
    }

    const command = new PutObjectCommand({
      Bucket: config.articleAssetsBucketName,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes

    return ctx.json({ url, key, expiresIn: 300 });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/admin/assets/:key
  // Delete a specific asset by S3 key.
  // Key is URL-encoded in the path.
  // -----------------------------------------------------------------------
  router.delete('/:key{.+}', async (ctx) => {
    const rawKey = ctx.req.param('key');
    const key = decodeURIComponent(rawKey);

    // Canonical key shape only — same allowlist as presign.
    if (!KEY_RE.test(key)) {
      return ctx.json({ error: `Key must match ${KEY_RE.source}` }, 400);
    }

    if (!isAssetsBucketConfigured(config.articleAssetsBucketName)) {
      return ctx.json(
        { error: 'Asset deletion unavailable — article-assets S3 bucket not configured' },
        503,
      );
    }

    await s3.send(
      new DeleteObjectCommand({
        Bucket: config.articleAssetsBucketName,
        Key: key,
      }),
    );

    return ctx.json({ deleted: true, key });
  });

  return router;
}
