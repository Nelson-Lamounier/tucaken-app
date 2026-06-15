import { describe, it, expect } from 'vitest'
import {
  tallyLedger,
  repoFromEvidenceFile,
  retrievalRepoCounts,
  entryRetrievedRepos,
  correlationSummary,
  retrievalTone,
} from '@/features/applications/stages/lib/evidence-quality'
import type { KbRetrievalStats, SkillEvidenceEntry } from '@/lib/types/applications.types'

const entry = (over: Partial<SkillEvidenceEntry>): SkillEvidenceEntry => ({
  tool: 'x',
  status: 'verified',
  evidenceFiles: [],
  evidence: '',
  transferableBridge: '',
  ...over,
})

const stats = (over: Partial<KbRetrievalStats>): KbRetrievalStats => ({
  passageCount: 5,
  maxCosine: 0.45,
  medianCosine: 0.3,
  minCosine: 0.2,
  floor: 0.18,
  topSources: [],
  repoBreakdown: [],
  ...over,
})

describe('tallyLedger', () => {
  it('counts per status + withEvidence', () => {
    const t = tallyLedger([
      entry({ status: 'verified' }),
      entry({ status: 'verified' }),
      entry({ status: 'transferable' }),
      entry({ status: 'gap' }),
    ])
    expect(t).toEqual({ verified: 2, transferable: 1, gap: 1, total: 4, withEvidence: 3 })
  })

  it('handles an empty ledger', () => {
    expect(tallyLedger([])).toEqual({ verified: 0, transferable: 0, gap: 0, total: 0, withEvidence: 0 })
  })
})

describe('repoFromEvidenceFile', () => {
  it('extracts owner/repo from a blob path', () => {
    expect(repoFromEvidenceFile('Nelson-Lamounier/cdk-monitoring/.checkov/x.py')).toBe('Nelson-Lamounier/cdk-monitoring')
  })
  it('returns null for paths with fewer than two segments', () => {
    expect(repoFromEvidenceFile('justafile.ts')).toBeNull()
    expect(repoFromEvidenceFile('owner/repo')).toBeNull() // no file segment
    expect(repoFromEvidenceFile('/leading')).toBeNull()
  })
})

describe('retrievalRepoCounts', () => {
  it('builds a repo→count map from repoBreakdown', () => {
    const m = retrievalRepoCounts(stats({ repoBreakdown: [{ repo: 'a/b', count: 3 }, { repo: 'c/d', count: 1 }] }))
    expect(m.get('a/b')).toBe(3)
    expect(m.get('c/d')).toBe(1)
  })
  it('is empty when stats are absent', () => {
    expect(retrievalRepoCounts(undefined).size).toBe(0)
  })
})

describe('entryRetrievedRepos', () => {
  const counts = new Map([['a/b', 4], ['c/d', 2]])
  it('returns distinct overlapping repos with counts', () => {
    const e = entry({ evidenceFiles: ['a/b/one.ts', 'a/b/two.ts', 'c/d/three.ts', 'e/f/none.ts'] })
    expect(entryRetrievedRepos(e, counts)).toEqual([{ repo: 'a/b', count: 4 }, { repo: 'c/d', count: 2 }])
  })
  it('returns empty when no files overlap retrieval', () => {
    expect(entryRetrievedRepos(entry({ evidenceFiles: ['x/y/z.ts'] }), counts)).toEqual([])
  })
  it('returns empty when counts or files are empty', () => {
    expect(entryRetrievedRepos(entry({ evidenceFiles: ['a/b/c.ts'] }), new Map())).toEqual([])
    expect(entryRetrievedRepos(entry({ evidenceFiles: [] }), counts)).toEqual([])
  })
})

describe('correlationSummary', () => {
  const counts = new Map([['a/b', 4]])
  it('counts verified-with-repos and the double-confirmed subset', () => {
    const s = correlationSummary(
      [
        entry({ status: 'verified', evidenceFiles: ['a/b/one.ts'] }), // retrieved
        entry({ status: 'verified', evidenceFiles: ['x/y/two.ts'] }), // not retrieved
        entry({ status: 'verified', evidenceFiles: [] }),             // no repo file — excluded
        entry({ status: 'transferable', evidenceFiles: ['a/b/t.ts'] }), // not verified — excluded
      ],
      counts,
    )
    expect(s).toEqual({ verifiedRetrieved: 1, verifiedWithRepos: 2 })
  })
})

describe('retrievalTone', () => {
  it('maps cosine bands + empty', () => {
    expect(retrievalTone(undefined)).toBe('none')
    expect(retrievalTone(stats({ passageCount: 0 }))).toBe('none')
    expect(retrievalTone(stats({ maxCosine: 0.5 }))).toBe('strong')
    expect(retrievalTone(stats({ maxCosine: 0.3 }))).toBe('moderate')
    expect(retrievalTone(stats({ maxCosine: 0.1 }))).toBe('weak')
  })
})
