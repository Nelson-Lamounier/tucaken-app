import { useCallback, useEffect, useState } from 'react'
import type { StarStory } from '../types/workspace'

/**
 * The user's STAR Story Bank for an application — app-scoped (shared by the
 * Behavioural and Bar Raiser stages), not per-stage. v1 stories are
 * user-authored and persisted to localStorage keyed `appstories:<slug>`; the
 * single swap-point to a real story backend (ADR-0003, grilling decision:
 * empty + user-authored).
 */
export type StoryDraft = Omit<StarStory, 'id'>

function storageKey(slug: string): string {
  return `appstories:${slug}`
}

function readStories(slug: string): StarStory[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(storageKey(slug))
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StarStory[]) : []
  } catch {
    return []
  }
}

interface UseStoryBank {
  readonly stories: readonly StarStory[]
  readonly addStory: (draft: StoryDraft) => void
  readonly updateStory: (id: string, draft: StoryDraft) => void
  readonly removeStory: (id: string) => void
}

export function useStoryBank(slug: string): UseStoryBank {
  const [stories, setStories] = useState<readonly StarStory[]>(() => readStories(slug))

  useEffect(() => {
    setStories(readStories(slug))
  }, [slug])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey(slug), JSON.stringify(stories))
  }, [slug, stories])

  const addStory = useCallback((draft: StoryDraft) => {
    const story: StarStory = { ...draft, id: crypto.randomUUID() }
    setStories(prev => [...prev, story])
  }, [])

  const updateStory = useCallback((id: string, draft: StoryDraft) => {
    setStories(prev => prev.map(s => (s.id === id ? { ...draft, id } : s)))
  }, [])

  const removeStory = useCallback((id: string) => {
    setStories(prev => prev.filter(s => s.id !== id))
  }, [])

  return { stories, addStory, updateStory, removeStory }
}
