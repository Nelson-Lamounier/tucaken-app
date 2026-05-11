export interface KbRepo {
  syncStatus: 'pending' | 'syncing' | 'complete' | 'error'
}

export interface KbEntry {
  entryType: string
}

export interface KbImport {
  status: string
  careerEntriesCreated: string[]
  embeddingsCreatedCount: number
}

export interface KbStats {
  repoCount: number
  syncedRepoCount: number
  pendingRepoCount: number
  careerEntryCount: number
  experienceCount: number
  educationCount: number
  skillCount: number
  importCount: number
  processedImportCount: number
  failedImportCount: number
  isReady: boolean
}

export function deriveKbStats(
  repos: KbRepo[],
  entries: KbEntry[],
  imports: KbImport[],
): KbStats {
  const syncedRepoCount = repos.filter(r => r.syncStatus === 'complete').length
  const pendingRepoCount = repos.filter(
    r => r.syncStatus === 'pending' || r.syncStatus === 'syncing',
  ).length
  const processedImportCount = imports.filter(
    i => i.status === 'completed' || i.status === 'ready_for_review',
  ).length
  const failedImportCount = imports.filter(i => i.status === 'failed').length

  return {
    repoCount: repos.length,
    syncedRepoCount,
    pendingRepoCount,
    careerEntryCount: entries.length,
    experienceCount: entries.filter(e => e.entryType === 'experience').length,
    educationCount: entries.filter(e => e.entryType === 'education').length,
    skillCount: entries.filter(e => e.entryType === 'skill').length,
    importCount: imports.length,
    processedImportCount,
    failedImportCount,
    isReady: syncedRepoCount >= 1 || processedImportCount >= 1,
  }
}
