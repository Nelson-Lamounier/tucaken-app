/** @vitest-environment happy-dom */
import type { ReactElement, ReactNode } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimelineTab } from '@/features/applications/stages/components/workspace-shell/rail-tabs/TimelineTab'
import { NotesTab } from '@/features/applications/stages/components/workspace-shell/rail-tabs/NotesTab'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const detail = {
  slug: 'acme-swe',
  targetCompany: 'Acme',
  targetRole: 'SWE',
  status: 'analysing',
  interviewStage: 'technical',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
} as unknown as ApplicationDetail

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

function renderWithQuery(ui: ReactElement) {
  return render(ui, { wrapper: createWrapper() })
}

beforeEach(() => globalThis.localStorage.clear())

describe('rail tabs', () => {
  it('TimelineTab renders the derived events', () => {
    renderWithQuery(<TimelineTab detail={detail} />)
    expect(screen.getByText('Application created')).toBeTruthy()
  })

  it('NotesTab renders the active-stage quick-add label', () => {
    renderWithQuery(<NotesTab detail={detail} activeStage="technical" />)
    expect(screen.getByText(/Note for/)).toBeTruthy()
  })
})
