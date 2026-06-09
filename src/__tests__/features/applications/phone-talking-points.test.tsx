/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TalkingPointsPanel } from '@/features/applications/stages/workspaces/PhoneScreenWorkspace'

describe('TalkingPointsPanel', () => {
  it('renders coach talking points with matched-skill chips', () => {
    render(<TalkingPointsPanel jdPoints={[{ point: 'Owns end-to-end AWS delivery', evidence: 'AI pipeline', matchedSkills: ['AWS', 'CDK'] }]} fallbackPoints={[]} />)
    expect(screen.getByText('Owns end-to-end AWS delivery')).toBeTruthy()
    expect(screen.getByText('AWS')).toBeTruthy()
    expect(screen.getByText('CDK')).toBeTruthy()
  })

  it('falls back to verified-match skills when no coach points', () => {
    render(<TalkingPointsPanel jdPoints={[]} fallbackPoints={['Kubernetes']} />)
    expect(screen.getByText('Kubernetes')).toBeTruthy()
  })
})
