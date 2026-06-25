/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlanBadge, RoleBadge } from '@/features/admin-users/components/PlanBadge'

describe('PlanBadge', () => {
  it('renders the plan label', () => {
    render(<PlanBadge plan="premium" deleted={false} />)
    expect(screen.getByText('Premium')).toBeTruthy()
  })
  it('shows a Deleted label when deleted', () => {
    render(<PlanBadge plan="free" deleted />)
    expect(screen.getByText('Deleted')).toBeTruthy()
  })
  it('RoleBadge renders the role', () => {
    render(<RoleBadge role="admin" />)
    expect(screen.getByText('admin')).toBeTruthy()
  })
})
