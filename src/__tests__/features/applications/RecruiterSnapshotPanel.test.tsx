/** @vitest-environment happy-dom */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RecruiterSnapshotPanel } from '@/features/applications/stages/components/RecruiterSnapshotPanel'

const SNAP = {
  score: 45,
  scoreRationale: 'Stretch — infra strong, product-eng thin.',
  missingKeywords: ['Kafka', 'gRPC', 'Go'],
  redFlags: [{ flag: 'No streaming experience', why: 'JD centres on Kafka pipelines' }],
}

describe('RecruiterSnapshotPanel', () => {
  it('renders the score, keywords, and red flags', () => {
    render(<RecruiterSnapshotPanel snapshot={SNAP} />)
    expect(screen.getByText('45')).toBeTruthy()
    expect(screen.getByText('Kafka')).toBeTruthy()
    expect(screen.getByText('No streaming experience')).toBeTruthy()
  })
})
