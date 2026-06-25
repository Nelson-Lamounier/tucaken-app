/**
 * @format
 * Shared types for the per-user RAG/KB views + user activity panels.
 * Mirrors the admin-api shapes in admin-api/src/lib/repositories/user-rag.ts.
 */
import type { JsonValue } from './profile.types'

/** A synced repository with its RAG metrics (KB-quality + retrieval). */
export interface RepoRagSummary {
  readonly repoFullName: string
  readonly classification: string | null
  readonly extractionStatus: string | null
  readonly syncStatus: string | null
  readonly kbQualityScore: number | null
  readonly kbQualityBreakdown: JsonValue | null
  readonly retrievalScore: number | null
  readonly retrievalBreakdown: JsonValue | null
  readonly chunkCount: number | null
  readonly fileCount: number | null
  readonly embeddedCount: number | null
  readonly lastSyncedAt: string | null
}

/** Aggregate KB-health totals for the user-facing at-a-glance panel. */
export interface KbHealthTotals {
  readonly repoCount: number
  readonly files: number
  readonly chunks: number
  readonly embedded: number
  readonly avgKbQuality: number | null
}

export interface KbHealth {
  readonly repositories: readonly RepoRagSummary[]
  readonly totals: KbHealthTotals
}

/** One day's generated-output counts for the user activity panel. */
export interface DailyActivity {
  readonly date: string // YYYY-MM-DD (UTC)
  readonly applications: number
  readonly resumes: number
}

export interface ActivitySeries {
  readonly days: readonly DailyActivity[]
  readonly totals: { readonly applications: number; readonly resumes: number }
}

/** Admin read of an arbitrary user's readiness diagnostic. */
export interface UserDiagnosticResult {
  readonly diagnostic: import('./profile.types').DiagnosticJson | null
  readonly refreshedAt: string | null
}
