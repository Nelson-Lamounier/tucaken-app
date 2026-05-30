/** Score tiers shared by the readiness gauge and the at-a-glance breakdown.
 *  Colour tables carry light + dark variants so panels render in both modes. */
export type Tier = 'high' | 'mid' | 'low'

export function tierOf(score: number): Tier {
  if (score >= 70) return 'high'
  if (score >= 40) return 'mid'
  return 'low'
}

export const TIER_TEXT: Readonly<Record<Tier, string>> = {
  high: 'text-teal-600 dark:text-teal-300',
  mid:  'text-amber-600 dark:text-amber-300',
  low:  'text-rose-600 dark:text-rose-300',
}

export const TIER_BAR: Readonly<Record<Tier, string>> = {
  high: 'bg-teal-500 dark:bg-teal-400',
  mid:  'bg-amber-500 dark:bg-amber-400',
  low:  'bg-rose-500 dark:bg-rose-400',
}

/** SVG stroke colour per tier — used by the radial gauge arc + needle. */
export const TIER_STROKE: Readonly<Record<Tier, string>> = {
  high: 'stroke-teal-500 dark:stroke-teal-400',
  mid:  'stroke-amber-500 dark:stroke-amber-400',
  low:  'stroke-rose-500 dark:stroke-rose-400',
}
