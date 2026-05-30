import type { ConnectedRepo } from '@/lib/types/github.types'
import type { ResumeImportRecord } from '@/server/resume-imports'

export type ActivityTone = 'good' | 'warn' | 'muted'
export type ActivityKind = 'import' | 'sync'

export interface ActivityEvent {
  readonly id: string
  readonly kind: ActivityKind
  readonly text: string
  /** epoch ms; events with an unparseable timestamp are dropped */
  readonly at: number
  readonly tone: ActivityTone
}

const PROCESSED_STATUSES = new Set(['completed', 'ready_for_review'])

/** Synthesize a recent-activity list from timestamps already on hand — résumé
 *  imports and repo syncs. There is no stored event log; this is derived. */
export function deriveActivity(
  imports: readonly ResumeImportRecord[],
  repos: readonly ConnectedRepo[],
  limit = 6,
): ActivityEvent[] {
  const events: ActivityEvent[] = []

  for (const imp of imports) {
    const at = Date.parse(imp.createdAt)
    if (Number.isNaN(at)) continue
    let tone: ActivityTone = 'muted'
    if (imp.status === 'failed') tone = 'warn'
    else if (PROCESSED_STATUSES.has(imp.status)) tone = 'good'
    events.push({
      id: `import-${imp.id}`,
      kind: 'import',
      text: `Imported ${imp.originalFilename}`,
      at,
      tone,
    })
  }

  for (const repo of repos) {
    if (!repo.lastSyncedAt) continue
    const at = Date.parse(repo.lastSyncedAt)
    if (Number.isNaN(at)) continue
    events.push({
      id: `sync-${repo.repoFullName}`,
      kind: 'sync',
      text: `Synced ${repo.name}`,
      at,
      tone: repo.syncStatus === 'error' ? 'warn' : 'good',
    })
  }

  return events.sort((a, b) => b.at - a.at).slice(0, limit)
}

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "2h ago" style label. `now` is injected so it stays pure/testable. */
export function formatRelativeTime(at: number, now: number): string {
  const diff = at - now
  const abs = Math.abs(diff)
  for (const [unit, ms] of UNITS) {
    if (abs >= ms) return RTF.format(Math.round(diff / ms), unit)
  }
  return RTF.format(Math.round(diff / 1000), 'second')
}
