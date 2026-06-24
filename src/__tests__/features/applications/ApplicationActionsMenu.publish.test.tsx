/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApplicationActionsMenu } from '@/features/applications/components/ApplicationActionsMenu'
import type { ApplicationDetail } from '@/lib/types/applications.types'

// ── dependency mocks ────────────────────────────────────────────────────────

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/lib/stores/toast-store', () => ({
  useToastStore: () => ({ addToast: vi.fn() }),
}))

vi.mock('@/server/resumes', () => ({
  createResumeFn: vi.fn(),
  setActiveResumeFn: vi.fn(),
}))

vi.mock('@/server/applications', () => ({
  deleteApplicationFn: vi.fn(),
}))

vi.mock('@/hooks/use-pdf-download', () => ({
  usePdfDownload: () => ({ generatePdf: vi.fn() }),
}))

// Stub the builder drawer so it doesn't pull in heavy deps.
vi.mock('@/features/applications/components/ResumeBuilderDrawer', () => ({
  ResumeBuilderDrawer: () => null,
}))

// ── fixtures ────────────────────────────────────────────────────────────────

const tailoredResume = {
  profile: { name: 'Nelson', email: 'n@n.com', phone: '', linkedin: '', github: '', location: '' },
  summary: '',
  experience: [],
  education: [],
  skills: [],
}

const baseDetail = {
  slug: 'acme-swe',
  targetCompany: 'Acme',
  targetRole: 'SWE',
  status: 'applied',
  interviewStage: 'applied',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  stages: {},
  analysis: {
    tailoredResume,
    coverLetter: null,
    fitScore: null,
    fitRating: null,
    fitSummary: null,
    keyStrengths: [],
    gapAnalysis: [],
  },
} as unknown as ApplicationDetail

const STATUS_OPTIONS = [{ label: 'Applied', value: 'applied' }]

function renderMenu(viewerEmail: string | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ApplicationActionsMenu
        detail={baseDetail}
        viewedStage="applied"
        statusLabel="Applied"
        statusOptions={STATUS_OPTIONS}
        statusValue="applied"
        statusPending={false}
        onStatusChange={vi.fn()}
        viewerEmail={viewerEmail}
      />
    </QueryClientProvider>,
  )
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('ApplicationActionsMenu — publish gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the Publish item when viewerEmail is in the allow-list', () => {
    renderMenu('lamounier_88@hotmail.com')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Publish')).toBeTruthy()
  })

  it('hides the Publish item when viewerEmail is not in the allow-list', () => {
    renderMenu('other@example.com')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Publish')).toBeNull()
  })

  it('hides the Publish item when viewerEmail is undefined', () => {
    renderMenu(undefined)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Publish')).toBeNull()
  })
})
