import { describe, it, expect } from 'vitest'
import { listAdminUsersSchema, updateAdminUserSchema } from '../server/admin-users'

describe('admin-users server fn schemas', () => {
  it('defaults tier to "all"', () => {
    expect(listAdminUsersSchema.parse({}).tier).toBe('all')
  })
  it('rejects an unknown tier', () => {
    expect(listAdminUsersSchema.safeParse({ tier: 'gold' }).success).toBe(false)
  })
  it('requires at least one of role/plan on update', () => {
    expect(updateAdminUserSchema.safeParse({ id: 'x' }).success).toBe(false)
    expect(updateAdminUserSchema.safeParse({ id: 'x', role: 'admin' }).success).toBe(true)
  })
})
