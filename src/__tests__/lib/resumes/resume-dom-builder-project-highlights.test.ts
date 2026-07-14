// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildResumeDomForPdf } from '@/lib/resumes/resume-dom-builder'
import { resumeData, type ResumeData } from '@/lib/resumes/resume-data'

/**
 * The client-side PDF capture must render project highlight bullets, mirroring
 * the Professional Experience section. Regression guard for the Key Projects
 * block rendering only name + github + description.
 */

const HIGHLIGHTS = [
  'Provisioned EKS cluster with Karpenter autoscaling.',
  'Hardened WAFv2 WebACL at the regional edge.',
]

function withProjectHighlights(): ResumeData {
  return {
    ...resumeData,
    projects: [
      {
        name: 'AI Applications Platform',
        description: 'Infrastructure-as-code AI platform.',
        github: 'github.com/x/ai-applications',
        highlights: HIGHLIGHTS,
      },
      {
        name: 'legacy-project',
        description: 'Stored before highlights existed.',
        github: 'github.com/x/legacy',
      },
    ],
  }
}

describe('buildResumeDomForPdf — Key Projects highlights', () => {
  it('renders one list item per project highlight', () => {
    const dom = buildResumeDomForPdf(withProjectHighlights())
    const text = dom.textContent ?? ''
    for (const h of HIGHLIGHTS) {
      expect(text).toContain(h)
    }
  })

  it('renders highlights as list items, not paragraph text', () => {
    const dom = buildResumeDomForPdf(withProjectHighlights())
    const items = [...dom.querySelectorAll('li')].map((li) => li.textContent)
    for (const h of HIGHLIGHTS) {
      expect(items).toContain(h)
    }
  })

  it('renders legacy projects without highlights and without empty lists', () => {
    const dom = buildResumeDomForPdf(withProjectHighlights())
    expect(dom.textContent).toContain('legacy-project')
    const emptyLists = [...dom.querySelectorAll('ul')].filter(
      (ul) => ul.children.length === 0,
    )
    expect(emptyLists).toHaveLength(0)
  })
})
