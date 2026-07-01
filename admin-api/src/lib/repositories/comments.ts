/**
 * @format
 * CommentRepository — typed pg queries for the article_comments table.
 *
 * Backs the admin comment-moderation surface. The public-api inserts comments
 * as `status='pending'`; only `status='approved'` are served to visitors. These
 * queries are the missing approve/reject/delete half of that moderation loop.
 */
import type { Queryable } from '../pg.js';

/** Moderation status stored in article_comments.status. */
export type CommentStatus = 'pending' | 'approved' | 'rejected';

/** Admin view of a comment — includes email + status (never exposed publicly). */
export interface AdminComment {
    commentId:   string;
    articleSlug: string;
    name:        string;
    email:       string;
    body:        string;
    status:      CommentStatus;
    createdAt:   Date;
}

/** Newest-first cap for the moderation queue. */
const LIST_LIMIT = 200;

interface CommentRow {
    id:           string;
    article_slug: string;
    name:         string;
    email:        string;
    body:         string;
    status:       CommentStatus;
    created_at:   Date;
}

function rowToAdminComment(row: CommentRow): AdminComment {
    return {
        commentId:   row.id,
        articleSlug: row.article_slug,
        name:        row.name,
        email:       row.email,
        body:        row.body,
        status:      row.status,
        createdAt:   row.created_at,
    };
}

/** List comments in a given moderation status, newest first. */
export async function listCommentsByStatus(
    pool: Queryable,
    status: CommentStatus,
): Promise<AdminComment[]> {
    const result = await pool.query<CommentRow>(
        `SELECT id, article_slug, name, email, body, status, created_at
           FROM article_comments
          WHERE status = $1
          ORDER BY created_at DESC
          LIMIT ${LIST_LIMIT}`,
        [status],
    );
    return result.rows.map(rowToAdminComment);
}

/**
 * Set a comment's moderation status by id.
 * @returns the updated comment, or null if no row matched.
 */
export async function moderateComment(
    pool: Queryable,
    id: string,
    status: Extract<CommentStatus, 'approved' | 'rejected'>,
): Promise<AdminComment | null> {
    const result = await pool.query<CommentRow>(
        `UPDATE article_comments
            SET status = $2
          WHERE id = $1
      RETURNING id, article_slug, name, email, body, status, created_at`,
        [id, status],
    );
    const row = result.rows[0];
    return row ? rowToAdminComment(row) : null;
}

/** Permanently delete a comment by id. @returns true if a row was removed. */
export async function deleteComment(pool: Queryable, id: string): Promise<boolean> {
    const result = await pool.query(
        `DELETE FROM article_comments WHERE id = $1`,
        [id],
    );
    return (result.rowCount ?? 0) > 0;
}
