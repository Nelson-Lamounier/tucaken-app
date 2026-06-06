/** @vitest-environment happy-dom */
import type { ReactElement, ReactNode } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimelineTab } from '@/features/applications/stages/components/workspace-shell/rail-tabs/TimelineTab'
import { NotesTab } from '@/features/applications/stages/components/workspace-shell/rail-tabs/NotesTab'
import type { AnnotationStore } from '@/features/applications/stages/hooks/useAnnotations'
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

  it('NotesTab shows the empty state with no annotations', () => {
    renderWithQuery(<NotesTab store={{}} />)
    expect(screen.getByText(/No annotations yet/)).toBeTruthy()
  })

  it('NotesTab groups annotations by section', () => {
    const store: AnnotationStore = {
      'gap-ruby': { section: 'Skills gaps', label: 'Ruby', notes: [{ id: 'n1', text: 'Brush up Rails', createdAt: '2026-06-02T10:00:00.000Z' }] },
    }
    renderWithQuery(<NotesTab store={store} />)
    expect(screen.getByText('Skills gaps')).toBeTruthy()
    expect(screen.getByText('Ruby')).toBeTruthy()
    expect(screen.getByText('Brush up Rails')).toBeTruthy()
  })
})
