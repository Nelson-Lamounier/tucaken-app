/**
 * @format
 * admin-api — Comment moderation routes (PG-only).
 *
 * Routes (all protected by Cognito JWT middleware / the `admin` group):
 *
 *   GET    /api/admin/comments/pending        — Comments awaiting moderation
 *   POST   /api/admin/comments/:id/moderate   — Approve or reject a comment
 *   DELETE /api/admin/comments/:id            — Permanently delete a comment
 *
 * Comments are inserted by the public-api as `status='pending'`; only
 * `status='approved'` are served to portfolio visitors. This router is the
 * approve/reject/delete half of that loop. The frontend (src/server/comments.ts,
 * src/features/comments) already consumes these endpoints.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import type { AdminApiConfig } from '../../lib/config.js';
import { getPool } from '../../lib/pg.js';
import { requireAdminGroup } from '../../middleware/auth.js';
import {
    listCommentsByStatus,
    moderateComment,
    deleteComment,
} from '../../lib/repositories/comments.js';
import type { AdminApiBindings } from '../../lib/types.js';
import { jsonBody } from '../../lib/validate.js';

/** Body for POST /:id/moderate — the frontend sends approve|reject. */
const moderateSchema = z.object({
    status: z.enum(['approve', 'reject']),
});

/** approve|reject action → the stored article_comments.status value. */
const STATUS_MAP = { approve: 'approved', reject: 'rejected' } as const;

/**
 * Create the comment-moderation admin router.
 *
 * @param config - Resolved application configuration.
 * @returns Hono router with comment moderation routes.
 */
export function createCommentsRouter(config: AdminApiConfig): Hono<AdminApiBindings> {
    const router = new Hono<AdminApiBindings>();

    router.use('*', requireAdminGroup());

    // GET /api/admin/comments/pending — moderation queue
    router.get('/pending', async (ctx) => {
        const comments = await listCommentsByStatus(getPool(config), 'pending');
        return ctx.json({ comments, count: comments.length });
    });

    // POST /api/admin/comments/:id/moderate — approve or reject
    router.post('/:id/moderate', jsonBody(moderateSchema), async (ctx) => {
        const id = ctx.req.param('id');

        const { status } = ctx.req.valid('json');
        const comment = await moderateComment(getPool(config), id, STATUS_MAP[status]);
        if (!comment) return ctx.json({ error: 'Comment not found' }, 404);

        return ctx.json({ comment });
    });

    // DELETE /api/admin/comments/:id — permanent delete
    router.delete('/:id', async (ctx) => {
        const id = ctx.req.param('id');
        const deleted = await deleteComment(getPool(config), id);
        if (!deleted) return ctx.json({ error: 'Comment not found' }, 404);
        return ctx.json({ deleted: true });
    });

    return router;
}
