/**
 * @format
 * Comment moderation server functions for the admin dashboard.
 *
 * All data operations are delegated to the `admin-api` BFF service via
 * authenticated `fetch()` requests. The frontend pod carries no direct
 * DynamoDB dependency for this domain.
 *
 * The `requireAuth()` call acts as a fast-path guard — it rejects
 * unauthenticated requests at the edge before the network hop to admin-api.
 * The raw JWT is forwarded as `Authorization: Bearer <token>` so admin-api
 * can re-verify it with Cognito.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

// =============================================================================
// Types
// =============================================================================

/** Comment moderation status returned by the admin API. */
type CommentStatus = 'pending' | 'approved' | 'rejected'

/** Admin view of a comment, including email and moderation status. */
interface AdminComment {
  commentId: string
  articleSlug: string
  name: string
  email: string
  body: string
  status: CommentStatus
  createdAt: string
}

/** Moderated comment returned after approve/reject. */
type ModeratedComment = AdminComment

// =============================================================================
// Input Schemas
// =============================================================================

const moderateCommentSchema = z.object({
  id: z.string().min(1, 'Comment composite ID is required'),
  status: z.enum(['approve', 'reject']),
})

const deleteCommentSchema = z.string().min(1, 'Comment composite ID is required')

// =============================================================================
// Server Functions
// =============================================================================

/**
 * Retrieves all comments pending moderation.
 *
 * @returns Array of pending comment records
 */
export const getPendingCommentsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()

  const body = await apiFetch<{ comments: AdminComment[]; count: number }>('/comments/pending')
  return body.comments
})

/**
 * Approves or rejects a pending comment.
 *
 * @param data.id - Composite comment ID in `slug__sk` format
 * @param data.status - `'approve'` or `'reject'`
 * @returns Success indicator
 */
export const moderateCommentFn = createServerFn({ method: 'POST' })
  .inputValidator(moderateCommentSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    await apiFetch<{ comment: ModeratedComment }>(
      `/comments/${encodeURIComponent(data.id)}/moderate`,
      {
        method: 'POST',
        body: JSON.stringify({ status: data.status }),
        pathTemplate: '/comments/:id/moderate',
      },
    )

    return { success: true }
  })

/**
 * Permanently deletes a comment.
 *
 * @param data - Composite comment ID in `slug__sk` format
 * @returns Success indicator
 */
export const deleteCommentFn = createServerFn({ method: 'POST' })
  .inputValidator(deleteCommentSchema)
  .handler(async ({ data: compositeId }) => {
    await requireAuth()

    await apiFetch<{ deleted: boolean }>(
      `/comments/${encodeURIComponent(compositeId)}`,
      { method: 'DELETE', pathTemplate: '/comments/:id' },
    )

    return { success: true }
  })
