import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useScheduledInterviews, toCalendarEvents } from '../api/scheduled-interviews'
import { buildWeekDays, weekLabel, addDays } from '../lib/calendar-grid'
import { CalendarHeader } from './CalendarHeader'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function WeekView() {
  const { data } = useScheduledInterviews()
  const events = useMemo(() => toCalendarEvents(data ?? []), [data])
  const today = useMemo(() => new Date(), [])
  const [ref, setRef] = useState(() => new Date())
  const days = useMemo(() => buildWeekDays(ref, events, today), [ref, events, today])

  return (
    <div className="flex h-full flex-col">
      <CalendarHeader
        title={weekLabel(days)}
        view="week"
        onPrev={() => setRef(r => addDays(r, -7))}
        onToday={() => setRef(new Date())}
        onNext={() => setRef(r => addDays(r, 7))}
      />

      <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-px bg-zinc-200 sm:grid-cols-7 dark:bg-white/10">
        {days.map((day, i) => (
          <div key={day.date} className="bg-white p-2 dark:bg-zinc-900">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <span>{WEEKDAYS[i]}</span>
              <span
                className={
                  day.isToday
                    ? 'flex size-5 items-center justify-center rounded-full bg-accent text-white'
                    : 'text-zinc-900 dark:text-zinc-100'
                }
              >
                {day.day}
              </span>
            </div>
            <ol className="space-y-1">
              {day.events.map(event => (
                <li key={event.id}>
                  <Link
                    to="/applications/$slug"
                    params={{ slug: event.slug }}
                    search={{ stage: event.stage }}
                    className="block rounded-sm bg-accent/10 px-1.5 py-1 text-[11px] text-accent hover:bg-accent/20"
                  >
                    <time dateTime={event.datetime} className="block tabular-nums opacity-80">{event.time}</time>
                    <span className="font-medium">{event.name}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}
