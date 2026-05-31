/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'

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
import { PhoneScreenWorkspace } from '@/features/applications/stages/workspaces/PhoneScreenWorkspace'
import { SystemDesignWorkspace } from '@/features/applications/stages/workspaces/SystemDesignWorkspace'
import { TradeoffBadge } from '@/features/applications/stages/components/TradeoffBadge'
import { BehaviouralWorkspace } from '@/features/applications/stages/workspaces/BehaviouralWorkspace'
import { BarRaiserWorkspace } from '@/features/applications/stages/workspaces/BarRaiserWorkspace'
import { useStoryBank } from '@/features/applications/stages/hooks/useStoryBank'
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

  it('Phone Screen surfaces talking points, questions, and an editable comp target', () => {
    render(<PhoneScreenWorkspace detail={detail} />)
    expect(screen.getByText('Your talking points')).toBeTruthy()
    expect(screen.getByText('Kubernetes')).toBeTruthy() // verified match → talking point
    expect(screen.getByText(/What does success look like/)).toBeTruthy() // default question
    const comp = screen.getByLabelText('Your target')
    fireEvent.change(comp, { target: { value: '£100k base' } })
    expect(screen.getByText(/£100k base/)).toBeTruthy() // reflected in suggested response
  })

  it('System Design shows question patterns and expands a framework step', () => {
    render(<SystemDesignWorkspace detail={detail} />)
    expect(screen.getByText('Common question patterns')).toBeTruthy()
    expect(screen.queryByText(/functional vs non-functional/)).toBeNull() // collapsed
    fireEvent.click(screen.getByRole('button', { name: /Requirements & scope/i }))
    expect(screen.getByText(/functional vs non-functional/)).toBeTruthy()
  })
})

describe('TradeoffBadge', () => {
  it('renders its label', () => {
    render(<TradeoffBadge label="RDS+pgvector over a dedicated vector DB" />)
    expect(screen.getByText('RDS+pgvector over a dedicated vector DB')).toBeTruthy()
  })
})

describe('useStoryBank', () => {
  it('adds, updates, and removes stories (persisted by slug)', () => {
    window.localStorage.clear()
    const { result } = renderHook(() => useStoryBank('beh-test'))
    expect(result.current.stories).toHaveLength(0)

    act(() => result.current.addStory({ title: 'Outage', situation: 's', task: 't', action: 'a', result: 'r', themes: ['Leadership'] }))
    expect(result.current.stories).toHaveLength(1)
    const id = result.current.stories[0].id

    act(() => result.current.updateStory(id, { title: 'Major outage', situation: 's', task: 't', action: 'a', result: 'r', themes: ['Leadership', 'Impact'] }))
    expect(result.current.stories[0].title).toBe('Major outage')

    act(() => result.current.removeStory(id))
    expect(result.current.stories).toHaveLength(0)
  })
})

describe('BehaviouralWorkspace', () => {
  const detail = {
    slug: 'beh-acme', targetCompany: 'Acme', targetRole: 'SRE', status: 'interviewing',
    interviewStage: 'behavioural', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    context: { pipelineId: 'p', cumulativeInputTokens: 0, cumulativeOutputTokens: 0, cumulativeThinkingTokens: 0, cumulativeCostUsd: 0 },
    research: null, analysis: null, interviewPrep: null,
  } satisfies ApplicationDetail

  it('shows empty bank, gaps for typical questions, and opens the add-story form', () => {
    window.localStorage.clear()
    render(<BehaviouralWorkspace detail={detail} />)
    expect(screen.getByText(/story bank is empty/i)).toBeTruthy()
    expect(screen.getAllByText('Gap — consider drafting').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Add story/i }))
    expect(screen.getByText('Add a story')).toBeTruthy()
  })
})

describe('BarRaiserWorkspace', () => {
  const detail = {
    slug: 'br-acme', targetCompany: 'Acme', targetRole: 'SDE', status: 'interviewing',
    interviewStage: 'bar-raiser', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    context: { pipelineId: 'p', cumulativeInputTokens: 0, cumulativeOutputTokens: 0, cumulativeThinkingTokens: 0, cumulativeCostUsd: 0 },
    research: null, analysis: null, interviewPrep: null,
  } satisfies ApplicationDetail

  it('renders the values matrix and a draft CTA for uncovered principles', () => {
    window.localStorage.clear()
    render(<BarRaiserWorkspace detail={detail} />)
    expect(screen.getByText('Company values matrix')).toBeTruthy()
    expect(screen.getAllByText('Customer Obsession').length).toBeGreaterThan(0)
    // empty bank → all principles uncovered → draft CTAs present
    expect(screen.getAllByRole('button', { name: /Draft a story from this evidence/i }).length).toBeGreaterThan(0)
  })
})
