/**
 * Evidence-quality correlation — pure helpers that join the research agent's
 * retrieval snapshot (`kbRetrievalStats`, semantic RAG) with the deterministic
 * Skill Evidence Ledger (`skillEvidenceLedger`, structural technology_evidence).
 *
 * The two are produced by DIFFERENT mechanisms: a ledger row can be "verified"
 * with code files the RAG retrieval never surfaced. The trustworthy quality
 * signal is the OVERLAP — a verified skill whose cited repo also surfaced in
 * retrieval is double-confirmed (structural + semantic); one cited only by the
 * deterministic index is structurally true but semantically un-retrieved.
 *
 * Pure + framework-free so it can be unit-tested without rendering.
 */

import type {
  KbRetrievalStats,
  SkillEvidenceEntry,
  EvidenceStatus,
  SkillEvidenceLane,
} from '@/lib/types/applications.types'

/** Per-status counts + total, for the coverage rollup. */
export interface LedgerTally {
  readonly verified: number
  readonly transferable: number
  readonly gap: number
  readonly total: number
  /** verified + transferable — JD skills with ANY evidence. */
  readonly withEvidence: number
}

/** Tally a ledger by status. */
export function tallyLedger(ledger: readonly SkillEvidenceEntry[]): LedgerTally {
  let verified = 0
  let transferable = 0
  let gap = 0
  for (const e of ledger) {
    if (e.status === 'verified') verified++
    else if (e.status === 'transferable') transferable++
    else gap++
  }
  return { verified, transferable, gap, total: ledger.length, withEvidence: verified + transferable }
}

/**
 * Extract the `owner/repo` slug from an evidence-file path
 * (`owner/repo/path/to/file.ts` → `owner/repo`). Returns null when the path
 * has fewer than two segments (not a repo-scoped file).
 */
export function repoFromEvidenceFile(path: string): string | null {
  const first = path.indexOf('/')
  if (first === -1) return null
  const second = path.indexOf('/', first + 1)
  if (second === -1) return null
  const owner = path.slice(0, first)
  const repo = path.slice(first + 1, second)
  if (owner.length === 0 || repo.length === 0) return null
  return `${owner}/${repo}`
}

/**
 * Build a repo → retrieved-passage-count map from a retrieval snapshot's
 * `repoBreakdown`. The keys are whatever `repoBreakdown` reports (already
 * `owner/repo` from the agent's `repoOf`). Empty map when there are no stats.
 */
export function retrievalRepoCounts(stats: KbRetrievalStats | undefined): Map<string, number> {
  const map = new Map<string, number>()
  if (!stats) return map
  for (const { repo, count } of stats.repoBreakdown) map.set(repo, count)
  return map
}

/** A ledger entry's repos that also appear in the retrieval snapshot. */
export interface RetrievedRepo {
  readonly repo: string
  readonly count: number
}

/**
 * For one ledger entry, the distinct repos its evidence files cite that ALSO
 * surfaced in retrieval (with their retrieved passage counts). Empty when the
 * entry has no files, no repo-scoped files, or none overlap retrieval.
 */
export function entryRetrievedRepos(
  entry: SkillEvidenceEntry,
  counts: Map<string, number>,
): RetrievedRepo[] {
  if (counts.size === 0 || entry.evidenceFiles.length === 0) return []
  const seen = new Set<string>()
  const out: RetrievedRepo[] = []
  for (const file of entry.evidenceFiles) {
    const repo = repoFromEvidenceFile(file)
    if (!repo || seen.has(repo)) continue
    seen.add(repo)
    const count = counts.get(repo)
    if (count !== undefined) out.push({ repo, count })
  }
  return out
}

/** Overall correlation summary across the ledger ↔ retrieval. */
export interface CorrelationSummary {
  /** verified entries whose cited repo also surfaced in retrieval. */
  readonly verifiedRetrieved: number
  /** total verified entries that cite at least one repo-scoped file. */
  readonly verifiedWithRepos: number
}

/**
 * How many `verified` entries are double-confirmed (cite a repo that also
 * surfaced in retrieval), out of those that cite any repo-scoped file. Drives
 * the one-line quality headline.
 */
export function correlationSummary(
  ledger: readonly SkillEvidenceEntry[],
  counts: Map<string, number>,
): CorrelationSummary {
  let verifiedRetrieved = 0
  let verifiedWithRepos = 0
  for (const e of ledger) {
    if (e.status !== 'verified') continue
    const hasRepo = e.evidenceFiles.some((f) => repoFromEvidenceFile(f) !== null)
    if (!hasRepo) continue
    verifiedWithRepos++
    if (entryRetrievedRepos(e, counts).length > 0) verifiedRetrieved++
  }
  return { verifiedRetrieved, verifiedWithRepos }
}

/** Coverage/retrieval verdict tone keys (mapped to colours in the component). */
export type QualityTone = 'strong' | 'moderate' | 'weak' | 'none'

/** Map a retrieval snapshot to a coarse quality tone (mirrors the KB panel). */
export function retrievalTone(stats: KbRetrievalStats | undefined): QualityTone {
  if (!stats || stats.passageCount === 0) return 'none'
  if (stats.maxCosine >= 0.4) return 'strong'
  if (stats.maxCosine >= 0.25) return 'moderate'
  return 'weak'
}

/** Display label per status (shared with the ledger panel). */
export const STATUS_LABEL: Record<EvidenceStatus, string> = {
  verified: 'Verified',
  transferable: 'Transferable',
  gap: 'Gap',
}

/** Human label per source lane. "career" surfaces as "Résumé" for the user. */
export const LANE_LABEL: Record<SkillEvidenceLane, string> = {
  repo: 'Repos',
  project: 'Projects',
  career: 'Résumé',
}

/** Stable display order for lanes. */
export const LANE_ORDER: readonly SkillEvidenceLane[] = ['repo', 'project', 'career']

/**
 * Count how many ledger entries draw from each lane (an entry with multiple
 * lanes counts toward each). Entries without `sourceLanes` (older runs) are
 * skipped — `hasLanes` reports whether any entry carried lane data at all.
 */
export function tallyLanes(ledger: readonly SkillEvidenceEntry[]): {
  readonly counts: Record<SkillEvidenceLane, number>
  readonly hasLanes: boolean
} {
  const counts: Record<SkillEvidenceLane, number> = { repo: 0, project: 0, career: 0 }
  let hasLanes = false
  for (const e of ledger) {
    if (!e.sourceLanes || e.sourceLanes.length === 0) continue
    hasLanes = true
    for (const lane of e.sourceLanes) counts[lane]++
  }
  return { counts, hasLanes }
}
