import { queryOptions, useQuery } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { getScheduledInterviewsFn } from '@/server/applications'
import { STAGE_LABELS } from '@/features/applications/components/ApplicationTypes'
import type { InterviewStage, ScheduledInterview } from '@/lib/types/applications.types'

/** Shared query for the user's scheduled interviews — hydrated in the route loader. */
export const scheduledInterviewsQueryOptions = () =>
  queryOptions({
    queryKey: adminKeys.applications.scheduledInterviews,
    queryFn: () => getScheduledInterviewsFn(),
  })

export function useScheduledInterviews() {
  return useQuery(scheduledInterviewsQueryOptions())
}

/** A calendar-ready interview event derived from a ScheduledInterview. */
export interface CalendarEvent {
  readonly id: string
  readonly slug: string
  readonly stage: InterviewStage
  /** Display name, e.g. "Acme · Technical". */
  readonly name: string
  /** ISO 8601 timestamp (for `<time datetime>`). */
  readonly datetime: string
  /** Local calendar day key, `YYYY-MM-DD`. */
  readonly date: string
  /** Short local time label, e.g. "3PM" / "10:30AM". */
  readonly time: string
}

/** `YYYY-MM-DD` in local time (calendar grids key on the local day). */
export function localDateKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${String(d.getFullYear())}-${month}-${day}`
}

function timeLabel(d: Date): string {
  const minutes = d.getMinutes()
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
  const hour12 = d.getHours() % 12 || 12
  return minutes === 0 ? `${String(hour12)}${ampm}` : `${String(hour12)}:${String(minutes).padStart(2, '0')}${ampm}`
}

export function toCalendarEvents(interviews: readonly ScheduledInterview[]): CalendarEvent[] {
  const events: CalendarEvent[] = []
  for (const interview of interviews) {
    const when = new Date(interview.scheduledAt)
    if (Number.isNaN(when.getTime())) continue
    events.push({
      id: `${interview.slug}:${interview.stage}`,
      slug: interview.slug,
      stage: interview.stage,
      name: `${interview.company} · ${STAGE_LABELS[interview.stage] ?? interview.stage}`,
      datetime: interview.scheduledAt,
      date: localDateKey(when),
      time: timeLabel(when),
    })
  }
  return events
}
