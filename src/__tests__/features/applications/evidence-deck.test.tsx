/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvidenceDeck, type EvidenceCard } from '@/features/applications/stages/components/EvidenceDeck'

const CARDS: EvidenceCard[] = [
  { id: 'k8s', title: 'Kubernetes', strength: 'strong', backLabel: 'Evidence', hint: 'Flip', back: <p>cluster work</p> },
  { id: 'rust', title: 'Rust', strength: 'none', backLabel: 'Gap', hint: 'Flip', back: <p>no evidence</p> },
]

describe('EvidenceDeck', () => {
  it('renders a titled deck with a card per item', () => {
    render(<EvidenceDeck title="Topics" subtitle="sub" cards={CARDS} />)
    expect(screen.getByText('Topics')).toBeTruthy()
    expect(screen.getByText('Kubernetes')).toBeTruthy()
    expect(screen.getByText('Rust')).toBeTruthy()
    expect(screen.getByLabelText('Strong evidence')).toBeTruthy()
    expect(screen.getByLabelText('Gap')).toBeTruthy()
  })

  it('renders the back content (CSS flip keeps it in the DOM)', () => {
    render(<EvidenceDeck title="Topics" subtitle="sub" cards={CARDS} />)
    expect(screen.getByText('cluster work')).toBeTruthy()
  })

  it('shows the empty state when there are no cards', () => {
    render(<EvidenceDeck title="Topics" subtitle="sub" cards={[]} emptyState={<p>nothing yet</p>} />)
    expect(screen.getByText('nothing yet')).toBeTruthy()
  })
})
