/**
 * @format
 * Admin-only user management server functions.
 *
 * Every handler calls requireAdmin() — a fast-path Cognito `admin` group check
 * at the SSR edge — before forwarding to the admin-api BFF, which re-verifies
 * the JWT and re-checks the admin group. The UI is never the access control.
 */
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { AdminUserSummary, AdminUserDetail } from '@/features/admin-users/types'
import type { RepoRagSummary, UserDiagnosticResult } from '@/lib/types/rag.types'
import { requireAdmin } from './auth-guard'
import { apiFetch } from './_api-client'

export const listAdminUsersSchema = z
  .object({ tier: z.enum(['all', 'free', 'pro', 'premium']).default('all') })
  .default({ tier: 'all' })

const idSchema = z.object({ id: z.string().uuid() })

export const updateAdminUserSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(['user', 'admin']).optional(),
    plan: z.enum(['free', 'pro', 'premium']).optional(),
  })
  .refine((b) => b.role !== undefined || b.plan !== undefined, {
    message: 'At least one of role or plan is required',
  })

export const listAdminUsersFn = createServerFn({ method: 'GET' })
  .inputValidator(listAdminUsersSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const qs = data.tier !== 'all' ? `?tier=${encodeURIComponent(data.tier)}` : ''
    const body = await apiFetch<{ users: AdminUserSummary[]; total: number }>(
      `/users${qs}`,
      { pathTemplate: '/users' },
    )
    return body.users
  })

export const getAdminUserFn = createServerFn({ method: 'GET' })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const body = await apiFetch<{ user: AdminUserDetail }>(
      `/users/${encodeURIComponent(data.id)}`,
      { pathTemplate: '/users/:id' },
    )
    return body.user
  })

export const updateAdminUserFn = createServerFn({ method: 'POST' })
  .inputValidator(updateAdminUserSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const { id, ...patch } = data
    return apiFetch<{ ok: true; updated: boolean }>(`/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      pathTemplate: '/users/:id',
      body: JSON.stringify(patch),
    })
  })

export const restoreAdminUserFn = createServerFn({ method: 'POST' })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    return apiFetch<{ ok: true; restored?: boolean }>(
      `/users/${encodeURIComponent(data.id)}/restore`,
      { method: 'POST', pathTemplate: '/users/:id/restore' },
    )
  })

export const deleteAdminUserSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(['soft', 'hard']),
  reason: z.string().max(500).optional(),
})

export const deleteAdminUserFn = createServerFn({ method: 'POST' })
  .inputValidator(deleteAdminUserSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const { id, mode, reason } = data
    return apiFetch<
      | { ok: true; mode: 'soft'; alreadyDeleted: boolean }
      | { ok: true; mode: 'hard'; outcome: { githubUninstall: string; cognitoDeleted: boolean; dbDeleted: boolean } }
    >(`/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      pathTemplate: '/users/:id',
      body: JSON.stringify({ mode, ...(reason ? { reason } : {}) }),
    })
  })

export const disconnectAdminUserGithubFn = createServerFn({ method: 'POST' })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    return apiFetch<{ ok: true; disconnected: boolean; githubUninstall: string }>(
      `/users/${encodeURIComponent(data.id)}/github`,
      { method: 'DELETE', pathTemplate: '/users/:id/github' },
    )
  })

const repoDetailSchema = z.object({ id: z.string().uuid(), repo: z.string().min(1) })

/** Admin: a user's synced repositories with their RAG (KB-quality + retrieval) metrics. */
export const getUserRepositoriesFn = createServerFn({ method: 'GET' })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const body = await apiFetch<{ repositories: RepoRagSummary[] }>(
      `/users/${encodeURIComponent(data.id)}/repositories`,
      { pathTemplate: '/users/:id/repositories' },
    )
    return body.repositories
  })

/** Admin: a single repo's RAG detail (scores + breakdowns). */
export const getUserRepositoryFn = createServerFn({ method: 'GET' })
  .inputValidator(repoDetailSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const body = await apiFetch<{ repository: RepoRagSummary }>(
      `/users/${encodeURIComponent(data.id)}/repositories/${encodeURIComponent(data.repo)}`,
      { pathTemplate: '/users/:id/repositories/:repo' },
    )
    return body.repository
  })

/** Admin: an arbitrary user's full readiness diagnostic (every metric the panel shows). */
export const getUserDiagnosticFn = createServerFn({ method: 'GET' })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    return apiFetch<UserDiagnosticResult>(
      `/users/${encodeURIComponent(data.id)}/diagnostic`,
      { pathTemplate: '/users/:id/diagnostic' },
    )
  })
