'use client'

import { useState } from 'react'
import { ChevronDown, Play } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { StarStory } from '../types/workspace'

interface StoryCardProps {
  readonly story: StarStory
  /** "Practice telling this" — opens a rehearsal flow (stub in v1). */
  readonly onPractice?: (id: string) => void
}

type StarField = 'situation' | 'task' | 'action' | 'result'
const STAR_ROWS: readonly { key: StarField; label: string }[] = [
  { key: 'situation', label: 'Situation' },
  { key: 'task', label: 'Task' },
  { key: 'action', label: 'Action' },
  { key: 'result', label: 'Result' },
]

/**
 * STAR-formatted story card with theme chips. Expandable to reveal the full
 * Situation/Task/Action/Result breakdown. See the Story term in
 * src/features/applications/CONTEXT.md.
 */
export function StoryCard({ story, onPractice }: StoryCardProps) {
  const [open, setOpen] = useState(false)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{story.title}</h4>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {story.themes.map(theme => (
              <span
                key={theme}
                className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-white/5 dark:text-zinc-400"
              >
                {theme}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="shrink-0 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5"
        >
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          <span className="sr-only">{open ? 'Collapse' : 'Expand'} story</span>
        </button>
      </div>

      {open && (
        <dl className="mt-3 space-y-2">
          {STAR_ROWS.map(row => (
            <div key={row.key}>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{row.label}</dt>
              <dd className="text-sm text-zinc-700 dark:text-zinc-300">{story[row.key]}</dd>
            </div>
          ))}
        </dl>
      )}

      {onPractice && (
        <button
          type="button"
          onClick={() => onPractice(story.id)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          <Play className="size-3.5" aria-hidden />
          Practice telling this
        </button>
      )}
    </Card>
  )
}
