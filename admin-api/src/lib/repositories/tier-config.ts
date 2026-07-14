import type { Pool } from 'pg'
import { TierConfigSchema, type TierConfig } from '../billing/tier-config-shape.js'

type Queryable = Pick<Pool, 'query'>

/**
 * Reads the single tier-config row (id = 1) and parses it with TierConfigSchema.
 * Returns null when no row has been persisted yet (e.g. a fresh environment).
 */
export async function getTierConfigRow(db: Queryable): Promise<TierConfig | null> {
  const result = await db.query<{ config: unknown }>(
    `SELECT config FROM tier_config WHERE id = 1`,
  )
  const raw = result.rows[0]?.config
  if (raw === undefined) return null
  return TierConfigSchema.parse(raw)
}

/**
 * Inserts or updates the single tier-config row (id = 1).
 * Records which admin user performed the update via `updated_by`.
 */
export async function upsertTierConfig(
  db: Queryable,
  config: TierConfig,
  userId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO tier_config (id, config, updated_by, updated_at)
     VALUES (1, $1::jsonb, $2, NOW())
     ON CONFLICT (id) DO UPDATE
       SET config     = EXCLUDED.config,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
    [JSON.stringify(config), userId],
  )
}
