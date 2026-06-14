import type { ProjectSummary } from './types'

/**
 * Project lifecycle classification.
 *
 * Every synced repository gets a 1:1 "default" project (single_repo, not
 * AI-suggested, not user-confirmed). The clustering agent then proposes
 * multi-repo groupings (AI-suggested, not yet confirmed), and the user
 * confirms the ones they want (user-confirmed). Manual creation also produces
 * a user-confirmed project. The two booleans give three mutually-exclusive
 * buckets:
 *
 *   - curated   → is_user_confirmed                  (real projects: the grid)
 *   - proposal  → is_ai_suggested && !confirmed      (awaiting review)
 *   - default   → !is_ai_suggested && !confirmed     (raw per-repo default)
 *
 * The Projects index shows ONLY curated projects. Defaults are an internal
 * substrate (they still enrich JD analysis server-side — they never surface as
 * "projects" the user has to manage). Proposals live in the review flow.
 */

/** A user-confirmed project — the only kind shown in the main Projects grid. */
export function isCurated(p: ProjectSummary): boolean {
  return p.is_user_confirmed === true
}

/** An AI-suggested grouping awaiting the user's accept/reject in /projects/review. */
export function isProposal(p: ProjectSummary): boolean {
  return p.is_ai_suggested === true && p.is_user_confirmed === false
}

/**
 * A raw per-repo default project: auto-created 1:1 for a synced repo, never
 * curated. Hidden from the grid; used as the merge *source* when a user
 * integrates a repository into an existing project.
 */
export function isRepoDefault(p: ProjectSummary): boolean {
  return p.is_ai_suggested === false && p.is_user_confirmed === false
}

export interface PartitionedProjects {
  /** User-confirmed projects — rendered in the grid. */
  readonly curated: ProjectSummary[]
  /** AI proposals awaiting review. */
  readonly proposals: ProjectSummary[]
  /** Raw per-repo defaults available to fold into a curated project. */
  readonly defaults: ProjectSummary[]
}

/** Split a project list into the three lifecycle buckets (mutually exclusive). */
export function partitionProjects(items: readonly ProjectSummary[]): PartitionedProjects {
  const curated: ProjectSummary[] = []
  const proposals: ProjectSummary[] = []
  const defaults: ProjectSummary[] = []
  for (const p of items) {
    if (isCurated(p)) curated.push(p)
    else if (isProposal(p)) proposals.push(p)
    else defaults.push(p)
  }
  return { curated, proposals, defaults }
}
