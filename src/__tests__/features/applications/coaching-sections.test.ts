import { describe, it, expect } from 'vitest'
import { parseCoachingSections, stripCdata } from '@/features/applications/stages/lib/coaching-sections'
import type { CoachingNotes, CoachingSection } from '@/lib/types/applications.types'

describe('stripCdata', () => {
  it('removes the CDATA wrapper', () => {
    expect(stripCdata('<![CDATA[hello]]>')).toBe('hello')
    expect(stripCdata('  <![CDATA[\nhi\n]]>  ')).toBe('hi')
  })
  it('leaves plain text untouched', () => {
    expect(stripCdata('plain **markdown**')).toBe('plain **markdown**')
  })
})

describe('parseCoachingSections', () => {
  it('passes a sections array through, normalising shape', () => {
    const sections: CoachingSection[] = [
      { key: 'esl', title: 'ESL note', body: 'Slow down on results.' },
      { key: 'final', title: 'Final checkpoint', body: 'Tick these.', checklist: ['Rails repo', 'LeetCode'] },
    ]
    const r = parseCoachingSections(sections)
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ key: 'esl', title: 'ESL note', body: 'Slow down on results.' })
    expect(r[1].checklist).toEqual(['Rails repo', 'LeetCode'])
  })

  it('wraps a plain string as a single section (CDATA stripped)', () => {
    const r = parseCoachingSections('<![CDATA[Just a summary.]]>')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ key: 'coaching-notes', title: 'Coaching notes', body: 'Just a summary.' })
  })

  it('splits a legacy markdown blob on bold headers + extracts checklists', () => {
    const md = '**STAGE POSITIONING: Technical**\n\nYou are well placed.\n\n**FINAL CHECKPOINT:**\n\n- [ ] Rails repo\n- [ ] LeetCode\n\nYou are ready.'
    const r = parseCoachingSections(md)
    const positioning = r.find(s => s.key.startsWith('stage-positioning'))
    expect(positioning?.body).toMatch(/well placed/)
    const checkpoint = r.find(s => s.checklist)
    expect(checkpoint?.checklist).toEqual(['Rails repo', 'LeetCode'])
    expect(checkpoint?.body).toMatch(/You are ready/)
  })

  it('maps the legacy 7-field object to sections', () => {
    const legacy: CoachingNotes = {
      positioning: 'Lead with the operator project.',
      interviewFocus: [{ label: 'Coding', detail: 'DS&A.' }],
      tacticalPrep: 'Revise etcd.',
      finalCheckpoint: { items: ['Confirm format'], note: 'You are ready.' },
    }
    const r = parseCoachingSections(legacy)
    expect(r.find(s => s.key === 'stage-positioning')?.body).toMatch(/operator/)
    expect(r.find(s => s.key === 'interview-focus')?.body).toMatch(/Coding/)
    expect(r.find(s => s.key === 'tactical-prep')?.body).toMatch(/etcd/)
    const fc = r.find(s => s.key === 'final-checkpoint')
    expect(fc?.checklist).toEqual(['Confirm format'])
    expect(fc?.body).toBe('You are ready.')
  })

  it('returns [] for empty / undefined', () => {
    expect(parseCoachingSections(undefined)).toEqual([])
    expect(parseCoachingSections('')).toEqual([])
  })
})
