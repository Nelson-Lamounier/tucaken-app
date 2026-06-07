/** Knowledge-base health types — composition of the user's pgvector store. */

/** Per-repo embedding composition. */
export interface KbRepoComposition {
  readonly repo: string
  readonly chunks: number
  readonly files: number
}

/** KB composition summary returned by GET /api/admin/kb/health. */
export interface KbHealth {
  readonly totalChunks: number
  readonly totalFiles: number
  readonly repoCount: number
  readonly repos: readonly KbRepoComposition[]
}
