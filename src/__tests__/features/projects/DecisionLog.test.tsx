/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const patchDecisionMock = vi.fn()
const deleteDecisionMock = vi.fn()
const regenerateMock = vi.fn()

vi.mock('@/server/projects', () => ({
  listProjectsFn:     vi.fn(),
  getProjectDetailFn: vi.fn(),
  patchProjectFn:     vi.fn(),
  patchDecisionFn:    (args: unknown) => patchDecisionMock(args),
  deleteDecisionFn:   (args: unknown) => deleteDecisionMock(args),
  regenerateProjectFn: (args: unknown) => regenerateMock(args),
}))

import { DecisionLog } from '@/features/projects/components/detail/DecisionLog'
import type { ProjectDecision } from '@/features/projects/lib/types'

const PROJECT_ID = '11111111-1111-1111-1111-111111111111'

function makeDecision(overrides: Partial<ProjectDecision> = {}): ProjectDecision {
  return {
    id:                '22222222-2222-2222-2222-222222222222',
    title:             'Use Postgres',
    context:           'We need durable storage.',
    decision:          'Pick managed Postgres on RDS.',
    consequences:      'Operational simplicity at the cost of vendor lock-in.',
    confidence:        'high',
    is_user_confirmed: false,
    source_signals:    null,
    order_index:       0,
    ...overrides,
  }
}

function renderWithClient(items: ProjectDecision[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DecisionLog projectId={PROJECT_ID} items={items} />
    </QueryClientProvider>,
  )
}

describe('DecisionLog', () => {
  beforeEach(() => {
    patchDecisionMock.mockReset().mockResolvedValue({ updated: 1 })
    deleteDecisionMock.mockReset().mockResolvedValue({ deleted: 1 })
  })

  it('renders empty hint when items is empty', () => {
    renderWithClient([])
    expect(screen.getByText(/no decisions extracted yet/i)).toBeTruthy()
  })

  it('renders the Confirm button only when not user-confirmed', () => {
    renderWithClient([
      makeDecision({ id: 'a', title: 'A', is_user_confirmed: false }),
      makeDecision({ id: 'b', title: 'B', is_user_confirmed: true }),
    ])
    expect(screen.getAllByRole('button', { name: 'Confirm' })).toHaveLength(1)
  })

  it('calls patchDecisionFn with is_user_confirmed=true when Confirm is clicked', async () => {
    renderWithClient([makeDecision()])
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(patchDecisionMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId:  PROJECT_ID,
        decisionId: '22222222-2222-2222-2222-222222222222',
        patch:      { is_user_confirmed: true },
      }),
    })
  })

  it('calls deleteDecisionFn when the trash button is clicked and confirmed', async () => {
    // happy-dom does not implement window.confirm, so stub the global rather
    // than spy on it (vitest 4's vi.spyOn requires an existing function target).
    vi.stubGlobal('confirm', vi.fn(() => true))
    try {
      renderWithClient([makeDecision()])
      await userEvent.click(screen.getByRole('button', { name: /delete decision/i }))
      expect(deleteDecisionMock).toHaveBeenCalledWith({
        data: { projectId: PROJECT_ID, decisionId: '22222222-2222-2222-2222-222222222222' },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
