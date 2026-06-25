import { describe, it, expect } from 'vitest'
import {
  enabledStagesFor,
  isStageEnabledFor,
  type StageViewer,
} from '@/features/applications/stages/types/stage-access'
import { STAGE_ORDER } from '@/features/applications/stages/types/stage'

const user = (over: Partial<StageViewer> = {}): StageViewer => ({
  id: 'u1', email: 'u1@example.com', role: 'user', tier: 'free', ...over,
})

describe('enabledStagesFor', () => {
  it('null viewer → applied only', () => {
    const s = enabledStagesFor(null)
    expect([...s]).toEqual(['applied'])
  })
  it('plain user → applied only', () => {
    expect([...enabledStagesFor(user())]).toEqual(['applied'])
  })
  it('admin role → all stages', () => {
    expect(enabledStagesFor(user({ role: 'admin' })).size).toBe(STAGE_ORDER.length)
  })
  it('deny wins over allow (admin on deny-list → applied only)', () => {
    // Relies on the deny test-seed below; see Step 3 note.
    expect([...enabledStagesFor(user({ role: 'admin', email: 'blocked@example.com' }))]).toEqual(['applied'])
  })
})

describe('isStageEnabledFor', () => {
  it('applied always enabled, technical gated for plain user', () => {
    expect(isStageEnabledFor('applied', user())).toBe(true)
    expect(isStageEnabledFor('technical', user())).toBe(false)
  })
  it('technical enabled for admin', () => {
    expect(isStageEnabledFor('technical', user({ role: 'admin' }))).toBe(true)
  })
})
