/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IntegrateRepoDialog } from '@/features/projects/components/index/IntegrateRepoDialog'
import type { ProjectSummary } from '@/features/projects/lib/types'

// useIntegrateRepo resolves with the regenerate run id; drive onSuccess synchronously.
const mutateMock = vi.fn((_vars: unknown, opts: { onSuccess: (res: unknown) => void }) => {
  opts.onSuccess({ regenerate: { pipelineRunId: 'run-9', projectId: 'proj-1' } })
})
vi.mock('@/features/projects/server/mutations', () => ({
  useIntegrateRepo: () => ({ mutate: mutateMock, isPending: false, isError: false, error: null, reset: vi.fn() }),
}))

const openCaseStudyMock = vi.fn()
vi.mock('@/lib/stores/case-study-progress-store', () => ({
  useCaseStudyProgressStore: (selector: (s: unknown) => unknown) =>
    selector({ openProgress: openCaseStudyMock }),
}))

const addNotificationMock = vi.fn()
vi.mock('@/lib/stores/pipeline-notifications-store', () => ({
  usePipelineNotificationsStore: (selector: (s: unknown) => unknown) =>
    selector({ addNotification: addNotificationMock }),
}))

const targets = [{ id: 'proj-1', name: 'Platform', repository_count: 2 }] as unknown as ProjectSummary[]
const repoDefaults = [{ id: 'repo-1', name: 'cdk-monitoring', repository_count: 1 }] as unknown as ProjectSummary[]

describe('IntegrateRepoDialog → case-study progress', () => {
  beforeEach(() => {
    mutateMock.mockClear()
    openCaseStudyMock.mockClear()
    addNotificationMock.mockClear()
  })

  it('opens the progress modal and registers a notification on add', () => {
    render(<IntegrateRepoDialog open onClose={vi.fn()} targets={targets} repoDefaults={repoDefaults} />)

    // Pick the repo (target is pre-seeded to targets[0]), then add.
    fireEvent.click(screen.getByText('cdk-monitoring'))
    fireEvent.click(screen.getByRole('button', { name: /Add to project/i }))

    expect(openCaseStudyMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj-1', projectName: 'Platform', pipelineRunId: 'run-9' }),
    )
    expect(addNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'case_study',
        slug: 'proj-1',
        label: 'Platform',
        status: 'running',
        pipelineRunId: 'run-9',
      }),
    )
  })
})
