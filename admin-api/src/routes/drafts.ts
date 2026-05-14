/**
 * @format
 * admin-api — Draft upload route.
 *
 * Routes (protected by Cognito JWT middleware):
 *
 *   POST /api/admin/drafts/:slug — Write drafts/<slug>.md to the assets S3
 *        bucket. The bucket has an S3 event notification that fires the
 *        Article Pipeline Trigger Lambda automatically on PUT to drafts/*.
 *
 * The admin-api writes directly to S3 using its IRSA credentials — no
 * pre-signed URL round-trip needed since the content arrives server-side.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Hono } from 'hono';

import type { AdminApiConfig } from '../lib/config.js';
import { isAssetsBucketConfigured } from '../lib/config.js';

const s3 = new S3Client({
    region: process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'eu-west-1',
});

export function createDraftsRouter(config: AdminApiConfig): Hono {
    const router = new Hono();

    // -------------------------------------------------------------------------
    // POST /api/admin/drafts/:slug
    // Write drafts/<slug>.md to the assets bucket.
    // Body: { content: string }
    // Response: { uploaded: boolean, slug: string, key: string }
    // -------------------------------------------------------------------------
    router.post('/:slug', async (ctx) => {
        const slug = ctx.req.param('slug');

        if (!slug || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
            return ctx.json({ error: 'Invalid slug — must be lowercase alphanumeric with hyphens' }, 400);
        }

        if (!isAssetsBucketConfigured(config.assetsBucketName)) {
            return ctx.json(
                { error: 'Draft upload unavailable — assets S3 bucket not configured' },
                503,
            );
        }

        const body = await ctx.req.json<{ content?: string }>();
        const content = body.content;

        if (!content || typeof content !== 'string' || content.trim().length < 20) {
            return ctx.json({ error: 'content is required and must be at least 20 characters' }, 400);
        }

        const key = `drafts/${slug}.md`;

        await s3.send(
            new PutObjectCommand({
                Bucket:      config.assetsBucketName!,
                Key:         key,
                Body:        content,
                ContentType: 'text/markdown; charset=utf-8',
            }),
        );

        return ctx.json({ uploaded: true, slug, key });
    });

    return router;
}
