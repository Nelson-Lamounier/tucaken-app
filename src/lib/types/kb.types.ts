/** Knowledge-base health types — composition of the user's pgvector store. */

/** Per-repo embedding composition. */
export interface KbRepoComposition {
  readonly repo: string
  readonly chunks: number
  readonly files: number
}

/** A technology detected across the user's repos (from technology_evidence). */
export interface KbTechnology {
  readonly name: string
  readonly ecosystem: string | null
  readonly occurrences: number
}

/** KB composition summary returned by GET /api/admin/kb/health. */
export interface KbHealth {
  readonly totalChunks: number
  readonly totalFiles: number
  readonly repoCount: number
  readonly repos: readonly KbRepoComposition[]
  /** Top technologies by evidence count (deterministic tech-extractor pipeline). */
  readonly technologies?: readonly KbTechnology[]
  readonly technologyCount?: number
}
