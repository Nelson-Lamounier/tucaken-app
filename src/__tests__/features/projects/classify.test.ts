import { describe, it, expect } from 'vitest'
import {
  isCurated,
  isProposal,
  isRepoDefault,
  isPendingSetup,
  partitionProjects,
} from '@/features/projects/lib/classify'
import type { ProjectSummary } from '@/features/projects/lib/types'

/** Build a ProjectSummary with just the lifecycle flags that classification reads. */
function project(p: Partial<ProjectSummary> & { id: string }): ProjectSummary {
  return {
    slug: p.id,
    name: p.id,
    tagline: null,
    type: 'side_project',
    shape: 'single_repo',
    status: 'active',
    role_exhibited: 'sole_builder',
    visibility: 'private',
    is_ai_suggested: false,
    is_user_confirmed: false,
    case_study_status: null,
    case_study_generated_at: null,
    post_sync_action: null,
    last_activity_at: null,
    started_at: null,
    ended_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    repository_count: 1,
    latest_repo_sync_at: null,
    case_study_stale: false,
    ...p,
  }
}

const repoDefault   = project({ id: 'repo-default' }) // !ai, !confirmed, no intent
const proposal      = project({ id: 'proposal', is_ai_suggested: true })       // ai, !confirmed
const confirmed     = project({ id: 'confirmed', is_user_confirmed: true })    // confirmed (manual/merge)
const acceptedAI    = project({ id: 'accepted', is_ai_suggested: true, is_user_confirmed: true })
const pendingBuild  = project({ id: 'pending-build', post_sync_action: 'build' })  // default + pending intent

describe('project classification', () => {
  it('a raw per-repo default is a default, not curated or a proposal', () => {
    expect(isRepoDefault(repoDefault)).toBe(true)
    expect(isProposal(repoDefault)).toBe(false)
    expect(isCurated(repoDefault)).toBe(false)
  })

  it('an AI-suggested unconfirmed grouping is a proposal', () => {
    expect(isProposal(proposal)).toBe(true)
    expect(isCurated(proposal)).toBe(false)
    expect(isRepoDefault(proposal)).toBe(false)
  })

  it('a user-confirmed project is curated (manual create or accepted merge)', () => {
    expect(isCurated(confirmed)).toBe(true)
    expect(isCurated(acceptedAI)).toBe(true)
    expect(isProposal(acceptedAI)).toBe(false) // confirmed AI grouping is no longer a proposal
  })

  it('partitionProjects splits into mutually-exclusive buckets', () => {
    const { curated, proposals, pending, defaults } = partitionProjects([
      repoDefault,
      proposal,
      confirmed,
      acceptedAI,
    ])
    expect(curated.map((p) => p.id)).toEqual(['confirmed', 'accepted'])
    expect(proposals.map((p) => p.id)).toEqual(['proposal'])
    expect(pending.map((p) => p.id)).toEqual([])
    expect(defaults.map((p) => p.id)).toEqual(['repo-default'])
  })

  it('partitions an empty list into empty buckets', () => {
    expect(partitionProjects([])).toEqual({ curated: [], proposals: [], pending: [], defaults: [] })
  })
})

describe('isPendingSetup', () => {
  it('a repo default with post_sync_action="build" is pending setup', () => {
    expect(isPendingSetup(pendingBuild)).toBe(true)
  })

  it('a plain repo default with no intent is not pending setup', () => {
    expect(isPendingSetup(repoDefault)).toBe(false)
  })

  it('a confirmed project with no intent is not pending setup', () => {
    expect(isPendingSetup(confirmed)).toBe(false)
  })

  it('partitionProjects routes a pending-intent default into pending, not defaults', () => {
    const { pending, defaults } = partitionProjects([repoDefault, pendingBuild])
    expect(pending.map((p) => p.id)).toEqual(['pending-build'])
    expect(defaults.map((p) => p.id)).toEqual(['repo-default'])
  })
})
