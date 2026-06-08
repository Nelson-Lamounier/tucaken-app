import { describe, it, expect } from 'vitest'
import { parseCoachingSections, stripCdata } from '@/features/applications/stages/lib/coaching-sections'

const SAMPLE = `<![CDATA[
**STAGE POSITIONING: Technical Round — Stripe Mid-Level Full-Stack Engineer**

You are entering Stripe's technical interview with strong verified credentials. Your competitive advantage is the unusual combination of three things.

The interview will focus on: (1) **Coding problems** (30–40 min) — expect 1–2 problems testing complexity analysis. (2) **System design** (20–30 min) — likely to touch distributed systems. (3) **Experience deep-dive** (10–15 min) — interviewer will probe your Bedrock pipelines.

**TACTICAL PREPARATION (Next 2 Weeks):**

1. **Ruby onboarding (HIGH PRIORITY):** Have a small Rails API project on GitHub.
2. **System design prep (HIGH PRIORITY):** Dedicate 3–4 weeks to payment-scale system design.

**COMMUNICATION STRATEGY:**

- **Lead with clarity, not cleverness.** Stripe values engineers who ship.
- **Embrace the Ruby gap honestly.** Dwelling on it signals defensiveness.

**MINDSET FOR THIS ROUND:**

You are not competing on credentials or seniority.

**POST-INTERVIEW DEBRIEF PROTOCOL:**

After the technical round, capture feedback.

**FINAL CHECKPOINT BEFORE INTERVIEW:**

- [ ] Rails API project on GitHub
- [ ] 3 system design practice questions

You are well-positioned for this round.
]]>`

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
  const parsed = parseCoachingSections(SAMPLE)

  it('marks the blob as structured', () => {
    expect(parsed.structured).toBe(true)
  })

  it('extracts the positioning summary without the interview-focus paragraph', () => {
    expect(parsed.positioning).toMatch(/unusual combination of three things/)
    expect(parsed.positioning).not.toMatch(/The interview will focus on/)
  })

  it('parses interview-focus into labelled items', () => {
    expect(parsed.interviewFocus).toHaveLength(3)
    expect(parsed.interviewFocus?.[0]).toEqual({
      label: 'Coding problems',
      detail: expect.stringContaining('complexity analysis'),
    })
    expect(parsed.interviewFocus?.[1].label).toBe('System design')
    expect(parsed.interviewFocus?.[2].label).toBe('Experience deep-dive')
  })

  it('splits each named section', () => {
    expect(parsed.tacticalPrep).toMatch(/Ruby onboarding/)
    expect(parsed.communication).toMatch(/Lead with clarity/)
    expect(parsed.mindset).toMatch(/not competing on credentials/)
    expect(parsed.debrief).toMatch(/capture feedback/)
    // Legacy markdown checklist → parsed into structured items + note.
    expect(parsed.finalCheckpoint?.items.some(i => /Rails API project on GitHub/.test(i))).toBe(true)
    expect(parsed.finalCheckpoint?.note).toMatch(/well-positioned/)
  })

  it('does not bleed one section into the next', () => {
    expect(parsed.tacticalPrep).not.toMatch(/COMMUNICATION STRATEGY/)
    expect(parsed.communication).not.toMatch(/MINDSET/)
  })

  it('falls back to raw when no known headers are present', () => {
    const r = parseCoachingSections('Just some freeform coaching, no headers here.')
    expect(r.structured).toBe(false)
    expect(r.raw).toBe('Just some freeform coaching, no headers here.')
    expect(r.tacticalPrep).toBeNull()
  })

  it('handles empty / undefined input', () => {
    expect(parseCoachingSections(undefined).structured).toBe(false)
    expect(parseCoachingSections('').raw).toBe('')
  })
})

describe('parseCoachingSections — structured contract (new Coach output)', () => {
  it('maps a structured CoachingNotes object straight through (no parsing)', () => {
    const r = parseCoachingSections({
      positioning: 'You are well placed for this round.',
      interviewFocus: [
        { label: 'Coding problems', detail: 'A DS&A problem testing complexity analysis.' },
        { label: 'System design', detail: 'API resilience and scaling patterns.' },
      ],
      tacticalPrep: '1. Revise idempotency.',
      communication: '- Lead with clarity.',
      mindset: 'You are not competing on seniority.',
      debrief: 'Capture what was asked.',
      finalCheckpoint: { items: ['Rails API project', 'System design questions'], note: 'You are ready.' },
    })
    expect(r.structured).toBe(true)
    expect(r.positioning).toMatch(/well placed/)
    expect(r.interviewFocus).toHaveLength(2)
    expect(r.interviewFocus?.[0].label).toBe('Coding problems')
    expect(r.tacticalPrep).toMatch(/idempotency/)
    expect(r.finalCheckpoint?.items).toHaveLength(2)
    expect(r.finalCheckpoint?.items[0]).toMatch(/Rails API/)
    expect(r.finalCheckpoint?.note).toMatch(/ready/i)
  })

  it('coerces a legacy markdown-string finalCheckpoint into structured items', () => {
    const r = parseCoachingSections({
      positioning: 'Lead with the operator project.',
      finalCheckpoint: '- [ ] Rails API project\n- [ ] LeetCode practice\nGo get it.',
    })
    expect(r.finalCheckpoint?.items).toEqual(['Rails API project', 'LeetCode practice'])
    expect(r.finalCheckpoint?.note).toMatch(/Go get it/)
  })

  it('nulls out empty optional fields but stays structured', () => {
    const r = parseCoachingSections({ positioning: 'Lead with the operator project.' })
    expect(r.structured).toBe(true)
    expect(r.positioning).toMatch(/operator/)
    expect(r.interviewFocus).toBeNull()
    expect(r.tacticalPrep).toBeNull()
    expect(r.finalCheckpoint).toBeNull()
  })
})
