import { RefreshCw, FolderOpen } from 'lucide-react'
import { EvidenceCard } from './EvidenceCard'
import type { EvidenceTopic } from '../types/workspace'

interface TopicCardProps {
  readonly topic: EvidenceTopic
  /** Opens a concept-summary modal (stub in v1). */
  readonly onQuickRefresh?: (topicId: string) => void
  /** Deep-links to the user's projects (stub/handled by parent). */
  readonly onViewProjects?: (topicId: string) => void
}

const ACTION_CLASS =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5'

/**
 * Technical-topic wrapper around EvidenceCard, adding topic-specific actions.
 * See the Topic Card term in src/features/applications/CONTEXT.md.
 */
export function TopicCard({ topic, onQuickRefresh, onViewProjects }: TopicCardProps) {
  return (
    <EvidenceCard
      topic={topic}
      actions={
        <>
          {onQuickRefresh && (
            <button type="button" className={ACTION_CLASS} onClick={() => onQuickRefresh(topic.id)}>
              <RefreshCw className="size-3.5" aria-hidden />
              Quick refresh
            </button>
          )}
          {onViewProjects && (
            <button type="button" className={ACTION_CLASS} onClick={() => onViewProjects(topic.id)}>
              <FolderOpen className="size-3.5" aria-hidden />
              View your projects
            </button>
          )}
        </>
      }
    />
  )
}
