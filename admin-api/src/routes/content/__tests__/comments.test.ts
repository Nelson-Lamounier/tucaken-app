import { jest } from '@jest/globals';

import type { AdminComment } from '../../../lib/repositories/comments.js';

const listCommentsByStatusMock = jest.fn<() => Promise<AdminComment[]>>();
const moderateCommentMock = jest.fn<() => Promise<AdminComment | null>>();
const deleteCommentMock = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule('../../../lib/repositories/comments.js', () => ({
    listCommentsByStatus: listCommentsByStatusMock,
    moderateComment: moderateCommentMock,
    deleteComment: deleteCommentMock,
}));

jest.unstable_mockModule('../../../lib/pg.js', () => ({ getPool: () => ({}) }));

// Auth is enforced at the app level (index.ts) + here; stub it to a pass-through
// so these tests exercise the handler logic, not the JWT middleware.
jest.unstable_mockModule('../../../middleware/auth.js', () => ({
    requireAdminGroup: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

const { createCommentsRouter } = await import('../comments.js');
const CONFIG = {} as never;

const COMMENT: AdminComment = {
    commentId:   '11111111-1111-1111-1111-111111111111',
    articleSlug: 'eks-golden-path',
    name:        'Ada',
    email:       'ada@example.com',
    body:        'Great write-up.',
    status:      'pending',
    createdAt:   new Date('2026-07-01T12:00:00.000Z'),
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GET /pending', () => {
    it('returns the pending queue with a count', async () => {
        listCommentsByStatusMock.mockResolvedValueOnce([COMMENT]);
        const app = createCommentsRouter(CONFIG);
        const res = await app.request('/pending');
        expect(res.status).toBe(200);
        const body = await res.json() as { comments: AdminComment[]; count: number };
        expect(body.count).toBe(1);
        expect(body.comments[0]?.commentId).toBe(COMMENT.commentId);
        expect(listCommentsByStatusMock).toHaveBeenCalledWith(expect.anything(), 'pending');
    });
});

describe('POST /:id/moderate', () => {
    it('maps approve -> approved and returns the updated comment', async () => {
        moderateCommentMock.mockResolvedValueOnce({ ...COMMENT, status: 'approved' });
        const app = createCommentsRouter(CONFIG);
        const res = await app.request(`/${COMMENT.commentId}/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approve' }),
        });
        expect(res.status).toBe(200);
        expect(moderateCommentMock).toHaveBeenCalledWith(expect.anything(), COMMENT.commentId, 'approved');
        const body = await res.json() as { comment: AdminComment };
        expect(body.comment.status).toBe('approved');
    });

    it('maps reject -> rejected', async () => {
        moderateCommentMock.mockResolvedValueOnce({ ...COMMENT, status: 'rejected' });
        const app = createCommentsRouter(CONFIG);
        const res = await app.request(`/${COMMENT.commentId}/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'reject' }),
        });
        expect(res.status).toBe(200);
        expect(moderateCommentMock).toHaveBeenCalledWith(expect.anything(), COMMENT.commentId, 'rejected');
    });

    it('rejects an invalid status with 400 and never touches the DB', async () => {
        const app = createCommentsRouter(CONFIG);
        const res = await app.request(`/${COMMENT.commentId}/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'delete-please' }),
        });
        expect(res.status).toBe(400);
        expect(moderateCommentMock).not.toHaveBeenCalled();
    });

    it('404s when the comment id does not exist', async () => {
        moderateCommentMock.mockResolvedValueOnce(null);
        const app = createCommentsRouter(CONFIG);
        const res = await app.request(`/${COMMENT.commentId}/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approve' }),
        });
        expect(res.status).toBe(404);
    });
});

describe('DELETE /:id', () => {
    it('deletes and returns { deleted: true }', async () => {
        deleteCommentMock.mockResolvedValueOnce(true);
        const app = createCommentsRouter(CONFIG);
        const res = await app.request(`/${COMMENT.commentId}`, { method: 'DELETE' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ deleted: true });
        expect(deleteCommentMock).toHaveBeenCalledWith(expect.anything(), COMMENT.commentId);
    });

    it('404s when nothing was deleted', async () => {
        deleteCommentMock.mockResolvedValueOnce(false);
        const app = createCommentsRouter(CONFIG);
        const res = await app.request(`/${COMMENT.commentId}`, { method: 'DELETE' });
        expect(res.status).toBe(404);
    });
});
