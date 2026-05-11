import { describe, it, expect } from 'vitest'
import { deriveKbStats } from '@/features/user-home/lib/kb-stats'

describe('deriveKbStats', () => {
  const repo = (status: 'pending' | 'syncing' | 'complete' | 'error') =>
    ({ syncStatus: status })
  const entry = (type: string) => ({ entryType: type })
  const imp = (status: string, entries = 0) =>
    ({ status, careerEntriesCreated: new Array(entries).fill('id'), embeddingsCreatedCount: 0 })

  it('counts repos by sync status', () => {
    const result = deriveKbStats(
      [repo('complete'), repo('syncing'), repo('error'), repo('pending')],
      [],
      [],
    )
    expect(result.repoCount).toBe(4)
    expect(result.syncedRepoCount).toBe(1)
    expect(result.pendingRepoCount).toBe(2)
  })

  it('counts career entries by type', () => {
    const result = deriveKbStats([], [
      entry('experience'), entry('experience'),
      entry('education'),
      entry('skill'), entry('skill'), entry('skill'),
    ], [])
    expect(result.careerEntryCount).toBe(6)
    expect(result.experienceCount).toBe(2)
    expect(result.educationCount).toBe(1)
    expect(result.skillCount).toBe(3)
  })

  it('counts imports by status', () => {
    const result = deriveKbStats([], [], [
      imp('completed'), imp('ready_for_review'),
      imp('failed'),
      imp('parsing'),
    ])
    expect(result.importCount).toBe(4)
    expect(result.processedImportCount).toBe(2)
    expect(result.failedImportCount).toBe(1)
  })

  it('isReady true when at least one repo is synced', () => {
    const result = deriveKbStats([repo('complete')], [], [])
    expect(result.isReady).toBe(true)
  })

  it('isReady true when at least one import is processed', () => {
    const result = deriveKbStats([], [], [imp('completed')])
    expect(result.isReady).toBe(true)
  })

  it('isReady false when no repos synced and no imports processed', () => {
    const result = deriveKbStats([repo('pending')], [], [imp('parsing')])
    expect(result.isReady).toBe(false)
  })

  it('isReady false on empty data', () => {
    const result = deriveKbStats([], [], [])
    expect(result.isReady).toBe(false)
  })
})
