/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...(rest as Record<string, string>)}>{children}</a>
  ),
}))

const statusMutate = vi.fn()
vi.mock('@/hooks/use-admin-applications', () => ({
  useApplicationStatus: () => ({ mutate: statusMutate, isPending: false }),
}))

// Stub patchStageFn so useStageDraft's debounced PATCH doesn't fail in tests
vi.mock('@/server/pipelines', () => ({
  patchStageFn: vi.fn().mockResolvedValue({}),
  triggerCoachFn: vi.fn().mockResolvedValue({}),
}))

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

function renderWithQuery(ui: React.ReactElement) {
  return render(ui, { wrapper: createWrapper() })
}

import { EvidenceIndicator } from '@/features/applications/stages/components/EvidenceIndicator'
import { StoryCard } from '@/features/applications/stages/components/StoryCard'
import { StageProgressBar } from '@/features/applications/stages/components/StageProgressBar'
import { EvidenceCard } from '@/features/applications/stages/components/EvidenceCard'
import { TechnicalWorkspace } from '@/features/applications/stages/workspaces/TechnicalWorkspace'
import { WorkspaceShell } from '@/features/applications/stages/components/workspace-shell'
import { PhoneScreenWorkspace } from '@/features/applications/stages/workspaces/PhoneScreenWorkspace'
import { SystemDesignWorkspace } from '@/features/applications/stages/workspaces/SystemDesignWorkspace'
import { TradeoffBadge } from '@/features/applications/stages/components/TradeoffBadge'
import { StageWorkspaceSkeleton } from '@/features/applications/stages/components/StageWorkspaceSkeleton'
import { BehaviouralWorkspace } from '@/features/applications/stages/workspaces/BehaviouralWorkspace'
import { BarRaiserWorkspace } from '@/features/applications/stages/workspaces/BarRaiserWorkspace'
import { FinalWorkspace } from '@/features/applications/stages/workspaces/FinalWorkspace'
import { useStoryBank } from '@/features/applications/stages/hooks/useStoryBank'
import type { StarStory, EvidenceTopic } from '@/features/applications/stages/types/workspace'
import type { ApplicationDetail, StageState } from '@/lib/types/applications.types'

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

function makeStageState(overrides: Partial<StageState> = {}): StageState {
  return {
    stage_status: 'upcoming',
    prep_status: 'none',
    scheduled_at: null,
    user_state: {},
    coach_run_id: null,
    ...overrides,
  }
}

describe('StageProgressBar', () => {
  it('renders all seven stages and fires onSelect', () => {
    const onSelect = vi.fn()
    render(<StageProgressBar current="technical" active="technical" onSelect={onSelect} />)
    expect(screen.getAllByRole('tab')).toHaveLength(7)
    fireEvent.click(screen.getByRole('tab', { name: /Behavioural/i }))
    expect(onSelect).toHaveBeenCalledWith('behavioural')
  })

  it('without stages prop: falls back to index math — stages before current show completed aria', () => {
    const onSelect = vi.fn()
    render(<StageProgressBar current="technical" active="technical" onSelect={onSelect} />)
    // phone-screen is before technical → completed (check icon present within that button)
    const phoneTab = screen.getByRole('tab', { name: /Phone Screen/i })
    expect(phoneTab.querySelector('svg')).toBeTruthy() // Check icon rendered for completed
  })

  it('with stages given: a completed stage renders completed styling (check icon)', () => {
    const onSelect = vi.fn()
    const stages: Record<string, StageState> = {
      'phone-screen': makeStageState({ stage_status: 'completed', prep_status: 'ready' }),
    }
    render(<StageProgressBar current="applied" active="applied" onSelect={onSelect} stages={stages} />)
    // phone-screen is marked completed via stages — check icon should be present
    const phoneTab = screen.getByRole('tab', { name: /Phone Screen/i })
    expect(phoneTab.querySelector('svg')).toBeTruthy()
  })

  it('with stages given: a not_applicable stage renders with dashed-border dot and aria label', () => {
    const onSelect = vi.fn()
    const stages: Record<string, StageState> = {
      'bar-raiser': makeStageState({ stage_status: 'not_applicable', prep_status: 'none' }),
    }
    render(<StageProgressBar current="behavioural" active="behavioural" onSelect={onSelect} stages={stages} />)
    const barTab = screen.getByRole('tab', { name: /bar raiser.*not applicable/i })
    expect(barTab).toBeTruthy()
  })

  it('with stages given: a queued stage shows the pulsing generating affordance', () => {
    const onSelect = vi.fn()
    const stages: Record<string, StageState> = {
      'phone-screen': makeStageState({ stage_status: 'current', prep_status: 'queued' }),
    }
    render(<StageProgressBar current="phone-screen" active="phone-screen" onSelect={onSelect} stages={stages} />)
    const phoneTab = screen.getByRole('tab', { name: /phone screen.*generating/i })
    expect(phoneTab).toBeTruthy()
    // pulsing dot has animate-pulse class
    expect(phoneTab.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('with stages given: stages without a row fall back to index math', () => {
    const onSelect = vi.fn()
    // Only provide 'phone-screen'; 'technical' has no row → should fall back to index math
    const stages: Record<string, StageState> = {
      'phone-screen': makeStageState({ stage_status: 'completed', prep_status: 'ready' }),
    }
    // current = technical; technical has no stages row → fallback makes it 'current'
    render(<StageProgressBar current="technical" active="technical" onSelect={onSelect} stages={stages} />)
    // technical tab should have aria-current="step" from the fallback
    const techTab = screen.getByRole('tab', { name: /Technical/i })
    expect(techTab.getAttribute('aria-current')).toBe('step')
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

  // Master–detail: the workspace renders SummaryGroups into the shell's left
  // column; per-row detail (file:line, rationale, resources) lives in the rail
  // and only appears after the row is clicked.
  function renderTech(d: ApplicationDetail) {
    return renderWithQuery(
      <WorkspaceShell detail={d} activeStage="technical">
        <TechnicalWorkspace detail={d} />
      </WorkspaceShell>,
    )
  }

  /** Click the summary row with the given accessible label to reveal its detail. */
  function openRow(label: RegExp | string) {
    fireEvent.click(screen.getByText(label).closest('button') as HTMLElement)
  }

  it('renders evidence topics from research and shows external practice links', () => {
    renderTech(detail)
    expect(screen.getByText('Kubernetes')).toBeTruthy()
    expect(screen.getByText('Strong evidence')).toBeTruthy()
    // Practice section now has external links, no in-product modal
    expect(screen.getByRole('link', { name: /Practice on LeetCode/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Practice on NeetCode/i })).toBeTruthy()
  })

  it('renders a technicalPrepChecklist item with suggestedResources without crashing (field-name contract)', () => {
    const withChecklist = {
      ...detail,
      coaching: {
        technical: {
          topics: {
            stageDescription: 'Technical round',
            technicalQuestions: [],
            behaviouralQuestions: [],
            difficultQuestions: [],
            technicalPrepChecklist: [
              { topic: 'Consistent hashing', priority: 'high', rationale: 'Sharding strategy', suggestedResources: ['DDIA ch.6'] },
            ],
            questionsToAsk: [],
            coachingNotes: '',
          },
        },
      },
    } as unknown as ApplicationDetail
    renderTech(withChecklist)
    expect(screen.getByText('Consistent hashing')).toBeTruthy()
    openRow('Consistent hashing')
    expect(screen.getByText(/DDIA ch\.6/)).toBeTruthy()
  })

  it('does not render Section B for system-design round type', () => {
    renderTech({ ...detail, technicalRoundType: 'system-design' })
    expect(screen.queryByText('DSA / Coding')).toBeNull()
  })

  it('does not render Section B for take-home round type', () => {
    renderTech({ ...detail, technicalRoundType: 'take-home' })
    expect(screen.queryByText('DSA / Coding')).toBeNull()
  })

  it('does not render Section B for a new DevOps/AI round type (architecture-review)', () => {
    renderTech({ ...detail, technicalRoundType: 'architecture-review' })
    expect(screen.queryByText('DSA / Coding')).toBeNull()
  })

  it('renders Section B when technicalRoundType is undefined (safe-mode: default to dsa)', () => {
    renderTech(detail)
    expect(screen.getByText('DSA / Coding')).toBeTruthy()
  })

  it('renders Section B with DSA banner for dsa round type', () => {
    renderTech({ ...detail, technicalRoundType: 'dsa' })
    expect(screen.getByText('DSA / Coding')).toBeTruthy()
    expect(screen.getByText(/calibrate which DSA topics matter/)).toBeTruthy()
  })

  it('renders Section B for mixed round type', () => {
    renderTech({ ...detail, technicalRoundType: 'mixed' })
    expect(screen.getByText('DSA / Coding')).toBeTruthy()
  })

  it('renders calibrated DSA topics for dsa round type', () => {
    const detailWithDsa = {
      ...detail,
      technicalRoundType: 'dsa' as const,
      research: {
        ...detail.research!,
        dsaTopicCalibration: {
          likelyTopics: [
            {
              canonicalName: 'binary-search',
              displayName: 'Binary Search',
              confidence: 0.8,
              rationale: 'JD references efficient lookup at scale.',
              jdEvidenceQuote: 'efficient search algorithms',
            },
            {
              canonicalName: 'graph-bfs',
              displayName: 'Graph BFS/DFS',
              confidence: 0.4,
              rationale: 'Graph traversal patterns mentioned.',
              jdEvidenceQuote: 'graph-based data',
            },
          ],
          honestyNote: 'Confidence is inferred from JD signals, not validated against test data.',
        },
      },
    }
    renderTech(detailWithDsa)
    expect(screen.getByText('Binary Search')).toBeTruthy()
    expect(screen.getByText('High relevance')).toBeTruthy()
    expect(screen.getByText('Graph BFS/DFS')).toBeTruthy()
    expect(screen.getByText('Medium relevance')).toBeTruthy()
    // Honest "practice externally" pointer present in the row's detail
    openRow('Binary Search')
    expect(screen.getAllByText(/Not assessed from your code/).length).toBeGreaterThan(0)
    // NO fake "your work shows this" text
    expect(screen.queryByText(/your work shows/i)).toBeNull()
    // Honesty footnote rendered inline
    expect(screen.getByText(/Confidence is inferred from JD signals/)).toBeTruthy()
  })

  it('shows "no DSA round" message when likelyTopics is empty for dsa round type', () => {
    const detailWithEmptyDsa = {
      ...detail,
      technicalRoundType: 'dsa' as const,
      research: {
        ...detail.research!,
        dsaTopicCalibration: {
          likelyTopics: [],
          honestyNote: '',
        },
      },
    }
    renderTech(detailWithEmptyDsa)
    expect(screen.getByText('DSA / Coding')).toBeTruthy()
    expect(screen.getByText(/This role likely has no DSA round/)).toBeTruthy()
  })

  it('shows "no DSA round" message when no calibration data present for dsa round type', () => {
    renderTech({ ...detail, technicalRoundType: 'dsa' })
    expect(screen.getByText(/This role likely has no DSA round/)).toBeTruthy()
  })

  it('shows practical coding note for practical round type', () => {
    renderTech({ ...detail, technicalRoundType: 'practical' })
    expect(screen.getByText(/favours practical coding over algorithm puzzles/)).toBeTruthy()
  })

  it('never renders a green check or "your work shows" state in DSA section', () => {
    const detailWithDsa = {
      ...detail,
      technicalRoundType: 'dsa' as const,
      research: {
        ...detail.research!,
        dsaTopicCalibration: {
          likelyTopics: [
            {
              canonicalName: 'arrays',
              displayName: 'Arrays & Hashing',
              confidence: 0.9,
              rationale: 'Core DS.',
              jdEvidenceQuote: 'data structures',
            },
          ],
          honestyNote: '',
        },
      },
    }
    renderTech(detailWithDsa)
    expect(screen.queryByText('🟢')).toBeNull()
    expect(screen.queryByText(/your work shows/i)).toBeNull()
  })

  it('renders DevOps/Infrastructure section with Tier-1 copy + file:line when devopsEvidence present', () => {
    const devopsDetail = {
      ...detail,
      devopsEvidence: [
        {
          canonicalTopicName: 'devops_iac',
          displayName: 'Infrastructure as Code',
          topicGroup: 'iac',
          artifactCount: 2,
          samples: [{ repo: 'o/r', file: 'main.tf', line: 3, rawName: 'terraform' }],
        },
      ],
    } satisfies ApplicationDetail
    renderTech(devopsDetail)
    expect(screen.getByText(/DevOps \/ Infrastructure/i)).toBeTruthy()
    expect(screen.getByText(/Infrastructure as Code/)).toBeTruthy()
    openRow(/Infrastructure as Code/)
    expect(screen.getByText(/o\/r\/main\.tf:3/)).toBeTruthy()
    // Tier-1: must NOT claim competence
    expect(screen.queryByText(/expert|mastered|you know/i)).toBeNull()
  })

  it('hides DevOps/Infrastructure section when devopsEvidence is empty', () => {
    const emptyDetail = { ...detail, devopsEvidence: [] } satisfies ApplicationDetail
    renderTech(emptyDetail)
    expect(screen.queryByText(/DevOps \/ Infrastructure/i)).toBeNull()
  })

  it('hides DevOps/Infrastructure section when devopsEvidence is undefined', () => {
    renderTech(detail)
    expect(screen.queryByText(/DevOps \/ Infrastructure/i)).toBeNull()
  })

  // ── DSA real-work badges (v1.5) ──────────────────────────────────────────

  const dsaBaseDetail = {
    ...detail,
    technicalRoundType: 'dsa' as const,
    research: {
      ...detail.research!,
      dsaTopicCalibration: {
        likelyTopics: [
          {
            canonicalName: 'graph-bfs',
            displayName: 'Graph BFS/DFS',
            confidence: 0.8,
            rationale: 'Graph traversal patterns mentioned.',
            jdEvidenceQuote: 'graph-based data',
          },
          {
            canonicalName: 'binary-search',
            displayName: 'Binary Search',
            confidence: 0.5,
            rationale: 'Efficient lookup at scale.',
            jdEvidenceQuote: 'efficient search',
          },
        ],
        honestyNote: 'Confidence inferred from JD signals.',
      },
    },
  }

  it('narrow-coverage banner is always present when Section B renders', () => {
    renderTech(dsaBaseDetail)
    expect(screen.getByText(/Real-work detection covers a limited pattern set/)).toBeTruthy()
  })

  it('narrow-coverage banner is present even when dsaRealWork is undefined', () => {
    renderTech({ ...dsaBaseDetail, dsaRealWork: undefined })
    expect(screen.getByText(/Real-work detection covers a limited pattern set/)).toBeTruthy()
  })

  it('calibrated topic WITH matching dsaRealWork renders green treatment with repo/file:line', () => {
    const detailWithEvidence = {
      ...dsaBaseDetail,
      dsaRealWork: [
        {
          canonicalName: 'graph-bfs',
          matchCount: 2,
          topConfidence: 0.78,
          signals: ['networkx_import'],
          samples: [{ repo: 'user/graph-utils', file: 'src/graph.py', line: 42 }],
        },
      ],
    }
    renderTech(detailWithEvidence)
    openRow('Graph BFS/DFS')
    // Green treatment: sample repo/file:line rendered
    expect(screen.getByText(/user\/graph-utils\/src\/graph\.py:42/)).toBeTruthy()
    // Signal phrase rendered
    expect(screen.getByText(/imports networkx \(graph algorithms\)/)).toBeTruthy()
    // matchCount copy
    expect(screen.getByText(/in 2 place/)).toBeTruthy()
    // Import-grounded caveat
    expect(screen.getByText(/import\/type-grounded/)).toBeTruthy()
  })

  it('calibrated topic WITHOUT evidence still renders red "practice externally" treatment', () => {
    const detailWithEvidence = {
      ...dsaBaseDetail,
      dsaRealWork: [
        {
          canonicalName: 'graph-bfs',
          matchCount: 1,
          topConfidence: 0.75,
          signals: ['networkx_import'],
          samples: [{ repo: 'user/graph-utils', file: 'src/graph.py', line: 42 }],
        },
      ],
    }
    renderTech(detailWithEvidence)
    // binary-search is calibrated but has no evidence → red treatment intact
    openRow('Binary Search')
    expect(screen.getByText(/Not assessed from your code/)).toBeTruthy()
    expect(screen.getAllByText(/practice on/i).length).toBeGreaterThan(0)
  })

  it('dsaRealWork topic NOT in likelyTopics appears in "Other real-work DSA signals" block', () => {
    const detailWithExtra = {
      ...dsaBaseDetail,
      dsaRealWork: [
        {
          canonicalName: 'heap',
          matchCount: 3,
          topConfidence: 0.72,
          signals: ['heap'],
          samples: [{ repo: 'user/scheduler', file: 'lib/pq.py', line: 10 }],
        },
      ],
    }
    renderTech(detailWithExtra)
    expect(screen.getByText('Other real-work DSA signals')).toBeTruthy()
    // The uncalibrated evidence topic shows up in the secondary block (inline)
    expect(screen.getByText(/uses a heap \/ priority queue/)).toBeTruthy()
  })

  it('"Other real-work DSA signals" block is absent when all evidence topics are calibrated', () => {
    const detailAllCalibrated = {
      ...dsaBaseDetail,
      dsaRealWork: [
        {
          canonicalName: 'graph-bfs',
          matchCount: 1,
          topConfidence: 0.75,
          signals: ['networkx_import'],
          samples: [{ repo: 'user/graph-utils', file: 'src/graph.py', line: 42 }],
        },
      ],
    }
    renderTech(detailAllCalibrated)
    expect(screen.queryByText('Other real-work DSA signals')).toBeNull()
  })

  it('no green sample text when dsaRealWork is empty array', () => {
    renderTech({ ...dsaBaseDetail, dsaRealWork: [] })
    // No import-grounded caveat (would appear only in a green detail)
    expect(screen.queryByText(/import\/type-grounded/)).toBeNull()
    // All calibrated topics fall back to red treatment — open both rows
    openRow('Graph BFS/DFS')
    openRow('Binary Search')
    expect(screen.getAllByText(/Not assessed from your code/).length).toBeGreaterThan(0)
  })

  it('green badge strictly requires evidence lookup hit — calibration alone never goes green', () => {
    // No dsaRealWork at all — open every calibrated row, none should go green
    renderTech(dsaBaseDetail)
    openRow('Graph BFS/DFS')
    openRow('Binary Search')
    // No green sample text
    expect(screen.queryByText(/import\/type-grounded/)).toBeNull()
    // No GitHub link for samples
    expect(screen.queryByText(/user\//)).toBeNull()
  })

  // ── Pillar classifier chip + markers (S2) ─────────────────────────────────

  function makeDetail(overrides: { research?: Partial<typeof detail.research> & Record<string, unknown> }): ApplicationDetail {
    return {
      ...detail,
      research: overrides.research
        ? { ...detail.research!, ...(overrides.research as typeof detail.research) }
        : detail.research,
    } as ApplicationDetail
  }

  it('renders the Role focus chip with primary + secondary labels for a non-general pillar', () => {
    const d = makeDetail({ research: { pillarClassification: {
      primaryPillar: 'devops-sre-platform', secondaryPillars: ['ai-engineering' as const],
      confidence: 0.8, jdEvidenceTokens: ['on-call', 'Kubernetes'], classificationNote: 'inferred from JD',
    } } })
    renderTech(d)
    expect(screen.getAllByText(/Role focus/i).length).toBeGreaterThan(0)
    expect(screen.getByText('DevOps / Platform')).toBeTruthy()
    expect(screen.getByText('AI Engineering')).toBeTruthy()
  })

  it('shows NO Role focus chip for swe-general', () => {
    const d = makeDetail({ research: { pillarClassification: {
      primaryPillar: 'swe-general', secondaryPillars: [] as const,
      confidence: 0.5, jdEvidenceTokens: [], classificationNote: 'general',
    } } })
    renderTech(d)
    expect(screen.queryByText(/Role focus/i)).toBeNull()
  })

  it('shows NO Role focus chip when pillarClassification absent', () => {
    renderTech(makeDetail({ research: {} }))
    expect(screen.queryByText(/Role focus/i)).toBeNull()
  })

  it('Phone Screen surfaces talking points, questions, and an editable comp target', () => {
    renderWithQuery(
      <WorkspaceShell detail={detail} activeStage="phone-screen">
        <PhoneScreenWorkspace detail={detail} />
      </WorkspaceShell>,
    )
    expect(screen.getByText('Your talking points')).toBeTruthy()
    expect(screen.getByText('Kubernetes')).toBeTruthy() // verified match → talking point
    expect(screen.getByText(/What does success look like/)).toBeTruthy() // default question
    const comp = screen.getByLabelText('Your target')
    fireEvent.change(comp, { target: { value: '£100k base' } })
    expect(screen.getByText(/£100k base/)).toBeTruthy() // reflected in suggested response
  })

  function renderSystemDesign(d: ApplicationDetail) {
    return renderWithQuery(
      <WorkspaceShell detail={d} activeStage="system-design">
        <SystemDesignWorkspace detail={d} />
      </WorkspaceShell>,
    )
  }

  it('System Design shows question patterns and expands a framework step', () => {
    renderSystemDesign(detail)
    // Group title + row label both render the patterns label in the summary column
    expect(screen.getAllByText('Common question patterns').length).toBeGreaterThan(0)
    // Framework steps live behind the framework row's detail (rail) — collapsed until opened
    expect(screen.queryByText(/functional vs non-functional/)).toBeNull()
    // Open the framework row → its detail (the six-step CollapsibleSections) renders in the rail.
    // The label appears twice (group title + row label); the row is the one inside a SummaryRow button.
    const frameworkRow = screen
      .getAllByText('Framework to have ready')
      .map(el => el.closest('button'))
      .find((btn): btn is HTMLButtonElement => btn?.getAttribute('aria-controls') === 'detail-rail-panel')
    fireEvent.click(frameworkRow as HTMLElement)
    // Then expand the first framework step
    fireEvent.click(screen.getByRole('button', { name: /Requirements & scope/i }))
    expect(screen.getByText(/functional vs non-functional/)).toBeTruthy()
  })

  const systemTour = {
    area: 'Async ingestion pipeline',
    context: 'High-throughput event processing for the analytics lane.',
    keyDecisions: [{ decision: 'Use SQS for buffering', rationale: 'Decouples producers from consumers' }],
    tradeoffs: [{ tension: 'cost vs latency', chosenPath: 'micro-batching', cost: 'higher p99 latency' }],
    systemMap: { diagramFormat: 'mermaid' as const, nodes: [{ id: 'a', label: 'Producer' }], edges: [{ from: 'a', to: 'b' }] },
    outcomes: ['Cut spend by 40%'],
    whatIdChange: ['Add a dead-letter queue alarm'],
  }

  it('System Design renders a tour walkthrough (area/decision) when systemTours present + round is system-design', () => {
    renderSystemDesign({ ...detail, technicalRoundType: 'system-design', systemTours: [systemTour] })
    // Row label is the tour area
    expect(screen.getByText('Async ingestion pipeline')).toBeTruthy()
    // Decision lives in the row's detail (rail) — appears after clicking the row
    fireEvent.click(screen.getByText('Async ingestion pipeline').closest('button') as HTMLElement)
    expect(screen.getByText('Use SQS for buffering')).toBeTruthy()
    // empty-state fallback must NOT be shown when tours render
    expect(screen.queryByText('Open your projects')).toBeNull()
  })

  it('System Design also renders the tour for architecture-review rounds', () => {
    renderSystemDesign({ ...detail, technicalRoundType: 'architecture-review', systemTours: [systemTour] })
    expect(screen.getByText('Async ingestion pipeline')).toBeTruthy()
  })

  it('System Design shows the empty-state fallback when systemTours is empty', () => {
    renderSystemDesign({ ...detail, technicalRoundType: 'system-design', systemTours: [] })
    expect(screen.getByText('Open your projects')).toBeTruthy()
    expect(screen.queryByText('Async ingestion pipeline')).toBeNull()
  })
})

describe('TradeoffBadge', () => {
  it('renders its label', () => {
    render(<TradeoffBadge label="RDS+pgvector over a dedicated vector DB" />)
    expect(screen.getByText('RDS+pgvector over a dedicated vector DB')).toBeTruthy()
  })
})

describe('StageWorkspaceSkeleton', () => {
  it('exposes an aria-busy loading region (skeleton, not a spinner)', () => {
    const { container } = render(<StageWorkspaceSkeleton />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
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
    renderWithQuery(<BehaviouralWorkspace detail={detail} />)
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
    renderWithQuery(<BarRaiserWorkspace detail={detail} />)
    expect(screen.getByText('Company values matrix')).toBeTruthy()
    expect(screen.getAllByText('Customer Obsession').length).toBeGreaterThan(0)
    // empty bank → all principles uncovered → draft CTAs present
    expect(screen.getAllByRole('button', { name: /Draft a story from this evidence/i }).length).toBeGreaterThan(0)
  })
})

describe('FinalWorkspace', () => {
  const detail = {
    slug: 'final-acme', targetCompany: 'Acme', targetRole: 'Staff', status: 'offer-received',
    interviewStage: 'final', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    context: { pipelineId: 'p', cumulativeInputTokens: 0, cumulativeOutputTokens: 0, cumulativeThinkingTokens: 0, cumulativeCostUsd: 0 },
    research: null, analysis: null, interviewPrep: null,
  } satisfies ApplicationDetail

  it('computes a counter from base and confirms a decision action', () => {
    window.localStorage.clear()
    render(<FinalWorkspace detail={detail} />)
    expect(screen.getByText('Fit 50%')).toBeTruthy() // default factors 5/5
    fireEvent.change(screen.getByLabelText('Base'), { target: { value: '100,000' } })
    expect(screen.getByText('110,000')).toBeTruthy() // suggested counter
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(screen.getByText('Decline this offer?')).toBeTruthy()
    const confirm = screen.getAllByRole('button', { name: 'Decline' }).find(b => b.className.includes('bg-red-600'))
    fireEvent.click(confirm as HTMLElement)
    expect(statusMutate).toHaveBeenCalledWith({ slug: 'final-acme', status: 'rejected' })
  })
})
