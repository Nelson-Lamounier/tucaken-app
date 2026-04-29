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

export interface ConnectedRepo {
  readonly repoFullName: string
  readonly owner: string
  readonly name: string
  readonly defaultBranch: string
  readonly syncStatus: RepoSyncStatus
  readonly lastSyncedAt?: string
  readonly pipelineRunId?: string
  readonly jobName?: string
  readonly addedAt: string
}
