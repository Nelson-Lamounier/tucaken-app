import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getCookie } from '@tanstack/react-start/server'
import type { GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'
import { requireAuth } from './auth-guard'

const ADMIN_API_URL =
  process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'

function getSessionToken(): string {
  const token = getCookie('__session')
  if (!token) throw new Error('Session cookie missing after auth guard')
  return token
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken()
  const res = await fetch(`${ADMIN_API_URL}/api/admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`admin-api ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

export const getGitHubInstallationFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth()
  try {
    const body = await apiFetch<{ installation: GitHubInstallation }>('/github/installation')
    return body.installation
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('admin-api 404')) return null
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
  repoFullName: z.string().min(1),
  forceReindex: z.boolean().optional(),
})

export const triggerGitHubIngestionFn = createServerFn({ method: 'POST' })
  .inputValidator(ingestionSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ status: string; pipelineRunId: string; jobName: string }>(
      '/ingestion/trigger',
      {
        method: 'POST',
        body: JSON.stringify({ repoFullName: data.repoFullName, forceReindex: data.forceReindex }),
      },
    )
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
      },
    )
  })
