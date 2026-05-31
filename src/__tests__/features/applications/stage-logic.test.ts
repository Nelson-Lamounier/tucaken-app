import { describe, expect, it } from 'vitest'
import {
  STAGE_ORDER,
  stageIndex,
  stageProgress,
  isInterviewStage,
} from '@/features/applications/stages/types/stage'
import { interviewPrepToWorkspace } from '@/features/applications/stages/types/workspace'
import type { InterviewPrepOutput } from '@/lib/types/applications.types'

describe('stage ordering', () => {
  it('has the seven stages in canonical order', () => {
    expect(STAGE_ORDER).toEqual([
      'applied',
      'phone-screen',
      'technical',
      'system-design',
      'behavioural',
      'bar-raiser',
      'final',
    ])
  })

  it('stageIndex reflects position', () => {
    expect(stageIndex('applied')).toBe(0)
    expect(stageIndex('final')).toBe(6)
  })

  it('isInterviewStage guards unknown values', () => {
    expect(isInterviewStage('technical')).toBe(true)
    expect(isInterviewStage('nope')).toBe(false)
    expect(isInterviewStage(42)).toBe(false)
  })
})

describe('stageProgress', () => {
  it('marks earlier stages completed, the current one current, later upcoming', () => {
    expect(stageProgress('applied', 'technical')).toBe('completed')
    expect(stageProgress('technical', 'technical')).toBe('current')
    expect(stageProgress('final', 'technical')).toBe('upcoming')
  })
})

describe('interviewPrepToWorkspace adapter', () => {
  it('maps real Coach fields and leaves backend-less fields empty', () => {
    const prep: InterviewPrepOutput = {
      stage: 'technical',
      stageDescription: 'Tech round',
      technicalQuestions: [],
      behaviouralQuestions: [],
      difficultQuestions: [],
      technicalPrepChecklist: [],
      questionsToAsk: [{ question: 'What does success look like?', rationale: 'Sets expectations' }],
      coachingNotes: 'Focus on systems.',
    }
    const ws = interviewPrepToWorkspace('technical', prep)
    expect(ws.questionsToAsk).toHaveLength(1)
    expect(ws.questionsToAsk[0].label).toBe('What does success look like?')
    expect(ws.coachingNotes).toBe('Focus on systems.')
    expect(ws.topics).toEqual([])
    expect(ws.projectRefs).toEqual([])
  })

  it('handles null prep', () => {
    const ws = interviewPrepToWorkspace('phone-screen', null)
    expect(ws.questionsToAsk).toEqual([])
    expect(ws.coachingNotes).toBeNull()
  })
})
