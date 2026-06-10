import { useCallback, useEffect, useState } from 'react'

/** A decision factor: how much it matters (weight) and how well this offer
 *  satisfies it (score), each 0–10. */
export interface DecisionFactor {
  readonly key: string
  readonly weight: number
  readonly score: number
}

export interface OfferDraft {
  readonly factors: readonly DecisionFactor[]
}

const DEFAULT_FACTOR_KEYS = ['Compensation', 'Tech stack', 'Growth', 'Team', 'Location'] as const

const EMPTY_DRAFT: OfferDraft = {
  factors: DEFAULT_FACTOR_KEYS.map(key => ({ key, weight: 5, score: 5 })),
}

function storageKey(slug: string): string {
  return `appoffer:${slug}`
}

function readDraft(slug: string): OfferDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT
  const raw = window.localStorage.getItem(storageKey(slug))
  if (!raw) return EMPTY_DRAFT
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_DRAFT
    const p = parsed as Partial<OfferDraft>
    return {
      factors: Array.isArray(p.factors) && p.factors.length > 0 ? p.factors : EMPTY_DRAFT.factors,
    }
  } catch {
    return EMPTY_DRAFT
  }
}

/**
 * App-scoped decision-factor state for the Final stage, persisted to localStorage
 * keyed `appoffer:<slug>`. Compensation figures are intentionally NOT collected or
 * stored (PII / contract compliance) — only the personal-fit factor weights. The
 * persist step rewrites `{ factors }`, so any legacy stored offer figures are
 * cleared on next visit.
 */
export function useOfferDraft(slug: string) {
  const [draft, setDraft] = useState<OfferDraft>(() => readDraft(slug))

  useEffect(() => {
    setDraft(readDraft(slug))
  }, [slug])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey(slug), JSON.stringify(draft))
  }, [slug, draft])

  const setFactor = useCallback((key: string, patch: Partial<Pick<DecisionFactor, 'weight' | 'score'>>) => {
    setDraft(prev => ({
      ...prev,
      factors: prev.factors.map(f => (f.key === key ? { ...f, ...patch } : f)),
    }))
  }, [])

  return { draft, setFactor }
}

/** Personal-fit score (0–100): weighted satisfaction across factors. */
export function personalFitScore(factors: readonly DecisionFactor[]): number {
  const maxWeighted = factors.reduce((acc, f) => acc + f.weight * 10, 0)
  if (maxWeighted === 0) return 0
  const weighted = factors.reduce((acc, f) => acc + f.weight * f.score, 0)
  return Math.round((weighted / maxWeighted) * 100)
}
