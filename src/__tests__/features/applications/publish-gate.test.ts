import { describe, it, expect } from 'vitest'
import { canPublishResume } from '@/features/applications/components/ApplicationActionsMenu'

describe('canPublishResume', () => {
  it('allows the operator email', () => {
    expect(canPublishResume('lamounier_88@hotmail.com')).toBe(true)
  })
  it('denies any other email', () => {
    expect(canPublishResume('someone@else.com')).toBe(false)
    expect(canPublishResume(undefined)).toBe(false)
  })
})
