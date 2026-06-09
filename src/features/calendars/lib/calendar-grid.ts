import { localDateKey, type CalendarEvent } from '../api/scheduled-interviews'

/** One day cell in a month/week grid. */
export interface DayCell {
  /** `YYYY-MM-DD` local key. */
  readonly date: string
  /** Day-of-month number. */
  readonly day: number
  readonly isCurrentMonth: boolean
  readonly isToday: boolean
  readonly events: readonly CalendarEvent[]
}

/** Group events by their local day key. */
export function groupByDate(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const bucket = map.get(event.date)
    if (bucket) bucket.push(event)
    else map.set(event.date, [event])
  }
  return map
}

/** Monday-based weekday index (0 = Mon … 6 = Sun). */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

/** Add `n` days to a date (local). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** First cell of a month grid — the Monday on/before the 1st. */
function monthGridStart(ref: Date): Date {
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1)
  return addDays(first, -mondayIndex(first))
}

/**
 * Six-week (42-cell), Monday-start month grid for `ref`'s month, with each day's
 * events attached. `today` flags the current day.
 */
export function buildMonthGrid(ref: Date, events: readonly CalendarEvent[], today: Date): DayCell[] {
  const byDate = groupByDate(events)
  const start = monthGridStart(ref)
  const todayKey = localDateKey(today)
  const cells: DayCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i)
    const key = localDateKey(d)
    cells.push({
      date: key,
      day: d.getDate(),
      isCurrentMonth: d.getMonth() === ref.getMonth(),
      isToday: key === todayKey,
      events: byDate.get(key) ?? [],
    })
  }
  return cells
}

/** The seven days (Mon→Sun) of the week containing `ref`. */
export function buildWeekDays(ref: Date, events: readonly CalendarEvent[], today: Date): DayCell[] {
  const byDate = groupByDate(events)
  const start = addDays(ref, -mondayIndex(ref))
  const todayKey = localDateKey(today)
  const cells: DayCell[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i)
    const key = localDateKey(d)
    cells.push({
      date: key,
      day: d.getDate(),
      isCurrentMonth: d.getMonth() === ref.getMonth(),
      isToday: key === todayKey,
      events: byDate.get(key) ?? [],
    })
  }
  return cells
}

/** Events on a single day, sorted by time. */
export function eventsOnDay(ref: Date, events: readonly CalendarEvent[]): CalendarEvent[] {
  const key = localDateKey(ref)
  return events.filter(e => e.date === key).sort((a, b) => a.datetime.localeCompare(b.datetime))
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "January 2026" */
export function monthLabel(ref: Date): string {
  return `${MONTHS[ref.getMonth()]} ${String(ref.getFullYear())}`
}

/** "Jun 8" from a `YYYY-MM-DD` key. */
export function shortDate(key: string): string {
  const [, m, d] = key.split('-')
  return `${MONTHS[Number(m) - 1].slice(0, 3)} ${String(Number(d))}`
}

/** "Mon 8 – 14, 2026" from a week's day cells. */
export function weekLabel(days: readonly DayCell[]): string {
  const first = days.at(0)
  const last = days.at(-1)
  if (!first || !last) return ''
  return `${shortDate(first.date)} – ${shortDate(last.date)}, ${last.date.split('-')[0]}`
}

/** "Monday, June 9, 2026" */
export function longDayLabel(ref: Date): string {
  return `${WEEKDAY_NAMES[ref.getDay()]}, ${MONTHS[ref.getMonth()]} ${String(ref.getDate())}, ${String(ref.getFullYear())}`
}
