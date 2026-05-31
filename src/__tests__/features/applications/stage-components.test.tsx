/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...(rest as Record<string, string>)}>{children}</a>
  ),
}))

import { EvidenceIndicator } from '@/features/applications/stages/components/EvidenceIndicator'
import { StoryCard } from '@/features/applications/stages/components/StoryCard'
import { StageProgressBar } from '@/features/applications/stages/components/StageProgressBar'
import { EvidenceCard } from '@/features/applications/stages/components/EvidenceCard'
import { TechnicalWorkspace } from '@/features/applications/stages/workspaces/TechnicalWorkspace'
import type { StarStory, EvidenceTopic } from '@/features/applications/stages/types/workspace'
import type { ApplicationDetail } from '@/lib/types/applications.types'

describe('EvidenceIndicator', () => {
  it('renders a textual label, never colour-only', () => {
    render(<EvidenceIndicator strength="none" />)
    expect(screen.getByText('Gap')).toBeTruthy()
  })

  it('labels each strength distinctly', () => {
    const { rerender } = render(<EvidenceIndicator strength="strong" />)
    expect(screen.getByText('Strong evidence')).toBeTruthy()
    rerender(<EvidenceIndicator strength="moderate" />)
    expect(screen.getByText('Some evidence')).toBeTruthy()
  })
})

describe('EvidenceCard', () => {
  const topic: EvidenceTopic = {
    id: 't1',
    title: 'Distributed systems',
    strength: 'none',
    summary: 'Limited direct evidence.',
    projectRefs: [],
    beHonest: 'Acknowledge the gap and show how you would close it.',
  }

  it('shows be-honest guidance for gap topics', () => {
    render(<EvidenceCard topic={topic} />)
    expect(screen.getByText('Distributed systems')).toBeTruthy()
    expect(screen.getByText(/Acknowledge the gap/)).toBeTruthy()
  })
})

describe('StoryCard', () => {
  const story: StarStory = {
    id: 's1',
    title: 'Led incident response',
    situation: 'Prod outage',
    task: 'Restore service',
    action: 'Coordinated rollback',
    result: 'Recovered in 20m',
    themes: ['Leadership', 'Impact'],
  }

  it('renders title and theme chips, expands STAR on click', () => {
    render(<StoryCard story={story} />)
    expect(screen.getByText('Led incident response')).toBeTruthy()
    expect(screen.getByText('Leadership')).toBeTruthy()
    // collapsed: STAR body hidden
    expect(screen.queryByText('Prod outage')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /expand story/i }))
    expect(screen.getByText('Prod outage')).toBeTruthy()
  })
})

describe('StageProgressBar', () => {
  it('renders all seven stages and fires onSelect', () => {
    const onSelect = vi.fn()
    render(<StageProgressBar current="technical" active="technical" onSelect={onSelect} />)
    expect(screen.getAllByRole('tab')).toHaveLength(7)
    fireEvent.click(screen.getByRole('tab', { name: /Behavioural/i }))
    expect(onSelect).toHaveBeenCalledWith('behavioural')
  })
})

describe('TechnicalWorkspace', () => {
  const detail = {
    slug: 'acme-sre',
    targetCompany: 'Acme',
    targetRole: 'SRE',
    status: 'interviewing',
    interviewStage: 'technical',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    context: { pipelineId: 'p', cumulativeInputTokens: 0, cumulativeOutputTokens: 0, cumulativeThinkingTokens: 0, cumulativeCostUsd: 0 },
    research: {
      fitSummary: '',
      fitRating: 'STRONG_FIT',
      verifiedMatches: [{ skill: 'Kubernetes', sourceCitation: 'repo X', depthBadge: 'deep', recency: '2025' }],
      partialMatches: [],
      gaps: [],
      experienceSignals: { yearsExpected: '5', domain: 'infra', leadership: 'IC', scale: 'mid' },
      technologyInventory: { languages: [], frameworks: [], infrastructure: [], tools: [], methodologies: [] },
    },
    analysis: null,
    interviewPrep: null,
  } satisfies ApplicationDetail

  it('renders evidence topics from research and opens the practice modal', () => {
    render(<TechnicalWorkspace detail={detail} />)
    expect(screen.getByText('Kubernetes')).toBeTruthy()
    expect(screen.getByText('Strong evidence')).toBeTruthy()
    expect(screen.queryByText(/Coming soon/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Generate a practice question/i }))
    expect(screen.getByText(/Coming soon/)).toBeTruthy()
  })
})
