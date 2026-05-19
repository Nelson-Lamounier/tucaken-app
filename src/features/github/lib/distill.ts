import type { ConnectedRepo } from '@/lib/types/github.types'

/** Repos that earn a Distillation card: real project work only (matches SP0 scope). */
export function selectDistillableRepos(repos: ConnectedRepo[]): ConnectedRepo[] {
  return repos.filter(
    r => r.classification === 'project'
      && r.isHidden !== true
      && r.extractionStatus === 'completed',
  )
}

/** Repo slug → human title: split on - _ . and whitespace, title-case,
 *  but keep all-caps tokens (e.g. "API", "IAM") as-is. */
export function cleanRepoTitle(name: string): string {
  return name
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map(w => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}
