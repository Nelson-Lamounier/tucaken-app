import { describe, it, expect } from 'vitest'
import type { ConnectedRepo } from '@/lib/types/github.types'
import type { ResumeImportRecord } from '@/server/resume-imports'
import { deriveActivity, formatRelativeTime } from '@/features/user-home/lib/activity'

function importRec(over: Partial<ResumeImportRecord>): ResumeImportRecord {
  return {
    id: 'imp-1',
    status: 'completed',
    statusMessage: null,
    careerEntriesCreated: [],
    embeddingsCreatedCount: 0,
    originalFilename: 'cv.pdf',
    createdAt: '2026-05-01T00:00:00.000Z',
    ...over,
  } as ResumeImportRecord
}

function repoRec(over: Partial<ConnectedRepo>): ConnectedRepo {
  return {
    repoFullName: 'nelson/app',
    name: 'app',
    syncStatus: 'complete',
    lastSyncedAt: '2026-05-02T00:00:00.000Z',
    ...over,
  } as ConnectedRepo
}

describe('deriveActivity', () => {
  it('merges imports and repo syncs, newest first', () => {
    const events = deriveActivity(
      [importRec({ id: 'a', createdAt: '2026-05-01T00:00:00.000Z' })],
      [repoRec({ repoFullName: 'n/b', name: 'b', lastSyncedAt: '2026-05-03T00:00:00.000Z' })],
    )
    expect(events.map(e => e.kind)).toEqual(['sync', 'import'])
  })

  it('maps status to tone', () => {
    const [failed, ok] = deriveActivity(
      [
        importRec({ id: 'f', status: 'failed', createdAt: '2026-05-09T00:00:00.000Z' }),
        importRec({ id: 'o', status: 'completed', createdAt: '2026-05-08T00:00:00.000Z' }),
      ],
      [],
    )
    expect(failed.tone).toBe('warn')
    expect(ok.tone).toBe('good')
  })

  it('drops unparseable timestamps and repos without a sync time', () => {
    const events = deriveActivity(
      [importRec({ id: 'bad', createdAt: 'not-a-date' })],
      [repoRec({ lastSyncedAt: undefined })],
    )
    expect(events).toHaveLength(0)
  })

  it('respects the limit', () => {
    const imports = Array.from({ length: 10 }, (_, i) =>
      importRec({ id: `i${i}`, createdAt: `2026-05-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    )
    expect(deriveActivity(imports, [], 3)).toHaveLength(3)
  })
})

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-05-30T12:00:00.000Z')

  it('formats hours and days in the past', () => {
    expect(formatRelativeTime(now - 2 * 3_600_000, now)).toBe('2 hours ago')
    expect(formatRelativeTime(now - 3 * 86_400_000, now)).toBe('3 days ago')
  })
})
