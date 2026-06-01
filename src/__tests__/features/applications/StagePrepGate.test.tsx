/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { StagePrepGate } from '@/features/applications/stages/components/StagePrepGate'
import type { StageState } from '@/lib/types/applications.types'

function makeState(overrides: Partial<StageState> = {}): StageState {
  return {
    stage_status: 'upcoming',
    prep_status: 'none',
    scheduled_at: null,
    user_state: {},
    coach_run_id: null,
    ...overrides,
  }
}

const noop = vi.fn()

describe('StagePrepGate', () => {
  it('not_applicable: renders muted notice, no children', () => {
    render(
      <StagePrepGate
        stage="bar-raiser"
        state={makeState({ stage_status: 'not_applicable' })}
        stageLabel="Bar Raiser"
        onSchedule={noop}
        onAdvance={noop}
        onGenerate={noop}
      >
        <div>Real workspace</div>
      </StagePrepGate>,
    )
    expect(screen.getByText(/not applicable/i)).toBeTruthy()
    expect(screen.queryByText('Real workspace')).toBeNull()
  })

  it('queued: renders generating notice with pulsing affordance, no children', () => {
    const { container } = render(
      <StagePrepGate
        stage="phone-screen"
        state={makeState({ stage_status: 'current', prep_status: 'queued' })}
        stageLabel="Phone Screen"
        onSchedule={noop}
        onAdvance={noop}
        onGenerate={noop}
      >
        <div>Real workspace</div>
      </StagePrepGate>,
    )
    expect(screen.getByText(/generating.*phone screen prep/i)).toBeTruthy()
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
    expect(screen.queryByText('Real workspace')).toBeNull()
  })

  it('failed: renders error message and calls onGenerate on retry click', () => {
    const onGenerate = vi.fn()
    render(
      <StagePrepGate
        stage="technical"
        state={makeState({ stage_status: 'current', prep_status: 'failed' })}
        stageLabel="Technical"
        onSchedule={noop}
        onAdvance={noop}
        onGenerate={onGenerate}
      >
        <div>Real workspace</div>
      </StagePrepGate>,
    )
    expect(screen.getByText(/prep generation failed/i)).toBeTruthy()
    expect(screen.queryByText('Real workspace')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('ready: renders children directly', () => {
    render(
      <StagePrepGate
        stage="phone-screen"
        state={makeState({ stage_status: 'current', prep_status: 'ready' })}
        stageLabel="Phone Screen"
        onSchedule={noop}
        onAdvance={noop}
        onGenerate={noop}
      >
        <div>Real workspace</div>
      </StagePrepGate>,
    )
    expect(screen.getByText('Real workspace')).toBeTruthy()
    expect(screen.queryByText(/generating/i)).toBeNull()
  })

  it('completed + none: renders retroactive generate CTA, calls onGenerate', () => {
    const onGenerate = vi.fn()
    render(
      <StagePrepGate
        stage="phone-screen"
        state={makeState({ stage_status: 'completed', prep_status: 'none' })}
        stageLabel="Phone Screen"
        onSchedule={noop}
        onAdvance={noop}
        onGenerate={onGenerate}
      >
        <div>Real workspace</div>
      </StagePrepGate>,
    )
    expect(screen.getByText(/this stage is complete/i)).toBeTruthy()
    expect(screen.queryByText('Real workspace')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /generate prep anyway/i }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('upcoming + none: renders teaser with schedule and advance CTAs', () => {
    const onSchedule = vi.fn()
    const onAdvance = vi.fn()
    render(
      <StagePrepGate
        stage="technical"
        state={makeState({ stage_status: 'upcoming', prep_status: 'none' })}
        stageLabel="Technical"
        onSchedule={onSchedule}
        onAdvance={onAdvance}
        onGenerate={noop}
      >
        <div>Real workspace</div>
      </StagePrepGate>,
    )
    expect(screen.getByText(/Technical prep/i)).toBeTruthy()
    expect(screen.queryByText('Real workspace')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Schedule technical/i }))
    expect(onSchedule).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Advance to Technical/i }))
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('undefined state (no row): falls back to upcoming teaser', () => {
    render(
      <StagePrepGate
        stage="system-design"
        state={undefined}
        stageLabel="System Design"
        onSchedule={noop}
        onAdvance={noop}
        onGenerate={noop}
      >
        <div>Real workspace</div>
      </StagePrepGate>,
    )
    expect(screen.getByText(/System Design prep/i)).toBeTruthy()
    expect(screen.queryByText('Real workspace')).toBeNull()
  })
})
