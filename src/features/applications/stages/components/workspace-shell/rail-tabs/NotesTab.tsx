'use client'

import { useMemo } from 'react'
import type { ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { STAGE_LABELS } from '@/features/applications/components/ApplicationTypes'
import { STAGE_ORDER } from '@/features/applications/stages/types/stage'
import { useStageDraft } from '@/features/applications/stages/hooks/useStageDraft'

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

interface NotesTabProps {
  readonly detail: ApplicationDetail
  readonly activeStage: InterviewStage
}

export function NotesTab({ detail, activeStage }: NotesTabProps) {
  const { draft, setNotes } = useStageDraft(detail.slug, activeStage)
  const allNotes = useMemo(() => readAllNotes(detail.slug), [detail.slug, draft.notes])

  return (
    <div className="space-y-4">
      {allNotes.length > 0 && (
        <div className="space-y-2">
          {allNotes.map(n => (
            <div key={n.stage}>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{STAGE_LABELS[n.stage]}</p>
              <p className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">{n.notes}</p>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-zinc-200 pt-4 dark:border-white/10">
        <label htmlFor="quick-note" className="mb-1.5 block text-[11px] font-medium text-zinc-500">
          Note for {STAGE_LABELS[activeStage]}
        </label>
        <textarea
          id="quick-note"
          value={draft.notes}
          onChange={e => setNotes(e.target.value)}
          rows={5}
          placeholder="Auto-saves as you type…"
          className="block w-full rounded-md border-0 bg-zinc-50 p-2 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10"
        />
      </div>
    </div>
  )
}
