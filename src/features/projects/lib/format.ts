const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year',   60 * 60 * 24 * 365],
  ['month',  60 * 60 * 24 * 30],
  ['week',   60 * 60 * 24 * 7],
  ['day',    60 * 60 * 24],
  ['hour',   60 * 60],
  ['minute', 60],
]

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/**
 * URL-safe slug from free text. Matches admin-api's SLUG_REGEX
 * (^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$): lowercase, hyphen-separated,
 * 1-80 chars, no leading/trailing hyphen.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

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
