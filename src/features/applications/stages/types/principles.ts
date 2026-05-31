import type { EvidenceStrength, StarStory, StoryTheme } from './workspace'

/**
 * Leadership principles for the Bar Raiser stage (Amazon-style; similar at
 * companies with explicit leadership values). Each maps to the Story Bank
 * themes that evidence it, so coverage reads the user's existing stories
 * rather than introducing a separate tagging system.
 */
export interface LeadershipPrinciple {
  readonly id: string
  readonly name: string
  /** Story themes that count as evidence for this principle. */
  readonly themes: readonly StoryTheme[]
}

export const LEADERSHIP_PRINCIPLES: readonly LeadershipPrinciple[] = [
  { id: 'customer-obsession', name: 'Customer Obsession', themes: ['Customer', 'Impact'] },
  { id: 'ownership', name: 'Ownership', themes: ['Impact', 'Leadership'] },
  { id: 'invent-simplify', name: 'Invent and Simplify', themes: ['Growth', 'Ambiguity'] },
  { id: 'earn-trust', name: 'Earn Trust', themes: ['Conflict', 'Leadership'] },
  { id: 'deliver-results', name: 'Deliver Results', themes: ['Impact'] },
  { id: 'backbone', name: 'Have Backbone; Disagree & Commit', themes: ['Conflict'] },
  { id: 'learn-be-curious', name: 'Learn and Be Curious', themes: ['Growth', 'Failure'] },
  { id: 'bias-for-action', name: 'Bias for Action', themes: ['Ambiguity', 'Impact'] },
]

/** Stories evidencing a principle = those sharing at least one mapped theme. */
export function storiesForPrinciple(
  principle: LeadershipPrinciple,
  stories: readonly StarStory[],
): readonly StarStory[] {
  const themes = new Set<StoryTheme>(principle.themes)
  return stories.filter(s => s.themes.some(t => themes.has(t)))
}

/** Coverage strength from the number of evidencing stories. */
export function coverageStrength(count: number): EvidenceStrength {
  if (count >= 2) return 'strong'
  if (count === 1) return 'moderate'
  return 'none'
}
