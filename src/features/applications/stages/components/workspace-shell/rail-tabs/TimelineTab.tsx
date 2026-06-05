'use client'

import { useMemo } from 'react'
import { Clock, GraduationCap, FileText } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { formatRelativeTime } from '@/features/projects/lib/format'
import { STAGE_LABELS } from '@/features/applications/components/ApplicationTypes'

interface TimelineEvent {
  readonly id: string
  readonly label: string
  readonly at: string
  readonly Icon: typeof Clock
}

function deriveTimeline(detail: ApplicationDetail): readonly TimelineEvent[] {
  return [
    { id: 'applied', label: 'Application created', at: detail.createdAt, Icon: FileText },
    {
      id: 'stage',
      label: `Current stage: ${STAGE_LABELS[detail.interviewStage]}`,
      at: detail.updatedAt,
      Icon: GraduationCap,
    },
  ]
}

interface TimelineTabProps {
  readonly detail: ApplicationDetail
}

export function TimelineTab({ detail }: TimelineTabProps) {
  const timeline = useMemo(() => deriveTimeline(detail), [detail])
  const now = new Date()
  return (
    <ol className="space-y-3">
      {timeline.map(event => {
        const { Icon } = event
        return (
          <li key={event.id} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{event.label}</p>
              <p className="text-[10px] text-zinc-500">{formatRelativeTime(event.at, now)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
