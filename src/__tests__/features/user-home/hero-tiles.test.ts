import { describe, it, expect } from 'vitest'
import type { ConnectedRepo } from '@/lib/types/github.types'
import type { CareerEntry, ResumeImportRecord } from '@/server/resume-imports'
import { deriveHeroSparks, deriveHeroMeta, buildHeroTiles } from '@/features/user-home/lib/hero-tiles'
import type { HeroMeta } from '@/features/user-home/lib/hero-tiles'
import type { KbStats } from '@/features/user-home/lib/kb-stats'

const STATS: KbStats = {
  repoCount: 2,
  syncedRepoCount: 1,
  pendingRepoCount: 1,
  careerEntryCount: 5,
  experienceCount: 3,
  educationCount: 1,
  skillCount: 1,
  importCount: 1,
  processedImportCount: 1,
  failedImportCount: 0,
  isReady: true,
}

const NO_META: HeroMeta = { repos: null, career: null, uploads: null, kb: null }

describe('deriveHeroSparks', () => {
  it('builds per-tile growth increments from real data', () => {
    const repos = [{ qualityScore: 0.8 }, { qualityScore: 0.4 }, {}] as ConnectedRepo[]
    const entries = [
      { entryType: 'experience' },
      { entryType: 'experience' },
      { entryType: 'skill' },
    ] as CareerEntry[]
    const imports = [{ careerEntriesCreated: ['a', 'b'] }] as ResumeImportRecord[]

    const sparks = deriveHeroSparks(repos, entries, imports)
    expect(sparks.repoIncrements).toEqual([1, 1, 1]) // one step per repo
    // ENTRY_ORDER: experience, education, skill, project, certification, achievement
    expect(sparks.careerIncrements).toEqual([2, 0, 1, 0, 0, 0])
    expect(sparks.uploadIncrements).toEqual([2])
  })
})

describe('deriveHeroMeta', () => {
  it('takes the latest timestamp per group and the overall max for kb', () => {
    const repos = [
      { lastSyncedAt: '2026-05-01T00:00:00.000Z' },
      { lastSyncedAt: '2026-05-04T00:00:00.000Z' },
    ] as ConnectedRepo[]
    const entries = [{ createdAt: '2026-05-02T00:00:00.000Z' }] as CareerEntry[]
    const imports = [{ createdAt: '2026-05-03T00:00:00.000Z' }] as ResumeImportRecord[]

    const meta = deriveHeroMeta(repos, entries, imports)
    expect(meta.repos).toBe(Date.parse('2026-05-04T00:00:00.000Z'))
    expect(meta.kb).toBe(Date.parse('2026-05-04T00:00:00.000Z'))
  })

  it('is null when no timestamps exist', () => {
    expect(deriveHeroMeta([], [], [])).toEqual(NO_META)
  })
})

describe('buildHeroTiles', () => {
  const sparks = {
    repoIncrements: [1, 1],
    careerIncrements: [3, 1, 1, 0, 0, 0],
    uploadIncrements: [5],
  }

  it('returns placeholder tiles while loading', () => {
    const tiles = buildHeroTiles(true, STATS, sparks, NO_META)
    expect(tiles).toHaveLength(4)
    expect(tiles.every(t => t.value === '…' && t.spark === null && t.updatedAt === null)).toBe(true)
  })

  it('builds an ascending (baseline-0 + cumulative) growth spark on every tile', () => {
    const tiles = buildHeroTiles(false, STATS, sparks, NO_META)
    const repos = tiles.find(t => t.key === 'repos')
    const uploads = tiles.find(t => t.key === 'uploads')
    const kb = tiles.find(t => t.key === 'kb')
    // [1, 1] → [0, 1, 2]: climbs left→right, highest on the right
    expect(repos?.spark).toEqual([0, 1, 2])
    expect(uploads?.spark).toEqual([0, 5]) // single increment still yields a line
    expect(kb?.spark).toBeNull() // status tile shows no line
    expect(kb?.isStatus).toBe(true)
    expect(kb?.value).toBe('Ready')
  })

  it('carries the per-tile updatedAt from meta', () => {
    const meta: HeroMeta = { repos: 111, career: 222, uploads: 333, kb: 444 }
    const tiles = buildHeroTiles(false, STATS, sparks, meta)
    expect(tiles.find(t => t.key === 'repos')?.updatedAt).toBe(111)
    expect(tiles.find(t => t.key === 'kb')?.updatedAt).toBe(444)
  })

  it('flags failed uploads with a warn tone', () => {
    const tiles = buildHeroTiles(false, { ...STATS, failedImportCount: 1 }, sparks, NO_META)
    expect(tiles.find(t => t.key === 'uploads')?.tone).toBe('warn')
  })
})
