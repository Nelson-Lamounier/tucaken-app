import { describe, it, expect } from 'vitest'
import { stageStatusAt, runStatusToStageIdx, ARTICLE_STAGE_COUNT, type StageInputs } from '@/features/ai-agent/components/PipelineMode'

/** Resolve all three stages at once for readable assertions. */
function stages(inputs: StageInputs) {
  return Array.from({ length: ARTICLE_STAGE_COUNT }, (_, i) => stageStatusAt(i, inputs))
}

describe('runStatusToStageIdx', () => {
  it('maps live pipeline_runs statuses to stage indices', () => {
    expect(runStatusToStageIdx('researching')).toBe(0)
    expect(runStatusToStageIdx('writing')).toBe(1)
    expect(runStatusToStageIdx('qa')).toBe(2)
  })

  it('returns -1 for non-stage statuses', () => {
    expect(runStatusToStageIdx('queued')).toBe(-1)
    expect(runStatusToStageIdx('complete')).toBe(-1)
    expect(runStatusToStageIdx('failed')).toBe(-1)
    expect(runStatusToStageIdx(null)).toBe(-1)
    expect(runStatusToStageIdx(undefined)).toBe(-1)
  })
})

describe('stageStatusAt', () => {
  it('reflects the live run stage while researching / writing / qa', () => {
    expect(stages({ state: 'processing', runStatus: 'researching', timedOut: false }))
      .toEqual(['active', 'pending', 'pending'])
    expect(stages({ state: 'processing', runStatus: 'writing', timedOut: false }))
      .toEqual(['done', 'active', 'pending'])
    expect(stages({ state: 'processing', runStatus: 'qa', timedOut: false }))
      .toEqual(['done', 'done', 'active'])
  })

  it('shows only the first stage active before the run row exists (no all-spinning)', () => {
    expect(stages({ state: 'processing', runStatus: null, timedOut: false }))
      .toEqual(['active', 'pending', 'pending'])
  })

  // The core bug this fixes: a Job that dies before its catch block leaves the
  // article row 'processing' but flips pipeline_runs.status to 'failed'. The
  // tracker must render failed (never keep spinning), driven by the run source.
  it('marks failed when the run failed even though the article row is still processing', () => {
    expect(stages({ state: 'processing', runStatus: 'failed', timedOut: false }))
      .toEqual(['failed', 'pending', 'pending'])
  })

  it('marks failed when the article row itself is failed', () => {
    expect(stages({ state: 'failed', runStatus: null, timedOut: false }))
      .toEqual(['failed', 'pending', 'pending'])
  })

  it('marks the stalled stage failed on a poll timeout, never leaving it active', () => {
    // Timed out mid-writing: research done, writer failed, qa pending.
    expect(stages({ state: 'processing', runStatus: 'writing', timedOut: true }))
      .toEqual(['done', 'failed', 'pending'])
  })

  it('does NOT treat a timeout as failed once the run has since completed', () => {
    expect(stages({ state: 'processing', runStatus: 'complete', timedOut: true }))
      .toEqual(['done', 'done', 'done'])
  })

  it('shows every stage done in a terminal-ok article state', () => {
    for (const state of ['review', 'flagged', 'published', 'rejected'] as const) {
      expect(stages({ state, runStatus: null, timedOut: false })).toEqual(['done', 'done', 'done'])
    }
  })
})
