// Resolves the marketing stats band from live platform counts.
//
// Each DB-backed figure (see liveStats) is revealed only once its real count
// clears its floor, so tiny early-stage numbers never surface and undercut the
// proof-not-prose positioning. Static claims (staticStats) are always appended.
import { liveStats, staticStats, type LiveStatKey } from '../content'

export interface DisplayStat {
  value: number
  suffix: string
  label: string
}

export function resolveDisplayStats(
  live: Partial<Record<LiveStatKey, number>> | undefined,
): DisplayStat[] {
  const revealed: DisplayStat[] = liveStats
    .filter((stat) => (live?.[stat.key] ?? 0) >= stat.floor)
    .map((stat) => ({ suffix: stat.suffix, label: stat.label, value: live?.[stat.key] ?? 0 }))
  return [...revealed, ...staticStats]
}
