import { useMemo, useState } from 'react'
import { useScheduledInterviews, toCalendarEvents } from '../api/scheduled-interviews'
import { buildMonthGrid, type DayCell } from '../lib/calendar-grid'
import { CalendarHeader } from './CalendarHeader'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS_MINI = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Mini-month day styling — no nested ternaries (SonarQube S3358). */
function yearCellClass(cell: DayCell): string {
  if (!cell.isCurrentMonth) return 'text-zinc-300 dark:text-zinc-700'
  if (cell.events.length > 0) return 'bg-accent/15 font-semibold text-accent'
  if (cell.isToday) return 'bg-accent font-semibold text-white'
  return 'text-zinc-600 dark:text-zinc-300'
}

export default function YearView() {
  const { data } = useScheduledInterviews()
  const events = useMemo(() => toCalendarEvents(data ?? []), [data])
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(() => new Date().getFullYear())
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, m) => ({ m, cells: buildMonthGrid(new Date(year, m, 1), events, today) })),
    [year, events, today],
  )

  return (
    <div className="flex h-full flex-col">
      <CalendarHeader
        title={String(year)}
        view="year"
        onPrev={() => setYear(y => y - 1)}
        onToday={() => setYear(new Date().getFullYear())}
        onNext={() => setYear(y => y + 1)}
      />

      <div className="grid grid-cols-1 gap-6 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map(({ m, cells }) => (
          <section key={m}>
            <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{MONTH_NAMES[m]}</h3>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
              {WEEKDAYS_MINI.map((d, i) => (
                <div key={i} className="text-zinc-400 dark:text-zinc-500">{d}</div>
              ))}
              {cells.map(cell => (
                <div
                  key={cell.date}
                  title={cell.events.length > 0 ? cell.events.map(e => e.name).join(', ') : undefined}
                  className={`flex h-6 items-center justify-center rounded-sm tabular-nums ${yearCellClass(cell)}`}
                >
                  {cell.day}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
