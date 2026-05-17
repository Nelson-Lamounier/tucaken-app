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

    const connected = mockApiResponse('/github/connected-repos', 'GET') as {
      repos: Array<{ syncStatus: string }>
    }
    expect(connected.repos.length).toBeGreaterThan(0)
    // ProcessingStep advances only when every connected repo is terminal.
    expect(connected.repos.every((r) => ['complete', 'error'].includes(r.syncStatus))).toBe(true)

    // Connect/remove mutations resolve without throwing.
    expect(mockApiResponse('/github/connected-repos', 'POST')).toMatchObject({ status: expect.any(String) })
    expect(mockApiResponse('/github/connected-repos/:repoFullName', 'DELETE')).toEqual({ success: true })
  })
})
