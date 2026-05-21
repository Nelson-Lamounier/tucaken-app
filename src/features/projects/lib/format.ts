const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year',   60 * 60 * 24 * 365],
  ['month',  60 * 60 * 24 * 30],
  ['week',   60 * 60 * 24 * 7],
  ['day',    60 * 60 * 24],
  ['hour',   60 * 60],
  ['minute', 60],
]

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never'
  const then    = new Date(iso)
  const seconds = (then.getTime() - now.getTime()) / 1000
  for (const [unit, secInUnit] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= secInUnit || unit === 'minute') {
      return RTF.format(Math.round(seconds / secInUnit), unit)
    }
  }
  return RTF.format(0, 'minute')
}
