/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createRootRoute, createRouter, RouterProvider, createMemoryHistory } from '@tanstack/react-router'
import { ApplicationListRow } from '@/features/applications/components/ApplicationListRow'
import type { ApplicationSummary } from '@/lib/types/applications.types'

const app = {
  slug: 'acme-dev', targetCompany: 'Acme', targetRole: 'Dev',
  status: 'applied', interviewStage: 'applied', updatedAt: '2026-01-01',
} as unknown as ApplicationSummary

function renderInRouter(ui: React.ReactNode) {
  const root = createRootRoute({ component: () => <>{ui}</> })
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterProvider router={router} />)
}

const cb = {
  onOpen: () => {}, onPreviewResume: () => {}, onEditResume: () => {},
  onPreviewCoverLetter: () => {}, onEditCoverLetter: () => {},
}

describe('ApplicationListRow', () => {
  it('renders company + role and no action buttons without a tailored resume', async () => {
    renderInRouter(<ApplicationListRow app={app} tailored={null} {...cb} />)
    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument())
    expect(screen.queryByLabelText('Edit resume')).toBeNull()
  })
  it('shows resume actions when a tailored resume exists', async () => {
    const tailored = { slug: 'acme-dev', targetCompany: 'Acme', targetRole: 'Dev', updatedAt: '2026-01-01', data: {}, coverLetter: null }
    renderInRouter(<ApplicationListRow app={app} tailored={tailored as never} {...cb} />)
    await waitFor(() => expect(screen.getByLabelText('Edit resume')).toBeInTheDocument())
  })
})
