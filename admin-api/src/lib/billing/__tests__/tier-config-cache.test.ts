/** @format */
import { describe, expect, it, beforeEach, jest } from '@jest/globals'
import { getCachedTierConfig, bustTierConfigCache } from '../../billing/tier-config-cache.js'
import { DEFAULT_TIER_CONFIG } from '../../billing/tier-config-shape.js'

const row = structuredClone(DEFAULT_TIER_CONFIG)
const proTier = row.tiers[1]
if (proTier !== undefined) {
  proTier.priceMonthly = 25
}

function dbReturning(rows: unknown[]) {
  return { query: jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows }) }
}

describe('tier-config cache', () => {
  beforeEach(() => bustTierConfigCache())

  it('falls back to DEFAULT when no row', async () => {
    const db = dbReturning([])
    expect(await getCachedTierConfig(db as any, 1000)).toEqual(DEFAULT_TIER_CONFIG)
  })

  it('memoises within the TTL (one DB hit)', async () => {
    const db = dbReturning([{ config: row }])
    await getCachedTierConfig(db as any, 1000)
    await getCachedTierConfig(db as any, 1000 + 30_000)
    expect(db.query).toHaveBeenCalledTimes(1)
  })

  it('refetches after TTL', async () => {
    const db = dbReturning([{ config: row }])
    await getCachedTierConfig(db as any, 1000)
    await getCachedTierConfig(db as any, 1000 + 61_000)
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('bust forces a refetch', async () => {
    const db = dbReturning([{ config: row }])
    await getCachedTierConfig(db as any, 1000)
    bustTierConfigCache()
    await getCachedTierConfig(db as any, 1000)
    expect(db.query).toHaveBeenCalledTimes(2)
  })
})
