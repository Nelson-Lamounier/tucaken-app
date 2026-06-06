'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Annotation, ItemAnnotations } from '@/lib/types/applications.types'
import { patchApplicationAnnotationsFn } from '@/server/applications'

/** The full per-application annotations map, keyed by insight item id. */
export type AnnotationStore = Record<string, ItemAnnotations>

/** Identifies the item an annotation belongs to (for the section breakdown). */
export interface AnnotationTarget {
  readonly id: string
  readonly label: string
  readonly section?: string
}

export interface AnnotationsApi {
  readonly store: AnnotationStore
  readonly add: (target: AnnotationTarget, text: string) => void
  readonly remove: (itemId: string, noteId: string) => void
}

/** Debounce delay for the RDS PATCH (ms). */
const PATCH_DEBOUNCE_MS = 800

function storageKey(slug: string): string {
  return `appannotations:${slug}`
}

function readLocal(slug: string): AnnotationStore | null {
  if (globalThis.localStorage === undefined) return null
  const raw = globalThis.localStorage.getItem(storageKey(slug))
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) return parsed as AnnotationStore
    return null
  } catch {
    return null
  }
}

/** localStorage wins in-session; the server blob seeds first load on a new device. */
function hydrate(slug: string, server: AnnotationStore | undefined): AnnotationStore {
  return readLocal(slug) ?? server ?? {}
}

/**
 * Application-level annotations: per-item notes (keyed by the insight id) with
 * the section + label for the breakdown view. localStorage is the in-session
 * cache; a debounced PATCH syncs the full blob to RDS (job_applications.
 * user_annotations). One instance per application — lifted into the rail so the
 * Detail and Notes tabs share a single source.
 */
export function useApplicationAnnotations(slug: string, serverState: AnnotationStore | undefined): AnnotationsApi {
  const [store, setStore] = useState<AnnotationStore>(() => hydrate(slug, serverState))
  const lastSyncedRef = useRef<string>(JSON.stringify(hydrate(slug, serverState)))

  // Re-hydrate when the application changes.
  useEffect(() => {
    const next = hydrate(slug, serverState)
    setStore(next)
    lastSyncedRef.current = JSON.stringify(next)
    // serverState intentionally excluded — localStorage is authoritative in-session.
  }, [slug])

  // Persist to localStorage on every change.
  useEffect(() => {
    if (globalThis.localStorage === undefined) return
    globalThis.localStorage.setItem(storageKey(slug), JSON.stringify(store))
  }, [slug, store])

  // Debounced RDS sync.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const snapshot = JSON.stringify(store)
      if (snapshot === lastSyncedRef.current) return
      patchApplicationAnnotationsFn({ data: { slug, annotations: store } })
        .then(() => {
          lastSyncedRef.current = snapshot
        })
        .catch(() => {
          // Best-effort — localStorage remains the cache.
        })
    }, PATCH_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [slug, store])

  const add = useCallback((target: AnnotationTarget, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const note: Annotation = { id: crypto.randomUUID(), text: trimmed, createdAt: new Date().toISOString() }
    setStore(prev => {
      const existing = prev[target.id]
      const item: ItemAnnotations = {
        section: target.section,
        label: target.label,
        notes: [...(existing?.notes ?? []), note],
      }
      return { ...prev, [target.id]: item }
    })
  }, [])

  const remove = useCallback((itemId: string, noteId: string) => {
    setStore(prev => {
      const existing = prev[itemId]
      if (!existing) return prev
      const notes = existing.notes.filter(n => n.id !== noteId)
      const next = { ...prev }
      if (notes.length === 0) {
        delete next[itemId]
      } else {
        next[itemId] = { ...existing, notes }
      }
      return next
    })
  }, [])

  return { store, add, remove }
}
