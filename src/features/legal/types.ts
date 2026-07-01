import type { ReactNode } from 'react'

export type LegalSlug = 'terms' | 'privacy' | 'cookies'

export interface LegalSection {
  /** Stable anchor id, e.g. 'ai-output'. Used by the TOC and deep links. */
  id: string
  heading: string
  body: ReactNode
}

export interface LegalDoc {
  slug: LegalSlug
  title: string
  /** Human-readable date string, rendered as 'Last updated on ...'. */
  lastUpdated: string
  intro?: ReactNode
  sections: LegalSection[]
}
