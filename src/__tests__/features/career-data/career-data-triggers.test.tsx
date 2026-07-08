/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}))

const listMock = vi.fn()
vi.mock('@/server/resume-imports', () => ({
  listCareerEntriesFn: (...args: unknown[]) => listMock(...args),
  updateCareerEntryFn: vi.fn(),
  deleteCareerEntryFn: vi.fn(),
}))

import { CareerDataBreakdown } from '@/features/user-home/components/CareerDataBreakdown'
import type { CareerEntry } from '@/server/resume-imports'

const ENTRY = {
  id: 'exp-1', entryType: 'experience',
  rawData: { title: 'Senior DevOps Engineer', company: 'Acme', period: '2023', highlights: [] },
  enrichedData: null, enrichmentStatus: 'skipped', displayOrder: 0, createdAt: '2026-05-29T00:00:00.000Z',
} as CareerEntry

beforeEach(() => {
  vi.clearAllMocks()
  listMock.mockResolvedValue([ENTRY])
})

describe('CareerDataBreakdown trigger', () => {
  it('opens the career entries modal from the panel header', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CareerDataBreakdown entries={[ENTRY]} latestImport={undefined} isLoading={false} />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View data' }))
    expect(await screen.findByText('Career data')).toBeTruthy()
    expect(await screen.findByText('Senior DevOps Engineer')).toBeTruthy()
  })
})
