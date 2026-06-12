/**
 * @format
 * /api/admin/role-ontology/* — read-only operator visibility into the
 * role-ontology auto-training loop.
 *
 * The loop stages crowd-sourced suggestions in `role_learning_candidates`
 * (family_key, candidate_type, value, contributing_user_id). A candidate
 * promotes into the canonical ontology once enough distinct users vote for it.
 * This router exposes the candidates about to promote so an operator can review
 * them before they land. Read-only — no mutation.
 *
 * Gated by `requireAdminGroup()` at mount-time (see index.ts), so callers must
 * be in the Cognito `admin` group.
 */

import { Hono } from 'hono';

import type { AdminApiConfig } from '../lib/config.js';
import { logger } from '../lib/observability/logger.js';
import { getPool } from '../lib/pg.js';
import type { AdminApiBindings } from '../lib/types.js';

interface CandidateRow {
  readonly family_key: string;
  readonly candidate_type: string;
  readonly value: string;
  readonly votes: number;
}

/**
 * Parse the `min_votes` query param into a positive integer (default 1, clamped
 * to >= 1). Non-numeric input falls back to the default.
 */
function parseMinVotes(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  if (Number.isNaN(n)) return 1;
  return Math.max(1, n);
}

export function createRoleOntologyRouter(
  config: AdminApiConfig,
): Hono<AdminApiBindings> {
  const router = new Hono<AdminApiBindings>();

  /**
   * GET /candidates — role-learning candidates about to promote.
   *
   * @query min_votes - Minimum distinct-user vote threshold (default 1, min 1)
   * @returns { candidates: CandidateRow[] } sorted by votes desc, then family.
   */
  router.get('/candidates', async (ctx) => {
    const minVotes = parseMinVotes(ctx.req.query('min_votes'));
    const pool = getPool(config);

    try {
      const result = await pool.query<CandidateRow>(
        `SELECT family_key,
                candidate_type,
                value,
                COUNT(DISTINCT contributing_user_id) AS votes
           FROM role_learning_candidates
          GROUP BY family_key, candidate_type, value
         HAVING COUNT(DISTINCT contributing_user_id) >= $1
          ORDER BY votes DESC, family_key
          LIMIT 200`,
        [minVotes],
      );
      return ctx.json({ candidates: result.rows });
    } catch (err: unknown) {
      logger.error(
        { event: 'role_ontology_candidates_failed', minVotes, err },
        'failed to read role_learning_candidates',
      );
      return ctx.json({ error: 'InternalError' }, 500);
    }
  });

  return router;
}
