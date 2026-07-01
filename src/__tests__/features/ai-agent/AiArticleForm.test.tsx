/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AiArticleForm } from '@/features/ai-agent/components/AiArticleForm'
import type { TopicCandidate } from '@/server/articles'

const CANDIDATE: TopicCandidate = {
  id: '11111111-1111-1111-1111-111111111111',
  githubRepoId: '987654321',
  repoFullName: 'nelson/ai-applications',
  title: 'Chunk-enrichment cost cascade cut per-repo cost from EUR5 to EUR0.30',
  problem: 'Per-chunk LLM enrichment cost EUR5 per repo.',
  angle: 'FinOps for AI pipelines',
  primaryKeyword: 'bedrock cost optimisation',
  verifiedMetrics: [{ label: 'cost per repo', value: '0.30', unit: 'EUR' }],
  skills: ['Cost Optimisation'],
}

const noop = vi.fn()

function renderForm(props: Partial<React.ComponentProps<typeof AiArticleForm>> = {}) {
  return render(
    <AiArticleForm
      draft={null}
      isDragOver={false}
      isPending={false}
      onDragOver={noop}
      onDragLeave={noop}
      onDrop={noop}
      onFileSelect={noop}
      onClearDraft={noop}
      onPublish={noop}
      {...props}
    />,
  )
}

describe('AiArticleForm — suggested topic dropdown', () => {
  it('hides the dropdown when there are no candidates', () => {
    renderForm({ candidates: [] })
    expect(screen.queryByLabelText(/start from a suggested topic/i)).toBeNull()
  })

  it('lists candidates and calls onSelectCandidate with the chosen one', async () => {
    const onSelectCandidate = vi.fn()
    renderForm({ candidates: [CANDIDATE], onSelectCandidate })

    const select = screen.getByLabelText(/start from a suggested topic/i)
    expect(select).toBeTruthy()
    await userEvent.selectOptions(select, CANDIDATE.id)

    expect(onSelectCandidate).toHaveBeenCalledTimes(1)
    expect(onSelectCandidate).toHaveBeenCalledWith(CANDIDATE)
  })

  it('reflects the selected candidate as the dropdown value', () => {
    renderForm({ candidates: [CANDIDATE], selectedCandidateId: CANDIDATE.id })
    const select = screen.getByLabelText(/start from a suggested topic/i) as HTMLSelectElement
    expect(select.value).toBe(CANDIDATE.id)
  })
})
