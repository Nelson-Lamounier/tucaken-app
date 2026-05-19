export interface GitHubInstallation {
  readonly installationId: string
  readonly accountLogin: string
  readonly accountAvatarUrl: string
  readonly repositoryCount: number
  readonly connectedAt: string
}

export interface GitHubAccessibleRepo {
  readonly id: number
  readonly fullName: string
  readonly owner: string
  readonly name: string
  readonly defaultBranch: string
  readonly private: boolean
  readonly updatedAt: string
}

export type RepoSyncStatus = 'pending' | 'syncing' | 'complete' | 'error'

export interface ScoreBreakdown {
  readonly has_readme:    number
  readonly has_manifest:  number
  readonly has_ci:        number
  readonly has_changelog: number
  readonly has_tests:     number
  readonly commit_count:  number
  readonly confidence:    number
}

export type RepoClassification =
  | 'project'
  | 'fork'
  | 'tutorial'
  | 'abandoned'
  | 'noise'
  | 'stale'

export interface ConnectedRepo {
  readonly repoFullName:     string
  readonly owner:            string
  readonly name:             string
  readonly defaultBranch:    string
  readonly syncStatus:       RepoSyncStatus
  readonly lastSyncedAt?:    string
  readonly errorMessage?:    string | null
  readonly pipelineRunId?:   string
  readonly jobName?:         string
  readonly addedAt:          string
  readonly qualityScore?:    number | null
  readonly qualityBreakdown?: ScoreBreakdown | null
  readonly classification?:  RepoClassification | null
  readonly extractionStatus?: string | null
  readonly oneLiner?:        string | null
  readonly domain?:          string | null
  readonly techStack?:       string[] | null
  readonly complexity?:      string | null
  readonly confidence?:      number | null
  readonly highlights?:      string[] | null
  readonly isFeatured?:      boolean
  readonly featureRank?:     number | null
  readonly isHidden?:        boolean
}
