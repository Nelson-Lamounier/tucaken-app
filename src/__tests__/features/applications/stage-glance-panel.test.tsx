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
  })
})
