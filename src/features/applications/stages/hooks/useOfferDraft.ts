import { useCallback, useEffect, useState } from 'react'

/** The structured offer components (Final stage). Strings so partial entry and
 *  currency formatting stay flexible. */
export interface OfferComponents {
  readonly base: string
  readonly bonus: string
  readonly equity: string
  readonly signing: string
  readonly other: string
}

/** A decision factor: how much it matters (weight) and how well this offer
 *  satisfies it (score), each 0–10. */
export interface DecisionFactor {
  readonly key: string
  readonly weight: number
  readonly score: number
}

export interface OfferDraft {
  readonly offer: OfferComponents
  readonly factors: readonly DecisionFactor[]
}

const DEFAULT_FACTOR_KEYS = ['Compensation', 'Tech stack', 'Growth', 'Team', 'Location'] as const

const EMPTY_OFFER: OfferComponents = { base: '', bonus: '', equity: '', signing: '', other: '' }

const EMPTY_DRAFT: OfferDraft = {
  offer: EMPTY_OFFER,
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
      offer: { ...EMPTY_OFFER, ...(p.offer ?? {}) },
      factors: Array.isArray(p.factors) && p.factors.length > 0 ? p.factors : EMPTY_DRAFT.factors,
    }
  } catch {
    return EMPTY_DRAFT
  }
}

/**
 * App-scoped offer + decision-factor state for the Final stage, persisted to
 * localStorage keyed `appoffer:<slug>` — the swap-point to a real offer
 * backend (ADR-0003).
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

  const setOffer = useCallback((patch: Partial<OfferComponents>) => {
    setDraft(prev => ({ ...prev, offer: { ...prev.offer, ...patch } }))
  }, [])

  const setFactor = useCallback((key: string, patch: Partial<Pick<DecisionFactor, 'weight' | 'score'>>) => {
    setDraft(prev => ({
      ...prev,
      factors: prev.factors.map(f => (f.key === key ? { ...f, ...patch } : f)),
    }))
  }, [])

  return { draft, setOffer, setFactor }
}

/** Personal-fit score (0–100): weighted satisfaction across factors. */
export function personalFitScore(factors: readonly DecisionFactor[]): number {
  const maxWeighted = factors.reduce((acc, f) => acc + f.weight * 10, 0)
  if (maxWeighted === 0) return 0
  const weighted = factors.reduce((acc, f) => acc + f.weight * f.score, 0)
  return Math.round((weighted / maxWeighted) * 100)
}
