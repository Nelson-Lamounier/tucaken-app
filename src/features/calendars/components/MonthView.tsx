import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useScheduledInterviews, toCalendarEvents } from '../api/scheduled-interviews'
import { buildMonthGrid, monthLabel } from '../lib/calendar-grid'
import { CalendarHeader } from './CalendarHeader'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function MonthView() {
  const { data } = useScheduledInterviews()
  const events = useMemo(() => toCalendarEvents(data ?? []), [data])
  const today = useMemo(() => new Date(), [])
  const [ref, setRef] = useState(() => new Date())
  const cells = useMemo(() => buildMonthGrid(ref, events, today), [ref, events, today])

  return (
    <div className="flex h-full flex-col">
      <CalendarHeader
        title={monthLabel(ref)}
        view="month"
        onPrev={() => setRef(r => new Date(r.getFullYear(), r.getMonth() - 1, 1))}
        onToday={() => setRef(new Date())}
        onNext={() => setRef(r => new Date(r.getFullYear(), r.getMonth() + 1, 1))}
      />

      <div className="grid grid-cols-7 border-b border-zinc-200 text-center text-xs font-semibold text-zinc-500 dark:border-white/10 dark:text-zinc-400">
        {WEEKDAYS.map(d => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>

      <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-px bg-zinc-200 dark:bg-white/10">
        {cells.map(cell => (
          <div
            key={cell.date}
            className={`min-h-24 p-1.5 ${cell.isCurrentMonth ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-900/50'}`}
          >
            <div
              className={
                cell.isToday
                  ? 'flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white'
                  : `text-xs ${cell.isCurrentMonth ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-400 dark:text-zinc-600'}`
              }
            >
              {cell.day}
            </div>
            <ol className="mt-1 space-y-1">
              {cell.events.slice(0, 3).map(event => (
                <li key={event.id}>
                  <Link
                    to="/applications/$slug"
                    params={{ slug: event.slug }}
                    search={{ stage: event.stage }}
                    className="flex gap-1 rounded-sm bg-accent/10 px-1 py-0.5 text-[11px] text-accent hover:bg-accent/20"
                  >
                    <time dateTime={event.datetime} className="shrink-0 tabular-nums">{event.time}</time>
                    <span className="truncate font-medium">{event.name}</span>
                  </Link>
                </li>
              ))}
              {cell.events.length > 3 && (
                <li className="px-1 text-[11px] text-zinc-400">+{cell.events.length - 3} more</li>
              )}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}
