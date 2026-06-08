/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VerifiedMatchesDeck } from '@/features/applications/stages/workspaces/AppliedWorkspace'
import type { VerifiedMatch } from '@/lib/types/applications.types'

const MATCHES: VerifiedMatch[] = [
  { skill: 'Kubernetes', sourceCitation: 'cdk-monitoring repo', depthBadge: 'deep', recency: '2025' },
]

describe('VerifiedMatchesDeck', () => {
  it('renders one card per verified match with citation on the back', () => {
    render(<VerifiedMatchesDeck matches={MATCHES} />)
    expect(screen.getByText('Kubernetes')).toBeTruthy()
    expect(screen.getByLabelText('Strong evidence')).toBeTruthy()
    expect(screen.getByText(/cdk-monitoring repo/)).toBeTruthy()
  })
})
