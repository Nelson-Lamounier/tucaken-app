import { describe, it, expect } from 'vitest'
import { deleteAdminUserSchema } from '../../server/admin-users'

describe('deleteAdminUserSchema', () => {
  it('accepts a soft delete with a reason', () => {
    const r = deleteAdminUserSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111', mode: 'soft', reason: 'spam',
    })
    expect(r.success).toBe(true)
  })
  it('accepts a hard delete with no reason', () => {
    const r = deleteAdminUserSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111', mode: 'hard',
    })
    expect(r.success).toBe(true)
  })
  it('rejects a bad mode', () => {
    const r = deleteAdminUserSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111', mode: 'purge',
    })
    expect(r.success).toBe(false)
  })
  it('rejects a non-uuid id', () => {
    const r = deleteAdminUserSchema.safeParse({ id: 'nope', mode: 'soft' })
    expect(r.success).toBe(false)
  })
})
