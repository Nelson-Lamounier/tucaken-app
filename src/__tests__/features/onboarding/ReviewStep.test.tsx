/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

const useProfileSummaryMock = vi.fn()
vi.mock('@/features/profile/hooks/use-profile-summary', () => ({
  useProfileSummary: () => useProfileSummaryMock(),
}))

vi.mock('@/server/resume-imports', () => ({
  getImportProgressFn:   vi.fn(() => Promise.resolve({ gapReportReady: false })),
  getGapReportFn:        vi.fn(() => Promise.resolve(null)),
  listCareerEntriesFn:   vi.fn(() => Promise.resolve([])),
  updateCareerEntryFn:   vi.fn(() => Promise.resolve(undefined)),
}))

// The readiness diagnostic is now admin-only; getMeFn drives the role gate.
const getMeMock = vi.fn()
vi.mock('@/server/me', () => ({ getMeFn: () => getMeMock() }))

// User-path panels (KB-quality + activity) — resolve to empty data.
vi.mock('@/server/activity', () => ({
  getKbHealthFn:      vi.fn(() => Promise.resolve({ repositories: [], totals: { repoCount: 0, files: 0, chunks: 0, embedded: 0, avgKbQuality: null } })),
  getDailyActivityFn: vi.fn(() => Promise.resolve({ days: [], totals: { applications: 0, resumes: 0 } })),
}))

import { ReviewStep } from '@/features/onboarding/components/steps/ReviewStep'

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ReviewStep', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    useProfileSummaryMock.mockReset()
    useProfileSummaryMock.mockReturnValue({ data: undefined })
    getMeMock.mockReset()
    getMeMock.mockResolvedValue({ plan: { role: 'user' } })
  })

  it('renders the all-set finish screen when no importId is present', () => {
    renderWithClient(<ReviewStep importId={undefined} />)
    expect(screen.getByText(/you're all set/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /finish/i })).toBeTruthy()
  })

  it('navigates to /overview when Finish is clicked (no-id path)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    renderWithClient(<ReviewStep importId={undefined} />)
    await userEvent.click(screen.getByRole('button', { name: /finish/i }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/overview', replace: true })
  })

  it('calls onFinish instead of navigating when onFinish is provided', async () => {
    const onFinish = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    renderWithClient(<ReviewStep importId={undefined} onFinish={onFinish} />)
    await userEvent.click(screen.getByRole('button', { name: /finish/i }))
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('renders the DiagnosticPanel overall score for admins in the review path', async () => {
    getMeMock.mockResolvedValue({ plan: { role: 'admin' } })
    useProfileSummaryMock.mockReturnValue({
      data: {
        diagnostic: {
          overall: 78,
          components: {
            profileDepth:            { score: 80, blockers: [] },
            ragDepth:                { score: 70, blockers: [] },
            directionConfidence:     { score: 80, blockers: [] },
            reconciliationAlignment: { score: 80, blockers: [] },
            resumeCoverage:          { score: 80, blockers: [] },
          },
          methodology: { version: 1, weights: {}, notes: '' },
          explanation: 'Solid baseline.',
        },
      },
    })
    renderWithClient(<ReviewStep importId="import-123" />)
    expect(await screen.findByText('78')).toBeTruthy()
    expect(screen.getByText('/100')).toBeTruthy()
  })

  it('hides the diagnostic from non-admins and shows the KB-quality panel instead', async () => {
    getMeMock.mockResolvedValue({ plan: { role: 'user' } })
    useProfileSummaryMock.mockReturnValue({ data: { diagnostic: { overall: 78, components: {}, methodology: { version: 1, weights: {}, notes: '' } } } })
    renderWithClient(<ReviewStep importId="import-123" />)
    expect((await screen.findAllByText('Chunks generated')).length).toBeGreaterThan(0)
    expect(screen.queryByText('/100')).toBeNull()
  })
})
