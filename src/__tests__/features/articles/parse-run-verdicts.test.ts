import { describe, it, expect } from 'vitest'
import {
  parseQa,
  parseGrounding,
  parseProse,
  parseLint,
  parseEvidence,
  parseRunVerdicts,
  parseRunVersion,
} from '@/features/articles/lib/parse-run-verdicts'

describe('parseGrounding', () => {
  it('parses a NOT_GROUNDED verdict with ungrounded claims', () => {
    const g = parseGrounding({
      status: 'NOT_GROUNDED',
      reason: 'unsupported claims',
      ungroundedClaims: ['claim a', 'claim b', 42],
    })
    expect(g).toEqual({
      status: 'NOT_GROUNDED',
      reason: 'unsupported claims',
      ungroundedClaims: ['claim a', 'claim b'],
    })
  })

  it('drops an unknown status', () => {
    expect(parseGrounding({ status: 'MAYBE' })).toBeUndefined()
    expect(parseGrounding(null)).toBeUndefined()
  })
})

describe('parseProse', () => {
  it('parses a FAIL verdict with score total and issue count', () => {
    expect(
      parseProse({ status: 'FAIL', score: { total: 28 }, belowThreshold: true, issues: [1, 2, 3] }),
    ).toEqual({ status: 'FAIL', total: 28, belowThreshold: true, issueCount: 3 })
  })

  it('drops a malformed verdict', () => {
    expect(parseProse({ status: 'ok' })).toBeUndefined()
  })
})

describe('parseLint', () => {
  it('parses findings and derives error/warning counts', () => {
    const l = parseLint({
      errors: 2,
      warnings: 1,
      findings: [
        { rule: 'title-coverage', severity: 'error', message: 'golden missing' },
        { rule: 'shallow-link', severity: 'error', message: 'homepage link' },
        { rule: 'em-dash-density', severity: 'warn', message: 'too many' },
        { rule: 'bad', severity: 'nope', message: 'x' }, // dropped: invalid severity
      ],
    })
    expect(l?.errors).toBe(2)
    expect(l?.warnings).toBe(1)
    expect(l?.findings).toHaveLength(3)
  })

  it('derives counts from findings when not supplied', () => {
    const l = parseLint({
      findings: [{ rule: 'r', severity: 'error', message: 'm' }],
    })
    expect(l?.errors).toBe(1)
    expect(l?.warnings).toBe(0)
  })
})

describe('parseEvidence', () => {
  it('parses verdicts and keeps DEFECT/CLEARED, dropping malformed', () => {
    const e = parseEvidence({
      defects: 1,
      verdicts: [
        { rule: 'title-coverage', finding: 'golden', decision: 'DEFECT', reason: 'absent' },
        { rule: 'dangling-reference', finding: 'caveat', decision: 'CLEARED', reason: 'ok' },
        { rule: 'x', decision: 'MAYBE', reason: 'y' }, // dropped
      ],
    })
    expect(e?.defects).toBe(1)
    expect(e?.verdicts).toHaveLength(2)
    expect(e?.verdicts[0].decision).toBe('DEFECT')
  })

  it('derives defect count when not supplied and returns undefined for junk', () => {
    const e = parseEvidence({ verdicts: [{ rule: 'r', finding: 'f', decision: 'DEFECT', reason: '' }] })
    expect(e?.defects).toBe(1)
    expect(parseEvidence(null)).toBeUndefined()
  })
})

describe('parseQa', () => {
  it('parses score, recommendation, dimensions, and issues', () => {
    const qa = parseQa({
      overallScore: 85,
      recommendation: 'publish',
      summary: 'good',
      dimensionScores: { technicalAccuracy: 90, seoCompliance: 'x' },
      issues: [
        { dimension: 'seoCompliance', severity: 'warning', description: 'meta too long' },
        { severity: 'error' }, // dropped: no description
      ],
    })
    expect(qa?.overallScore).toBe(85)
    expect(qa?.recommendation).toBe('publish')
    expect(qa?.dimensionScores).toEqual({ technicalAccuracy: 90 })
    expect(qa?.issues).toHaveLength(1)
    expect(qa?.issues[0].description).toBe('meta too long')
  })
})

describe('parseRunVerdicts + parseRunVersion', () => {
  it('assembles all four verdicts from a full metadata blob', () => {
    const v = parseRunVerdicts({
      qa: { overallScore: 80, recommendation: 'revise', issues: [] },
      grounding: { status: 'GROUNDED', ungroundedClaims: [] },
      prose: { status: 'PASS', score: { total: 40 }, belowThreshold: false, issues: [] },
      lint: { errors: 0, warnings: 2, findings: [] },
    })
    expect(v.qa?.overallScore).toBe(80)
    expect(v.grounding?.status).toBe('GROUNDED')
    expect(v.prose?.status).toBe('PASS')
    expect(v.lint?.warnings).toBe(2)
  })

  it('maps a raw admin-api version row (id fallback + verdicts)', () => {
    const row = parseRunVersion({
      pipelineRunId: 'run-1',
      status: 'complete',
      createdAt: '2026-07-01T11:55:00.000Z',
      errorMessage: null,
      metadata: { grounding: { status: 'NOT_GROUNDED', ungroundedClaims: ['x'] } },
    })
    expect(row.pipelineRunId).toBe('run-1')
    expect(row.status).toBe('complete')
    expect(row.verdicts.grounding?.status).toBe('NOT_GROUNDED')
  })

  it('returns empty verdicts for junk metadata without throwing', () => {
    expect(parseRunVerdicts(null)).toEqual({})
    expect(parseRunVerdicts('nope')).toEqual({})
    expect(parseRunVersion({}).verdicts).toEqual({})
  })
})
