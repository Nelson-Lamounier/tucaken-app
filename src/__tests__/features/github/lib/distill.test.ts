import { describe, it, expect } from 'vitest'
import { selectDistillableRepos, cleanRepoTitle } from '@/features/github/lib/distill'
import type { ConnectedRepo } from '@/lib/types/github.types'

function repo(p: Partial<ConnectedRepo> = {}): ConnectedRepo {
  return {
    repoFullName: 'o/r', owner: 'o', name: 'r', defaultBranch: 'main',
    syncStatus: 'complete', addedAt: '2026-01-01T00:00:00Z',
    classification: 'project', extractionStatus: 'completed', isHidden: false,
    ...p,
  } as ConnectedRepo
}

describe('selectDistillableRepos', () => {
  it('keeps only project + !hidden + completed', () => {
    const out = selectDistillableRepos([
      repo({ repoFullName: 'o/a' }),
      repo({ repoFullName: 'o/b', classification: 'fork' }),
      repo({ repoFullName: 'o/c', isHidden: true }),
      repo({ repoFullName: 'o/d', extractionStatus: 'pending' }),
    ])
    expect(out.map(r => r.repoFullName)).toEqual(['o/a'])
  })
  it('treats missing isHidden as not hidden', () => {
    const r = repo({ repoFullName: 'o/x' }); delete (r as { isHidden?: boolean }).isHidden
    expect(selectDistillableRepos([r]).map(x => x.repoFullName)).toEqual(['o/x'])
  })
})

describe('cleanRepoTitle', () => {
  it('humanizes the repo slug', () => {
    expect(cleanRepoTitle('my-cool_repo')).toBe('My Cool Repo')
    expect(cleanRepoTitle('API.gateway')).toBe('API Gateway')
    expect(cleanRepoTitle('x')).toBe('X')
    expect(cleanRepoTitle('aws-cdk-IAM')).toBe('Aws Cdk IAM')
  })
})
