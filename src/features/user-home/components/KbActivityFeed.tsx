'use client'

import { FileUp, GitBranch } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { TONE } from '@/components/ui/tone'
import type { Tone } from '@/components/ui/tone'
import type { ConnectedRepo } from '@/lib/types/github.types'
import type { ResumeImportRecord } from '@/server/resume-imports'
import { deriveActivity, formatRelativeTime } from '../lib/activity'
import type { ActivityKind } from '../lib/activity'

const ICONS: Record<ActivityKind, typeof FileUp> = {
  import: FileUp,
  sync: GitBranch,
}

interface KbActivityFeedProps {
  readonly imports: ResumeImportRecord[]
  readonly repos: ConnectedRepo[]
}

export function KbActivityFeed({ imports, repos }: KbActivityFeedProps) {
  const events = deriveActivity(imports, repos)
  // Single clock read per render; passed into the pure formatter.
  const now = Date.now()

  return (
    <Card as="section" className="flex flex-col overflow-hidden">
      <h3 className="border-b border-zinc-200 px-6 py-4 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:border-white/5">
        Recent Activity
      </h3>
      {events.length === 0 ? (
        <p className="px-6 py-6 text-sm text-zinc-500">No activity yet — connect a repo or upload a résumé.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-white/5">
          {events.map(event => {
            const Icon = ICONS[event.kind]
            const tone: Tone = event.tone
            return (
              <li key={event.id} className="flex items-center gap-3 px-6 py-3">
                <Icon className={`size-3.5 shrink-0 ${TONE[tone].dot}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300">{event.text}</span>
                <span className="shrink-0 text-[10px] text-zinc-500">{formatRelativeTime(event.at, now)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
