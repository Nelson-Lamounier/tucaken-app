import { describe, it, expect } from 'vitest'
import { toCalendarEvents } from '@/features/calendars/api/scheduled-interviews'
import { buildMonthGrid, buildWeekDays, eventsOnDay } from '@/features/calendars/lib/calendar-grid'
import type { ScheduledInterview } from '@/lib/types/applications.types'

const interview: ScheduledInterview = {
  slug: 'a1',
  company: 'Acme',
  role: 'SWE',
  status: 'interviewing',
  stage: 'technical',
  stageStatus: 'current',
  scheduledAt: '2026-06-10T14:30:00',
}

describe('toCalendarEvents', () => {
  it('maps a scheduled interview to a calendar event (local date + time)', () => {
    const events = toCalendarEvents([interview])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ id: 'a1:technical', slug: 'a1', stage: 'technical', date: '2026-06-10' })
    expect(events[0].name).toContain('Acme')
    expect(events[0].time).toBe('2:30PM')
  })

  it('skips entries with an unparseable scheduledAt', () => {
    expect(toCalendarEvents([{ ...interview, scheduledAt: 'not-a-date' }])).toHaveLength(0)
  })
})

describe('buildMonthGrid', () => {
  const events = toCalendarEvents([interview])
  const grid = buildMonthGrid(new Date(2026, 5, 1), events, new Date(2026, 5, 15))

  it('returns a 42-cell, Monday-start month grid', () => {
    expect(grid).toHaveLength(42)
  })
  it('attaches events to their day and flags today', () => {
    expect(grid.find(c => c.date === '2026-06-10')?.events).toHaveLength(1)
    expect(grid.find(c => c.date === '2026-06-15')?.isToday).toBe(true)
    expect(grid.find(c => c.date === '2026-06-09')?.events).toHaveLength(0)
  })
})

describe('buildWeekDays / eventsOnDay', () => {
  const events = toCalendarEvents([interview])
  it('week has 7 Monday-start days with the event in the right one', () => {
    const week = buildWeekDays(new Date(2026, 5, 10), events, new Date(2026, 5, 15))
    expect(week).toHaveLength(7)
    expect(week.find(d => d.date === '2026-06-10')?.events).toHaveLength(1)
  })
  it('eventsOnDay returns only that day’s events', () => {
    expect(eventsOnDay(new Date(2026, 5, 10), events)).toHaveLength(1)
    expect(eventsOnDay(new Date(2026, 5, 11), events)).toHaveLength(0)
  })
})
