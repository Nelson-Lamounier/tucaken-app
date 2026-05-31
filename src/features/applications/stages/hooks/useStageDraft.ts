import { useCallback, useEffect, useState } from 'react'
import type { InterviewStage } from '@/lib/types/applications.types'

/**
 * Per-stage interactive state not yet backed by an API (notes, checklist ticks,
 * story selections, offer edits, decision weights). Persisted to localStorage
 * in v1 behind this single hook — the one swap-point to a future
 * `PATCH /stages/:stage`. See ADR-0003 and src/features/applications/CONTEXT.md.
 */
export interface StageDraft {
  /** Free-form "after the round" notes (auto-saved). */
  readonly notes: string
  /** Checklist entry ids the user has ticked. */
  readonly checkedItems: readonly string[]
  /** Story ids the user has selected for this stage. */
  readonly selectedStoryIds: readonly string[]
  /** Scheduled date/time of the round (datetime-local string). */
  readonly scheduleAt: string
  /** Free-text format breakdown (e.g. "30m coding + 30m systems"). */
  readonly formatNote: string
}

const EMPTY_DRAFT: StageDraft = {
  notes: '',
  checkedItems: [],
  selectedStoryIds: [],
  scheduleAt: '',
  formatNote: '',
}

function storageKey(slug: string, stage: InterviewStage): string {
  return `appstage:${slug}:${stage}`
}

function readDraft(slug: string, stage: InterviewStage): StageDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT
  const raw = window.localStorage.getItem(storageKey(slug, stage))
  if (!raw) return EMPTY_DRAFT
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_DRAFT
    return { ...EMPTY_DRAFT, ...(parsed as Partial<StageDraft>) }
  } catch {
    return EMPTY_DRAFT
  }
}

interface UseStageDraft {
  readonly draft: StageDraft
  readonly setNotes: (notes: string) => void
  readonly toggleChecked: (id: string) => void
  readonly toggleStory: (id: string) => void
  readonly setSchedule: (patch: Partial<Pick<StageDraft, 'scheduleAt' | 'formatNote'>>) => void
}

export function useStageDraft(slug: string, stage: InterviewStage): UseStageDraft {
  const [draft, setDraft] = useState<StageDraft>(() => readDraft(slug, stage))

  // Re-hydrate when slug/stage changes (navigating between Active Stages).
  useEffect(() => {
    setDraft(readDraft(slug, stage))
  }, [slug, stage])

  // Persist on every change.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey(slug, stage), JSON.stringify(draft))
  }, [slug, stage, draft])

  const setNotes = useCallback((notes: string) => {
    setDraft(prev => ({ ...prev, notes }))
  }, [])

  const toggleId = (list: readonly string[], id: string): string[] =>
    list.includes(id) ? list.filter(x => x !== id) : [...list, id]

  const toggleChecked = useCallback((id: string) => {
    setDraft(prev => ({ ...prev, checkedItems: toggleId(prev.checkedItems, id) }))
  }, [])

  const toggleStory = useCallback((id: string) => {
    setDraft(prev => ({ ...prev, selectedStoryIds: toggleId(prev.selectedStoryIds, id) }))
  }, [])

  const setSchedule = useCallback(
    (patch: Partial<Pick<StageDraft, 'scheduleAt' | 'formatNote'>>) => {
      setDraft(prev => ({ ...prev, ...patch }))
    },
    [],
  )

  return { draft, setNotes, toggleChecked, toggleStory, setSchedule }
}
