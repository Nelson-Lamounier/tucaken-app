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
