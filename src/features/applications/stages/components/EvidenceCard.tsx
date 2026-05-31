import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Card } from '@/components/ui/Card'
import { EvidenceIndicator } from './EvidenceIndicator'
import type { EvidenceTopic } from '../types/workspace'

interface EvidenceCardProps {
  readonly topic: EvidenceTopic
  /** Optional action area (e.g. "Quick refresh", "View your projects"). */
  readonly actions?: ReactNode
}

/**
 * A topic claim grounded in the user's work: title + Evidence Indicator +
 * plain-text summary + project deep-links, with "Be honest" guidance for gaps.
 * See the Evidence Card term in src/features/applications/CONTEXT.md.
 */
export function EvidenceCard({ topic, actions }: EvidenceCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{topic.title}</h4>
        <EvidenceIndicator strength={topic.strength} />
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">{topic.summary}</p>

      {topic.projectRefs.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Reference your:</span>
          {topic.projectRefs.map((ref, i) => (
            <span key={ref.id}>
              <Link to="/projects/$id" params={{ id: ref.id }} className="font-medium text-accent hover:underline">
                {ref.title}
              </Link>
              {i < topic.projectRefs.length - 1 && <span aria-hidden>,</span>}
            </span>
          ))}
        </p>
      )}

      {topic.strength === 'none' && topic.beHonest && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
          <span className="font-semibold">Be honest:</span> {topic.beHonest}
        </p>
      )}

      {actions && <div className="mt-auto flex flex-wrap gap-2 pt-1">{actions}</div>}
    </Card>
  )
}
