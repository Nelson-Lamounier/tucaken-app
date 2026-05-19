import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

export const getGitHubInstallationFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  try {
    const body = await apiFetch<{ installation: GitHubInstallation }>('/github/installation')
    return body.installation
  } catch (err) {
    if (err instanceof Error && err.message.includes('[404]')) return null
    throw err
  }
})

const installSchema = z.object({ installationId: z.string().min(1) })

export const handleGitHubInstallFn = createServerFn({ method: 'POST' })
  .inputValidator(installSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ success: boolean }>('/github/installation', {
      method: 'POST',
      body: JSON.stringify({ installationId: data.installationId }),
    })
  })

export const disconnectGitHubFn = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAuth()
  return apiFetch<{ success: boolean }>('/github/installation', { method: 'DELETE' })
})

export const getGitHubAccessibleReposFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  const body = await apiFetch<{ repos: GitHubAccessibleRepo[] }>('/github/repos')
  return body.repos
})

export const getGitHubConnectedReposFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  const body = await apiFetch<{ repos: ConnectedRepo[] }>('/github/connected-repos')
  return body.repos
})

const ingestionSchema = z.object({
  repoFullName:  z.string().min(1),
  defaultBranch: z.string().optional(),
  forceReindex:  z.boolean().optional(),
})

export const triggerGitHubIngestionFn = createServerFn({ method: 'POST' })
  .inputValidator(ingestionSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    // /github/connected-repos: inserts repo + sync state, quota-checks, dispatches K8s Job.
    // /ingestion/trigger is admin-only and bypasses quota/repo-state management.
    return apiFetch<{ status: string; repoFullName: string; jobName: string }>(
      '/github/connected-repos',
      {
        method: 'POST',
        body: JSON.stringify({
          repoFullName:  data.repoFullName,
          defaultBranch: data.defaultBranch,
          forceReindex:  data.forceReindex,
        }),
      },
    )
  })

const queueSchema = z.object({
  repoFullName:  z.string().min(1),
  defaultBranch: z.string().optional(),
})

// Connect a repo WITHOUT dispatching the sync job (onboarding queue).
// admin-api treats deferSync:true as connect-only (status 'pending').
export const queueConnectedRepoFn = createServerFn({ method: 'POST' })
  .inputValidator(queueSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ status: string; repoFullName: string; jobName: string | null }>(
      '/github/connected-repos',
      {
        method: 'POST',
        body: JSON.stringify({
          repoFullName:  data.repoFullName,
          defaultBranch: data.defaultBranch,
          deferSync:     true,
        }),
      },
    )
  })

// Dispatch ingestion jobs for every 'pending' repo of the caller.
export const startConnectedReposSyncFn = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAuth()
  return apiFetch<{ started: number }>('/github/connected-repos/sync', {
    method: 'POST',
  })
})

const removeRepoSchema = z.object({ repoFullName: z.string().min(1) })

export const removeConnectedRepoFn = createServerFn({ method: 'POST' })
  .inputValidator(removeRepoSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ success: boolean }>(
      `/github/connected-repos/${encodeURIComponent(data.repoFullName)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ repoFullName: data.repoFullName }),
        pathTemplate: '/github/connected-repos/:repoFullName',
      },
    )
  })

const setRepoFeaturedSchema = z.object({
  repoFullName: z.string().min(1),
  useInResume:  z.boolean(),
})

export const setRepoFeaturedFn = createServerFn({ method: 'POST' })
  .inputValidator(setRepoFeaturedSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ repoFullName: string; isFeatured: boolean; featureRank: number | null }>(
      `/github/connected-repos/${encodeURIComponent(data.repoFullName)}/featured`,
      { method: 'PATCH', body: JSON.stringify({ useInResume: data.useInResume }) },
    )
  })

const markTimedOutSchema = z.object({
  repoFullNames: z.array(z.string().min(1)).min(1),
})

export const markReposTimedOutFn = createServerFn({ method: 'POST' })
  .inputValidator(markTimedOutSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ updated: number }>(
      '/github/connected-repos/mark-timed-out',
      {
        method: 'POST',
        body: JSON.stringify({ repoFullNames: data.repoFullNames }),
      },
    )
  })
