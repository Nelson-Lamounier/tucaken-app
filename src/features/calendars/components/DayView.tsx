import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useScheduledInterviews, toCalendarEvents } from '../api/scheduled-interviews'
import { eventsOnDay, longDayLabel, addDays } from '../lib/calendar-grid'
import { CalendarHeader } from './CalendarHeader'

export default function DayView() {
  const { data } = useScheduledInterviews()
  const events = useMemo(() => toCalendarEvents(data ?? []), [data])
  const [ref, setRef] = useState(() => new Date())
  const dayEvents = useMemo(() => eventsOnDay(ref, events), [ref, events])

  return (
    <div className="flex h-full flex-col">
      <CalendarHeader
        title={longDayLabel(ref)}
        view="day"
        onPrev={() => setRef(r => addDays(r, -1))}
        onToday={() => setRef(new Date())}
        onNext={() => setRef(r => addDays(r, 1))}
      />

      {dayEvents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No interviews scheduled for this day.
        </div>
      ) : (
        <ol className="divide-y divide-zinc-100 dark:divide-white/10">
          {dayEvents.map(event => (
            <li key={event.id}>
              <Link
                to="/applications/$slug"
                params={{ slug: event.slug }}
                search={{ stage: event.stage }}
                className="flex items-center gap-4 px-2 py-4 hover:bg-zinc-50 dark:hover:bg-white/5"
              >
                <time dateTime={event.datetime} className="w-20 shrink-0 text-sm font-semibold tabular-nums text-accent">
                  {event.time}
                </time>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{event.name}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
