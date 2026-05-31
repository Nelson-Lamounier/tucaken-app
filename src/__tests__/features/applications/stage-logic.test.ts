import { describe, expect, it } from 'vitest'
import {
  STAGE_ORDER,
  stageIndex,
  stageProgress,
  isInterviewStage,
} from '@/features/applications/stages/types/stage'
import { interviewPrepToWorkspace, researchToTopics, negotiationLeverage } from '@/features/applications/stages/types/workspace'
import { personalFitScore } from '@/features/applications/stages/hooks/useOfferDraft'
import { LEADERSHIP_PRINCIPLES, storiesForPrinciple, coverageStrength } from '@/features/applications/stages/types/principles'
import type { StarStory } from '@/features/applications/stages/types/workspace'
import type { InterviewPrepOutput, ResearchOutput } from '@/lib/types/applications.types'

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

describe('researchToTopics adapter', () => {
  it('maps verified/partial/gap matches to strength-tiered topics', () => {
    const research: ResearchOutput = {
      fitSummary: '',
      fitRating: 'STRONG_FIT',
      verifiedMatches: [{ skill: 'Kubernetes', sourceCitation: 'repo X', depthBadge: 'deep', recency: '2025' }],
      partialMatches: [{ skill: 'Kafka', gapDescription: 'light usage', transferableFoundation: 'queues', framingSuggestion: 'frame via SQS' }],
      gaps: [{ skill: 'Rust', gapType: 'hard', severity: 'major', isDisqualifying: true }],
      experienceSignals: { yearsExpected: '5', domain: 'infra', leadership: 'IC', scale: 'mid' },
      technologyInventory: { languages: [], frameworks: [], infrastructure: [], tools: [], methodologies: [] },
    }
    const topics = researchToTopics(research)
    expect(topics.map(t => t.strength)).toEqual(['strong', 'moderate', 'none'])
    expect(topics[0].title).toBe('Kubernetes')
    expect(topics[1].beHonest).toBe('frame via SQS')
    expect(topics[2].beHonest).toContain('weighted heavily')
  })

  it('returns empty for null research', () => {
    expect(researchToTopics(null)).toEqual([])
  })
})

describe('leadership-principle coverage', () => {
  it('coverageStrength tiers by story count', () => {
    expect(coverageStrength(0)).toBe('none')
    expect(coverageStrength(1)).toBe('moderate')
    expect(coverageStrength(3)).toBe('strong')
  })

  it('storiesForPrinciple matches by shared theme', () => {
    const principle = LEADERSHIP_PRINCIPLES.find(p => p.id === 'customer-obsession')!
    const stories: StarStory[] = [
      { id: '1', title: 'A', situation: '', task: '', action: '', result: '', themes: ['Customer'] },
      { id: '2', title: 'B', situation: '', task: '', action: '', result: '', themes: ['Conflict'] },
    ]
    const matched = storiesForPrinciple(principle, stories)
    expect(matched).toHaveLength(1)
    expect(matched[0].id).toBe('1')
  })
})

describe('offer logic', () => {
  it('personalFitScore is weighted satisfaction across factors', () => {
    expect(personalFitScore([{ key: 'a', weight: 5, score: 5 }])).toBe(50)
    expect(personalFitScore([{ key: 'a', weight: 10, score: 10 }])).toBe(100)
    expect(personalFitScore([{ key: 'a', weight: 0, score: 0 }])).toBe(0)
  })

  it('negotiationLeverage derives factual points from research', () => {
    const research: ResearchOutput = {
      fitSummary: '', fitRating: 'STRONG_FIT',
      verifiedMatches: [{ skill: 'K8s', sourceCitation: 'x', depthBadge: 'd', recency: '2025' }],
      partialMatches: [], gaps: [],
      experienceSignals: { yearsExpected: '5', domain: 'infra', leadership: 'IC', scale: 'large' },
      technologyInventory: { languages: [], frameworks: [], infrastructure: [], tools: [], methodologies: [] },
    }
    const points = negotiationLeverage(research)
    expect(points.length).toBeGreaterThanOrEqual(3)
    expect(points.some(p => p.includes('1 required skills'))).toBe(true)
    expect(negotiationLeverage(null)).toEqual([])
  })
})
