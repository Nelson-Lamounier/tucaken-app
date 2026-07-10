/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageGlancePanel } from '@/features/applications/components/StageGlancePanel'
import type { ApplicationDetail } from '@/lib/types/applications.types'

const atsCheck = {
  machineReadable: true,
  standardSectionsDetected: ['Experience', 'Skills'],
  contactDetected: { name: 'Test User', email: 'test@example.com' },
  parseBreakers: [],
  jdKeywordCoverage: [
    { term: 'react', present: true, grounded: true },
    { term: 'kubernetes', present: false, grounded: false },
  ],
  status: 'passed',
  passed: true,
  issues: [],
}

const jdExtraction = {
  requiredSkills: ['React', 'TypeScript'],
  preferredSkills: ['Kubernetes'],
  tools: ['Vite'],
  concepts: ['SSR'],
  responsibilities: ['Build UI'],
  domain: 'web',
  seniority: 'senior',
  retrievalKeywords: ['react'],
}

const research = {
  fitRating: 'STRONG_FIT',
  verifiedMatches: [{ skill: 'React' }, { skill: 'TypeScript' }],
  partialMatches: [{ skill: 'Kubernetes' }],
  gaps: [],
}

function makeDetail(overrides: Record<string, unknown> = {}): ApplicationDetail {
  return {
    slug: 'acme-swe',
    targetCompany: 'Acme',
    targetRole: 'SWE',
    status: 'analysing',
    interviewStage: 'applied',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-02T10:00:00.000Z',
    stages: {},
    research,
    analysis: { atsCheck, jdExtraction },
    dsaRealWork: [],
    devopsEvidence: [],
    ...overrides,
  } as unknown as ApplicationDetail
}

describe('StageGlancePanel — applied stage split row', () => {
  it('places the ATS panel in the wide slot and the assessment stack on the right', () => {
    const { container } = render(<StageGlancePanel detail={makeDetail()} stage="applied" />)

    const wide = container.querySelector('[class*="col-span-2"]')
    expect(wide).not.toBeNull()
    expect(wide?.textContent).toContain('ATS check')

    const slim = container.querySelector('[class*="col-span-1"]')
    expect(slim).not.toBeNull()
    expect(slim?.textContent).toContain('Assessment')
    expect(slim?.textContent).toContain('Skill coverage')

    // Wide slot precedes the slim stack in DOM order (ATS left, stack right).
    expect(
      wide && slim ? wide.compareDocumentPosition(slim) & Node.DOCUMENT_POSITION_FOLLOWING : 0,
    ).toBeTruthy()

    // JD understanding sits in its own full-width row below the split.
    const jdRow = screen
      .getByText('What we understood from the JD')
      .closest('[class*="col-span-3"]')
    expect(jdRow).not.toBeNull()
  })

  it('keeps the JD panel in the wide slot when there is no ATS check', () => {
    const detail = makeDetail({ analysis: { atsCheck: null, jdExtraction } })
    const { container } = render(<StageGlancePanel detail={detail} stage="applied" />)

    expect(screen.queryByText('ATS check')).toBeNull()
    const wide = container.querySelector('[class*="col-span-2"]')
    expect(wide).not.toBeNull()
    expect(wide?.textContent).toContain('What we understood from the JD')
    // No duplicate JD row below.
    expect(container.querySelectorAll('[class*="col-span-3"]').length).toBe(0)
  })

  it('renders the assessment tile compact in the right stack', () => {
    const { container } = render(<StageGlancePanel detail={makeDetail()} stage="applied" />)
    // Compact level meter: reduced minimum height.
    expect(container.querySelector('[class*="col-span-1"] .min-h-10')).not.toBeNull()
    // Compact card padding.
    expect(container.querySelector('[class*="col-span-1"] .p-4')).not.toBeNull()
    // The compact tile hugs its content (no h-full) so the coverage card
    // below can absorb the stack's remaining height.
    const tile = container.querySelector('.min-h-10')?.closest('[class*="p-4"]')
    expect(tile?.className ?? '').toContain('shrink-0')
    expect(tile?.className ?? '').not.toContain('h-full')
  })

  it('renders the skill-coverage donut compact in the right stack', () => {
    const { container } = render(<StageGlancePanel detail={makeDetail()} stage="applied" />)
    const donut = container.querySelector('svg[aria-label="Skill coverage breakdown"]')
    expect(donut).not.toBeNull()
    expect(donut?.getAttribute('class') ?? '').toContain('max-w-28')
    const legend = container.querySelector('[class*="col-span-1"] ul')
    expect(legend?.className ?? '').toContain('space-y-1.5')
  })

  it('caps the right stack at the wide slot height via an absolute overlay', () => {
    const { container } = render(<StageGlancePanel detail={makeDetail()} stage="applied" />)
    // The stack is absolutely positioned inside its cell at @2xl so it never
    // sets the grid row height — only the ATS panel does.
    const overlay = container.querySelector('[class*="col-span-1"] [class*="@2xl:absolute"]')
    expect(overlay).not.toBeNull()
    expect(overlay?.className ?? '').toContain('@2xl:inset-0')
  })

  it('keeps the stack in normal flow when nothing occupies the wide slot', () => {
    const detail = makeDetail({ analysis: { atsCheck: null, jdExtraction: null } })
    const { container } = render(<StageGlancePanel detail={detail} stage="applied" />)
    // With no wide panel to define the row height, an absolute overlay would
    // collapse to zero height — the cap class must be absent.
    expect(container.querySelector('[class*="@2xl:absolute"]')).toBeNull()
    expect(container.querySelector('[class*="col-span-1"]')?.textContent).toContain('Assessment')
  })
})
