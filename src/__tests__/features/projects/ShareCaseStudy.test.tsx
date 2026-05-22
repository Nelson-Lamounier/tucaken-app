/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const patchProjectMock = vi.fn()
vi.mock('@/server/projects', () => ({
  patchProjectFn:     (args: unknown) => patchProjectMock(args),
  listProjectsFn:     vi.fn(),
  getProjectDetailFn: vi.fn(),
}))

const installationMock = vi.fn()
vi.mock('@/features/github/hooks/use-github-installation', () => ({
  useGitHubInstallation: () => installationMock(),
}))

import { ShareCaseStudy } from '@/features/projects/components/detail/ShareCaseStudy'
import type { ProjectVisibility } from '@/features/projects/lib/types'

function renderShare(visibility: ProjectVisibility) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ShareCaseStudy projectId="p1" slug="atlas" visibility={visibility} />
    </QueryClientProvider>,
  )
}

describe('ShareCaseStudy', () => {
  beforeEach(() => {
    patchProjectMock.mockReset().mockResolvedValue({ updated: 1 })
    installationMock.mockReset().mockReturnValue({ data: { accountLogin: 'nelson' } })
  })

  it('shows a private hint and no URL when visibility is private', () => {
    renderShare('private')
    expect(screen.getByText(/set visibility to public/i)).toBeTruthy()
    expect(screen.queryByText(/\/u\/nelson\/p\/atlas/)).toBeNull()
  })

  it('renders the public URL built from accountLogin + slug when public', () => {
    renderShare('public')
    expect(screen.getByText((c) => c.includes('/u/nelson/p/atlas'))).toBeTruthy()
  })

  it('calls patchProjectFn when visibility is changed', async () => {
    renderShare('private')
    await userEvent.selectOptions(screen.getByLabelText(/project visibility/i), 'public')
    expect(patchProjectMock).toHaveBeenCalledWith({
      data: { id: 'p1', patch: { visibility: 'public' } },
    })
  })

  it('copies the URL to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderShare('public')
    await userEvent.click(screen.getByRole('button', { name: /copy public url/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/u/nelson/p/atlas')))
  })

  it('prompts to connect GitHub when no installation is present', () => {
    installationMock.mockReturnValue({ data: null })
    renderShare('public')
    expect(screen.getByText(/connect github to generate/i)).toBeTruthy()
  })
})
