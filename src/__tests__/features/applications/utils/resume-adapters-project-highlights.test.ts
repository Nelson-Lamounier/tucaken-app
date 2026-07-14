import { describe, it, expect } from 'vitest'
import {
  mapApplicationToBuilderState,
  builderStateToResumeData,
} from '@/features/applications/utils/resume-adapters'
import type { ResumeData as AppResumeData } from '@/lib/resumes/resume-data'

/**
 * Project highlights must survive the full Edit Tailored Resume round-trip:
 * strategist content_json → builder state (bullets) → saved resume payload.
 * Regression guard for the bug where the adapters hard-coded `bullets: []`
 * and omitted `highlights` on the way back, so a single save from the drawer
 * permanently destroyed the LLM-generated project bullets.
 */

const HIGHLIGHTS = [
  'Provisioned EKS cluster with Karpenter autoscaling and Argo Rollouts blue-green.',
  'Migrated cluster edge from Traefik NLB to ALB, retiring CloudFront residue.',
]

const appResume = {
  profile: { name: 'Nelson Lamounier', title: 'Technical Operations Engineer' },
  projects: [
    {
      name: 'AI Applications Platform',
      description: 'Infrastructure-as-code AI platform.',
      github: 'github.com/x/ai-applications',
      highlights: HIGHLIGHTS,
    },
    {
      // Legacy row shape — stored before highlights existed.
      name: 'frontend-portfolio',
      description: 'Portfolio site.',
      github: 'github.com/x/frontend-portfolio',
    },
  ],
} as AppResumeData

function toBuilder(resume: AppResumeData) {
  return mapApplicationToBuilderState(resume, null, 'MongoDB', 'Technical Services Engineer')
}

describe('project highlights — app resume → builder state', () => {
  it('maps content_json highlights onto builder project bullets', () => {
    const state = toBuilder(appResume)
    expect(state.resume.projects[0]?.bullets).toEqual(HIGHLIGHTS)
  })

  it('defaults to empty bullets for legacy projects without highlights', () => {
    const state = toBuilder(appResume)
    expect(state.resume.projects[1]?.bullets).toEqual([])
  })
})

describe('project highlights — builder state → saved resume payload', () => {
  it('writes builder project bullets back as highlights', () => {
    const state = toBuilder(appResume)
    const saved = builderStateToResumeData(state)
    expect(saved.projects[0]?.highlights).toEqual(HIGHLIGHTS)
  })

  it('round-trips without losing or reordering any highlight', () => {
    const once = builderStateToResumeData(toBuilder(appResume))
    const twice = builderStateToResumeData(toBuilder(once))
    expect(twice.projects.map((p) => p.highlights)).toEqual(
      once.projects.map((p) => p.highlights),
    )
    expect(twice.projects[0]?.highlights).toEqual(HIGHLIGHTS)
  })

  it('preserves bullets edited in the builder, matching the experience-section contract', () => {
    const state = toBuilder(appResume)
    const project = state.resume.projects[0]
    if (!project) throw new Error('expected a builder project')
    project.bullets = ['Edited bullet one.', 'Edited bullet two.']
    const saved = builderStateToResumeData(state)
    expect(saved.projects[0]?.highlights).toEqual(['Edited bullet one.', 'Edited bullet two.'])
  })
})
