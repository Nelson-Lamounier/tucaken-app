/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CareerEntry } from '@/server/resume-imports'

const listMock   = vi.fn()
const updateMock = vi.fn()
const deleteMock = vi.fn()
const notifyErrorMock = vi.fn()

vi.mock('@/server/resume-imports', () => ({
  listCareerEntriesFn:  (...args: unknown[]) => listMock(...args),
  updateCareerEntryFn:  (...args: unknown[]) => updateMock(...args),
  deleteCareerEntryFn:  (...args: unknown[]) => deleteMock(...args),
}))

vi.mock('@/lib/errors/notify', () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
}))

import { CareerEntriesModal } from '@/features/career-data/components/CareerEntriesModal'

const ENTRIES: CareerEntry[] = [
  {
    id: 'exp-1', entryType: 'experience',
    rawData: { title: 'Senior DevOps Engineer', company: 'Acme', period: '2023-2026', highlights: ['Led EKS migration'] },
    enrichedData: { note: 'x' }, enrichmentStatus: 'complete', displayOrder: 0, createdAt: '2026-05-29T00:00:00.000Z',
  },
  {
    id: 'edu-1', entryType: 'education',
    rawData: { degree: 'BSc Computer Science', institution: 'UFMG', period: '2015-2019' },
    enrichedData: null, enrichmentStatus: 'skipped', displayOrder: 1, createdAt: '2026-05-29T00:00:00.000Z',
  },
  {
    id: 'skill-1', entryType: 'skill',
    rawData: { skills: ['React', 'TypeScript'] },
    enrichedData: null, enrichmentStatus: 'skipped', displayOrder: 2, createdAt: '2026-05-29T00:00:00.000Z',
  },
] as CareerEntry[]

function renderModal(props: Partial<Parameters<typeof CareerEntriesModal>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CareerEntriesModal open onClose={() => {}} {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listMock.mockResolvedValue(ENTRIES)
})

describe('CareerEntriesModal — view mode', () => {
  it('groups entries by type and renders their extracted fields', async () => {
    renderModal({ title: 'Nelson_Lamounier_Resume.pdf' })
    expect(await screen.findByText('Senior DevOps Engineer')).toBeTruthy()
    expect(screen.getByText('Experience')).toBeTruthy()
    expect(screen.getByText('Education')).toBeTruthy()
    expect(screen.getByText('BSc Computer Science')).toBeTruthy()
    expect(screen.getByText('React')).toBeTruthy()
    expect(screen.getByText('Led EKS migration')).toBeTruthy()
    expect(screen.getByText('AI enriched')).toBeTruthy()
    expect(screen.getByText('Nelson_Lamounier_Resume.pdf')).toBeTruthy()
  })

  it('scopes to entryIds when provided', async () => {
    renderModal({ entryIds: ['edu-1'] })
    expect(await screen.findByText('BSc Computer Science')).toBeTruthy()
    expect(screen.queryByText('Senior DevOps Engineer')).toBeNull()
  })

  it('renders the empty state when no entries exist', async () => {
    listMock.mockResolvedValue([])
    renderModal()
    expect(await screen.findByText('No entries extracted yet')).toBeTruthy()
  })

  it('shows the embeddings caveat in the footer', async () => {
    renderModal()
    expect(await screen.findByText(/knowledge-base embeddings created at import are unchanged/)).toBeTruthy()
  })
})

describe('CareerEntriesModal — edit and delete', () => {
  it('saves an edited experience with merged rawData and exits edit mode', async () => {
    updateMock.mockResolvedValue({ entry: ENTRIES[0] })
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Senior DevOps Engineer' }))

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'Staff Engineer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { data: { id: string; rawData: Record<string, unknown> } }
    expect(payload.data.id).toBe('exp-1')
    expect(payload.data.rawData['title']).toBe('Staff Engineer')
    expect(payload.data.rawData['highlights']).toEqual(['Led EKS migration']) // unmanaged-by-this-edit list preserved
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull())
  })

  it('cancel leaves the entry unchanged and calls no mutation', async () => {
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Senior DevOps Engineer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(updateMock).not.toHaveBeenCalled()
    expect(screen.getByText('Senior DevOps Engineer')).toBeTruthy()
  })

  it('deletes an entry only after confirmation', async () => {
    deleteMock.mockResolvedValue({ deleted: true })
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete BSc Computer Science' }))
    expect(deleteMock).not.toHaveBeenCalled() // confirm gate
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1))
    const payload = deleteMock.mock.calls[0][0] as { data: { id: string } }
    expect(payload.data.id).toBe('edu-1')
  })

  it('keeps the edit form open and surfaces an error toast when save fails', async () => {
    updateMock.mockRejectedValue(new Error('boom'))
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Senior DevOps Engineer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalledWith(expect.any(Error), 'save'))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
  })

  it('resets an in-progress edit when the modal closes and reopens', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <CareerEntriesModal open onClose={() => {}} />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Senior DevOps Engineer' }))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()

    rerender(
      <QueryClientProvider client={client}>
        <CareerEntriesModal open={false} onClose={() => {}} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.queryByText('Senior DevOps Engineer')).toBeNull())

    rerender(
      <QueryClientProvider client={client}>
        <CareerEntriesModal open onClose={() => {}} />
      </QueryClientProvider>,
    )

    await screen.findByText('Senior DevOps Engineer')
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })
})
