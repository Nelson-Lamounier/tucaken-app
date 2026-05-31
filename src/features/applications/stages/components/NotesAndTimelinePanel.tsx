'use client'

import { useMemo, useState } from 'react'
import { Clock, GraduationCap, FileText, PanelRightClose, PanelRightOpen } from 'lucide-react'
import type { ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { formatRelativeTime } from '@/features/projects/lib/format'
import { STAGE_LABELS } from '../../components/ApplicationTypes'
import { STAGE_ORDER } from '../types/stage'
import { useStageDraft } from '../hooks/useStageDraft'

const PANEL_OPEN_KEY = 'appstage:notes-panel-open'

interface TimelineEvent {
  readonly id: string
  readonly label: string
  readonly at: string
  readonly Icon: typeof Clock
}

/** Derived timeline — synthesized from the timestamps we already have. There is
 *  no stored event log (see the Activity-derived pattern in the KB glossary). */
function deriveTimeline(detail: ApplicationDetail): readonly TimelineEvent[] {
  const events: TimelineEvent[] = [
    { id: 'applied', label: 'Application created', at: detail.createdAt, Icon: FileText },
    {
      id: 'stage',
      label: `Current stage: ${STAGE_LABELS[detail.interviewStage]}`,
      at: detail.updatedAt,
      Icon: GraduationCap,
    },
  ]
  return events
}

/** Read every stage's saved notes straight from localStorage for the aggregate. */
function readAllNotes(slug: string): readonly { stage: InterviewStage; notes: string }[] {
  if (typeof window === 'undefined') return []
  const out: { stage: InterviewStage; notes: string }[] = []
  for (const stage of STAGE_ORDER) {
    const raw = window.localStorage.getItem(`appstage:${slug}:${stage}`)
    if (!raw) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) {
        const notes = (parsed as { notes?: unknown }).notes
        if (typeof notes === 'string' && notes.trim()) out.push({ stage, notes })
      }
    } catch {
      // skip malformed entry
    }
  }
  return out
}

interface NotesAndTimelinePanelProps {
  readonly detail: ApplicationDetail
  /** The Active Stage — quick-add notes auto-tag to it. */
  readonly activeStage: InterviewStage
}

/**
 * Persistent panel: a derived Timeline plus stage-tagged Notes. Quick-add
 * auto-tags to the Active Stage. Panel open/closed state persists per user.
 * See src/features/applications/CONTEXT.md.
 */
export function NotesAndTimelinePanel({ detail, activeStage }: NotesAndTimelinePanelProps) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(PANEL_OPEN_KEY) !== 'false'
  })
  const { draft, setNotes } = useStageDraft(detail.slug, activeStage)

  const timeline = useMemo(() => deriveTimeline(detail), [detail])
  // Re-read aggregate whenever the active draft notes change (covers edits).
  const allNotes = useMemo(() => readAllNotes(detail.slug), [detail.slug, draft.notes])
  const now = new Date()

  function toggle() {
    setOpen(prev => {
      const next = !prev
      if (typeof window !== 'undefined') window.localStorage.setItem(PANEL_OPEN_KEY, String(next))
      return next
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Open notes & timeline"
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/2 dark:text-zinc-400 dark:hover:bg-white/5"
      >
        <PanelRightOpen className="size-4" aria-hidden />
        Notes
      </button>
    )
  }

  return (
    <aside className="flex w-full flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/2 lg:w-80">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Timeline & Notes</h3>
        <button type="button" onClick={toggle} aria-label="Collapse panel" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5">
          <PanelRightClose className="size-4" aria-hidden />
        </button>
      </div>

      {/* Timeline */}
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

      {/* Saved notes across stages */}
      {allNotes.length > 0 && (
        <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-white/10">
          {allNotes.map(n => (
            <div key={n.stage}>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{STAGE_LABELS[n.stage]}</p>
              <p className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">{n.notes}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quick add — auto-tags to the active stage */}
      <div className="border-t border-zinc-200 pt-4 dark:border-white/10">
        <label htmlFor="quick-note" className="mb-1.5 block text-[11px] font-medium text-zinc-500">
          Note for {STAGE_LABELS[activeStage]}
        </label>
        <textarea
          id="quick-note"
          value={draft.notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          placeholder="Auto-saves as you type…"
          className="block w-full rounded-md border-0 bg-zinc-50 p-2 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10"
        />
      </div>
    </aside>
  )
}
