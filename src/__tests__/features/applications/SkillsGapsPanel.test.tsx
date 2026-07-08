/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkillsGapsPanel } from '@/features/applications/stages/workspaces/AppliedWorkspace'
import type { GapMitigation, SkillGap } from '@/lib/types/applications.types'

const gaps: SkillGap[] = [
  { skill: 'Ansible', gapType: 'soft', severity: 'significant', isDisqualifying: false },
  { skill: 'HPC', gapType: 'hard', severity: 'significant', isDisqualifying: false },
  { skill: 'Podman', gapType: 'soft', severity: 'minor', isDisqualifying: false },
]

const mitigations: GapMitigation[] = [
  { gap: 'Ansible', honestFraming: 'Config management achieved via AWS CDK and SSM Automation', bridgeNarrative: 'Declarative automation daily, different tool', proactiveAction: '', goNoGo: 'go' },
  { gap: 'HPC / simulation', honestFraming: 'All compute is cloud-native', bridgeNarrative: '', proactiveAction: '', goNoGo: 'conditional' },
]

describe('SkillsGapsPanel — gap defences', () => {
  it('renders the honest defence under its gap, with loose name matching', () => {
    render(<SkillsGapsPanel gaps={gaps} mitigations={mitigations} />)
    expect(screen.getByText(/Config management achieved via AWS CDK/)).toBeTruthy()
    // 'HPC / simulation' mitigation attaches to the 'HPC' gap.
    expect(screen.getByText(/All compute is cloud-native/)).toBeTruthy()
    expect(screen.getAllByText(/your honest defence/i)).toHaveLength(2)
  })

  it('labels gapType as requirement strength, never as skill taxonomy', () => {
    render(<SkillsGapsPanel gaps={gaps} mitigations={[]} />)
    expect(screen.getAllByText('nice-to-have').length).toBeGreaterThan(0)
    expect(screen.getByText('core requirement')).toBeTruthy()
    expect(screen.queryByText(/soft skill/i)).toBeNull()
  })

  it('renders gaps without defences plainly (legacy runs)', () => {
    render(<SkillsGapsPanel gaps={[gaps[2]]} mitigations={mitigations} />)
    expect(screen.getByText('Podman')).toBeTruthy()
    expect(screen.queryByText(/your honest defence/i)).toBeNull()
  })
})
