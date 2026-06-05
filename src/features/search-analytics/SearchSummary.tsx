'use client'

import { Card } from '@/components/ui/Card'
import type { FunnelSummary } from '@/lib/types/applications.types'

interface SearchSummaryProps {
  readonly summary: FunnelSummary
  /** Median days to an offer in the 2026 reference cohort (null when unknown). */
  readonly medianDaysToOffer: number | null
}

/** Pluralise a noun naively (role/roles). */
function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/**
 * Plain-language search summary. Describes where the search stands in honest
 * terms and frames the elapsed days against the typical 2026 search length.
 * No score, no velocity, no "apply more" nudge.
 */
export function SearchSummary({ summary, medianDaysToOffer }: SearchSummaryProps) {
  const { totalApplied, daysSinceFirstApplied, active, advancedPastScreen, reachedFinal, offers } =
    summary

  // The "typical ~108-day 2026 search" framing: prefer the live median when
  // present, otherwise fall back to the documented reference figure.
  const typicalDays = medianDaysToOffer ?? 108

  return (
    <Card className="space-y-3 p-5">
      <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        You&rsquo;ve applied to {plural(totalApplied, 'role')} over{' '}
        {plural(daysSinceFirstApplied, 'day')}. {active} active, {advancedPastScreen} advanced past
        screening, {reachedFinal} reached final, {plural(offers, 'offer')}.
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Day {daysSinceFirstApplied} of the typical ~{typicalDays}-day 2026 search.
      </p>
    </Card>
  )
}
