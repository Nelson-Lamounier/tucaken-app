import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { InterviewStage } from '@/lib/types/applications.types'
import { adminKeys } from '@/lib/api/query-keys'
import { patchStageFn } from '@/server/pipelines'

/**
 * Per-stage interactive state persisted to localStorage (primary cache) and
 * synced to RDS via PATCH /stages/:stage (secondary, debounced). The hook
 * hydrates from the server's user_state on first load, then treats localStorage
 * as the authoritative in-session store. See ADR-0003 and CONTEXT.md.
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
  /** User's saved comp target (Phone Screen comp conversation). */
  readonly compTarget: string
}

const EMPTY_DRAFT: StageDraft = {
  notes: '',
  checkedItems: [],
  selectedStoryIds: [],
  scheduleAt: '',
  formatNote: '',
  compTarget: '',
}

/** Debounce delay for RDS PATCH (ms). */
const PATCH_DEBOUNCE_MS = 800

function storageKey(slug: string, stage: InterviewStage): string {
  return `appstage:${slug}:${stage}`
}

function readDraft(slug: string, stage: InterviewStage): StageDraft | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(storageKey(slug, stage))
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    return { ...EMPTY_DRAFT, ...(parsed as Partial<StageDraft>) }
  } catch {
    return null
  }
}

function mergeDraft(
  local: StageDraft | null,
  server: Partial<StageDraft> | undefined,
): StageDraft {
  // Server value is authoritative on first load; localStorage wins in-session.
  // If localStorage has data (user was editing), prefer it. Otherwise use server.
  if (local !== null) return local
  if (server) return { ...EMPTY_DRAFT, ...server }
  return EMPTY_DRAFT
}

interface UseStageDraft {
  readonly draft: StageDraft
  readonly setNotes: (notes: string) => void
  readonly toggleChecked: (id: string) => void
  readonly toggleStory: (id: string) => void
  readonly setSchedule: (patch: Partial<Pick<StageDraft, 'scheduleAt' | 'formatNote'>>) => void
  /** Merge any scalar draft fields (e.g. compTarget). */
  readonly patch: (patch: Partial<StageDraft>) => void
}

export function useStageDraft(
  slug: string,
  stage: InterviewStage,
  initialUserState?: Partial<StageDraft>,
): UseStageDraft {
  const queryClient = useQueryClient()

  const [draft, setDraft] = useState<StageDraft>(() =>
    mergeDraft(readDraft(slug, stage), initialUserState),
  )

  // Tracks the last successfully synced snapshot to avoid PATCH storms.
  // Initialized to the hydrated draft so the first effect run is a no-op.
  const lastSyncedRef = useRef<string>(
    JSON.stringify(mergeDraft(readDraft(slug, stage), initialUserState)),
  )
  // Tracks the previous scheduleAt so we can detect the empty→non-empty transition.
  const prevScheduleAtRef = useRef<string>(
    mergeDraft(readDraft(slug, stage), initialUserState).scheduleAt,
  )

  // Re-hydrate when slug/stage changes (navigating between active stages).
  // Prefer localStorage if present; fall back to server state.
  useEffect(() => {
    const hydrated = mergeDraft(readDraft(slug, stage), initialUserState)
    setDraft(hydrated)
    // Reset sync refs so the newly-hydrated draft isn't considered already synced.
    lastSyncedRef.current = JSON.stringify(hydrated)
    prevScheduleAtRef.current = hydrated.scheduleAt
    // initialUserState intentionally excluded: server value is only used when
    // localStorage is absent; we don't want to overwrite in-session edits.
  }, [slug, stage])

  // When the server provides a fresh initialUserState and localStorage is empty,
  // hydrate (e.g. opening the page for the first time on a new device).
  const prevServerStateRef = useRef(initialUserState)
  useEffect(() => {
    if (initialUserState === prevServerStateRef.current) return
    prevServerStateRef.current = initialUserState
    const local = readDraft(slug, stage)
    if (local === null && initialUserState) {
      setDraft({ ...EMPTY_DRAFT, ...initialUserState })
    }
  }, [initialUserState, slug, stage])

  // Persist to localStorage on every draft change.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey(slug, stage), JSON.stringify(draft))
  }, [slug, stage, draft])

  // Debounced RDS PATCH — fires 800ms after the last draft change.
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (patchTimerRef.current) clearTimeout(patchTimerRef.current)
    patchTimerRef.current = setTimeout(() => {
      const snapshot = JSON.stringify(draft)
      // Skip PATCH if nothing has changed since the last successful sync.
      if (snapshot === lastSyncedRef.current) return

      // Cast to Record<string, unknown> — patchStageFn accepts z.record(z.any())
      const userState = draft as unknown as Record<string, unknown>
      void patchStageFn({
        data: { slug, stage, userState, scheduleAt: draft.scheduleAt || null },
      })
        .then(() => {
          lastSyncedRef.current = snapshot

          // Only invalidate when scheduleAt just transitioned empty → non-empty,
          // i.e. a coach dispatch happened server-side. Plain notes/checklist syncs
          // must not trigger a refetch.
          const wasEmpty = !prevScheduleAtRef.current
          const isNowSet = Boolean(draft.scheduleAt)
          prevScheduleAtRef.current = draft.scheduleAt
          if (wasEmpty && isNowSet) {
            void queryClient.invalidateQueries({
              queryKey: adminKeys.applications.detail(slug),
            })
          }
        })
        .catch(() => {
          // Swallow — localStorage remains the cache; server sync is best-effort.
        })
    }, PATCH_DEBOUNCE_MS)
    return () => {
      if (patchTimerRef.current) clearTimeout(patchTimerRef.current)
    }
  }, [slug, stage, draft, queryClient])

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

  const patch = useCallback((p: Partial<StageDraft>) => {
    setDraft(prev => ({ ...prev, ...p }))
  }, [])

  const setSchedule = useCallback(
    (p: Partial<Pick<StageDraft, 'scheduleAt' | 'formatNote'>>) => {
      setDraft(prev => ({ ...prev, ...p }))
    },
    [],
  )

  return { draft, setNotes, toggleChecked, toggleStory, setSchedule, patch }
}
