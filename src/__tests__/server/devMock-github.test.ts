import { describe, it, expect } from 'vitest'
import { mockApiResponse } from '@/server/_dev-mock'

// The dev mock must let the onboarding GitHub steps run offline: no
// installation until the App-install POST happens, then a fixture
// installation + accessible/connected repos. State is module-global, so
// this single ordered test walks the whole connect lifecycle.
describe('mockApiResponse — GitHub stateful flow', () => {
  it('returns no installation until POST, then fixtures', () => {
    // Before connect: not installed.
    expect(mockApiResponse('/github/installation', 'GET')).toEqual({ installation: null })
    expect(mockApiResponse('/github/repos', 'GET')).toEqual({ repos: [] })
    expect(mockApiResponse('/github/connected-repos', 'GET')).toEqual({ repos: [] })

    // App install callback POSTs /github/installation.
    expect(mockApiResponse('/github/installation', 'POST')).toEqual({ success: true })

    // After connect: fixture installation + repos visible.
    const inst = mockApiResponse('/github/installation', 'GET') as {
      installation: { installationId: string; accountLogin: string } | null
    }
    expect(inst.installation).not.toBeNull()
    expect(inst.installation?.installationId).toBeTruthy()
    expect(inst.installation?.accountLogin).toBeTruthy()

    const repos = mockApiResponse('/github/repos', 'GET') as { repos: unknown[] }
    expect(repos.repos.length).toBeGreaterThan(0)

    // Connected repos start empty — nothing connected until the user adds.
    expect(mockApiResponse('/github/connected-repos', 'GET')).toEqual({ repos: [] })

    // "Add" queues the repo with deferSync — it appears as 'pending', NOT syncing.
    expect(
      mockApiResponse(
        '/github/connected-repos',
        'POST',
        JSON.stringify({ repoFullName: 'dev-user/portfolio-api', defaultBranch: 'main', deferSync: true }),
      ),
    ).toEqual({ status: 'queued', repoFullName: 'dev-user/portfolio-api', jobName: null })

    const queued = mockApiResponse('/github/connected-repos', 'GET') as {
      repos: Array<{ repoFullName: string; syncStatus: string }>
    }
    expect(queued.repos).toHaveLength(1)
    expect(queued.repos[0]!.syncStatus).toBe('pending')

    // Bulk sync starts jobs for all pending repos → they become 'syncing'.
    expect(mockApiResponse('/github/connected-repos/sync', 'POST')).toEqual({ started: 1 })
    const syncing = mockApiResponse('/github/connected-repos', 'GET') as {
      repos: Array<{ syncStatus: string }>
    }
    expect(syncing.repos[0]!.syncStatus).toBe('syncing')

    // DELETE de-queues by url-encoded repoFullName.
    expect(
      mockApiResponse(
        `/github/connected-repos/${encodeURIComponent('dev-user/portfolio-api')}`,
        'DELETE',
      ),
    ).toEqual({ success: true })
    expect(mockApiResponse('/github/connected-repos', 'GET')).toEqual({ repos: [] })
  })
})
