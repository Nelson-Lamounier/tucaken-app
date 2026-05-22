/**
 * @format
 * Projects domain server functions. Forwards to admin-api `/api/admin/projects/*`.
 *
 * @see admin-api/src/routes/projects.ts — upstream implementation
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'
import type { ProjectDetail, ProjectListResponse } from '../features/projects/lib/types'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const listProjectsSchema = z
  .object({
    limit:           z.number().int().min(1).max(100).optional(),
    offset:          z.number().int().min(0).max(10_000).optional(),
    includeArchived: z.boolean().optional(),
    proposalsOnly:   z.boolean().optional(),
  })
  .default({})

export const listProjectsFn = createServerFn({ method: 'GET' })
  .inputValidator(listProjectsSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    const params = new URLSearchParams()
    if (data.limit           !== undefined) params.set('limit',           String(data.limit))
    if (data.offset          !== undefined) params.set('offset',          String(data.offset))
    if (data.includeArchived !== undefined) params.set('includeArchived', String(data.includeArchived))
    if (data.proposalsOnly   !== undefined) params.set('proposalsOnly',   String(data.proposalsOnly))

    const qs = params.toString()
    return apiFetch<ProjectListResponse>(`/projects${qs ? `?${qs}` : ''}`, {
      pathTemplate: '/projects',
    })
  })

const projectIdSchema = z.string().regex(UUID_REGEX, 'project id must be a UUID')

export const getProjectDetailFn = createServerFn({ method: 'GET' })
  .inputValidator(projectIdSchema)
  .handler(async ({ data: id }) => {
    await requireAuth()
    return apiFetch<ProjectDetail>(`/projects/${encodeURIComponent(id)}`, {
      pathTemplate: '/projects/:id',
    })
  })

// ─── Mutations ──────────────────────────────────────────────────────────────

const patchProjectSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  patch: z.object({
    name:           z.string().min(1).max(200).optional(),
    tagline:        z.union([z.string(), z.null()]).optional(),
    pitch:          z.union([z.string(), z.null()]).optional(),
    type:           z.enum([
      'side_project', 'open_source', 'production_saas',
      'client_work', 'internal_tool', 'learning_project',
    ]).optional(),
    status:         z.enum(['active', 'stable', 'dormant', 'archived']).optional(),
    visibility:     z.enum(['private', 'unlisted', 'public']).optional(),
    role_exhibited: z.enum(['sole_builder', 'lead', 'contributor', 'maintainer']).optional(),
  }),
})

export const patchProjectFn = createServerFn({ method: 'POST' })
  .inputValidator(patchProjectSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ updated: number }>(`/projects/${encodeURIComponent(data.id)}`, {
      method:       'PATCH',
      body:         JSON.stringify(data.patch),
      pathTemplate: '/projects/:id',
    })
  })

const patchDecisionSchema = z.object({
  projectId:  z.string().regex(UUID_REGEX),
  decisionId: z.string().regex(UUID_REGEX),
  patch: z.object({
    title:             z.string().min(1).optional(),
    context:           z.union([z.string(), z.null()]).optional(),
    decision:          z.union([z.string(), z.null()]).optional(),
    consequences:      z.union([z.string(), z.null()]).optional(),
    confidence:        z.enum(['high', 'medium', 'low']).optional(),
    is_user_confirmed: z.boolean().optional(),
  }),
})

export const patchDecisionFn = createServerFn({ method: 'POST' })
  .inputValidator(patchDecisionSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ updated: number }>(
      `/projects/${encodeURIComponent(data.projectId)}/decisions/${encodeURIComponent(data.decisionId)}`,
      {
        method:       'PATCH',
        body:         JSON.stringify(data.patch),
        pathTemplate: '/projects/:id/decisions/:did',
      },
    )
  })

const deleteDecisionSchema = z.object({
  projectId:  z.string().regex(UUID_REGEX),
  decisionId: z.string().regex(UUID_REGEX),
})

export const deleteDecisionFn = createServerFn({ method: 'POST' })
  .inputValidator(deleteDecisionSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ deleted: number }>(
      `/projects/${encodeURIComponent(data.projectId)}/decisions/${encodeURIComponent(data.decisionId)}`,
      {
        method:       'DELETE',
        pathTemplate: '/projects/:id/decisions/:did',
      },
    )
  })

interface RegenerateResponse {
  status:        string
  pipelineRunId: string
  jobName:       string
  projectId:     string
}

export const regenerateProjectFn = createServerFn({ method: 'POST' })
  .inputValidator(projectIdSchema)
  .handler(async ({ data: id }) => {
    await requireAuth()
    return apiFetch<RegenerateResponse>(`/projects/${encodeURIComponent(id)}/regenerate`, {
      method:       'POST',
      pathTemplate: '/projects/:id/regenerate',
    })
  })

interface ConfirmResponse {
  confirmed:      boolean
  dispatched:     boolean
  pipelineRunId?: string
  jobName?:       string
  reason?:        string
  projectId:      string
}

export const confirmProjectFn = createServerFn({ method: 'POST' })
  .inputValidator(projectIdSchema)
  .handler(async ({ data: id }) => {
    await requireAuth()
    return apiFetch<ConfirmResponse>(`/projects/${encodeURIComponent(id)}/confirm`, {
      method:       'POST',
      pathTemplate: '/projects/:id/confirm',
    })
  })

export const archiveProjectFn = createServerFn({ method: 'POST' })
  .inputValidator(projectIdSchema)
  .handler(async ({ data: id }) => {
    await requireAuth()
    return apiFetch<{ archived: boolean }>(`/projects/${encodeURIComponent(id)}`, {
      method:       'DELETE',
      pathTemplate: '/projects/:id',
    })
  })

export const runClusteringFn = createServerFn({ method: 'POST' })
  .handler(async () => {
    await requireAuth()
    return apiFetch<{ status: string; pipelineRunId: string; jobName: string }>(
      `/projects/clustering/run`,
      { method: 'POST', pathTemplate: '/projects/clustering/run' },
    )
  })

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/

const mergeProjectsSchema = z.object({
  targetId:  z.string().regex(UUID_REGEX),
  sourceIds: z.array(z.string().regex(UUID_REGEX)).min(1),
}).refine((v) => !v.sourceIds.includes(v.targetId), {
  message: 'targetId must not appear in sourceIds',
})

export const mergeProjectsFn = createServerFn({ method: 'POST' })
  .inputValidator(mergeProjectsSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ componentsReassigned: number; sourcesArchived: number }>(`/projects/merge`, {
      method:       'POST',
      body:         JSON.stringify({ target_id: data.targetId, source_ids: data.sourceIds }),
      pathTemplate: '/projects/merge',
    })
  })

const splitProjectSchema = z.object({
  projectId:    z.string().regex(UUID_REGEX),
  componentIds: z.array(z.string().regex(UUID_REGEX)).min(1),
  name:         z.string().min(1).max(200),
  slug:         z.string().regex(SLUG_REGEX, 'slug must be 1-80 chars, lowercase letters/digits/hyphens'),
})

export const splitProjectFn = createServerFn({ method: 'POST' })
  .inputValidator(splitProjectSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ newProjectId: string; componentsMoved: number }>(
      `/projects/${encodeURIComponent(data.projectId)}/split`,
      {
        method:       'POST',
        body:         JSON.stringify({
          component_ids: data.componentIds,
          name:          data.name,
          slug:          data.slug,
        }),
        pathTemplate: '/projects/:id/split',
      },
    )
  })
