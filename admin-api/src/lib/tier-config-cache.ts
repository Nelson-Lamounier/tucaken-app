import type { Pool } from 'pg'
import { getTierConfigRow } from './repositories/tier-config.js'
import { DEFAULT_TIER_CONFIG, type TierConfig } from './tier-config-shape.js'

type Queryable = Pick<Pool, 'query'>

const TTL_MS = 60_000

let cached: TierConfig | null = null
let fetchedAt = 0

export function bustTierConfigCache(): void {
  cached = null
  fetchedAt = 0
}

export async function getCachedTierConfig(db: Queryable, now = Date.now()): Promise<TierConfig> {
  if (cached !== null && now - fetchedAt < TTL_MS) return cached
  const row = await getTierConfigRow(db)
  cached = row ?? DEFAULT_TIER_CONFIG
  fetchedAt = now
  return cached
}
