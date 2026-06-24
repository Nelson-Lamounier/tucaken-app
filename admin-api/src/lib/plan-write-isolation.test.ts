/** @format */
/**
 * Layer 2: Plan-write isolation — source-scan regression guard.
 *
 * This test reads the admin-api source tree from disk and asserts that the
 * plan/subscription mutators — `updateSubscriptionFromStripe` and
 * `setStripeCustomerId` — are imported or called ONLY from their definition
 * site (`lib/repositories/users.ts`) and the single M2M-gated route
 * (`routes/internal-billing.ts`). If any other route file references these
 * identifiers, the test FAILS. This is the regression guard: if a future
 * change wires a plan write into a user-facing route, the test breaks
 * immediately.
 *
 * ─── Layer 3: DB-level backstop (documented, not tested here) ────────────────
 *
 * ai-applications migration 003 (`platform-rds-bootstrap/migrations/
 * 003_cognito_user_provisioning.sql`) grants:
 *
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
 *     TO tucaken_app;
 *
 * This is a BROAD grant — `tucaken_app` has full UPDATE on every column of
 * the `users` table, including `plan`, `subscription_status`, and all
 * `stripe_*` columns. The grant is accompanied by an ALTER DEFAULT PRIVILEGES
 * that extends it to future tables.
 *
 * CONCERN: The DB-level grant does NOT restrict plan writes. The tier-change
 * lockdown therefore relies entirely on:
 *   (a) the M2M middleware gate (no user-JWT path reaches internal-billing),
 *   (b) the absence of plan-write calls from user-facing routes (this test),
 *   (c) RLS on the `users` table enforcing `id = app.current_user_id` —
 *       which locks a user-RLS-context request to only their own row, but
 *       does NOT prevent writing `plan` on that row if the route were to call
 *       the mutators.
 *
 * The internal-billing route uses the pool via `getPool()` directly (not
 * via `withUser()`), so queries run as the superuser and bypass RLS entirely.
 * That design is intentional and correct for M2M writes, but it reinforces
 * that the code-path guard (this test + the M2M middleware) is the primary
 * control. A column-level GRANT revision (excluding `plan`, `subscription_status`,
 * `stripe_*` from `tucaken_app`) would add defence-in-depth and is
 * recommended as a follow-up.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Root of admin-api/src — this file lives at src/lib/plan-write-isolation.test.ts
const SRC_ROOT = path.resolve(__dirname, '..');

/**
 * Identifiers that write to users.plan / subscription_status / stripe_*.
 * MUST stay in sync with the plan/subscription mutator exports in
 * lib/repositories/users.ts. If a new function writes users.plan/subscription_status/stripe_*,
 * add it here.
 */
const PLAN_WRITE_IDENTIFIERS = [
  'updateSubscriptionFromStripe',
  'setStripeCustomerId',
] as const;

/**
 * The ONLY route file that is permitted to reference these identifiers.
 * It is protected by cognitoM2MAuth and never exposed to user JWTs.
 */
const ALLOWED_ROUTE = 'internal-billing.ts';

/**
 * Return all .ts files directly under src/routes/ (not nested, not .test.ts).
 */
function collectRouteFiles(): string[] {
  const routesDir = path.join(SRC_ROOT, 'routes');
  return fs
    .readdirSync(routesDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join(routesDir, f));
}

describe('plan-write isolation', () => {
  const routeFiles = collectRouteFiles();

  for (const identifier of PLAN_WRITE_IDENTIFIERS) {
    it(`"${identifier}" is referenced only by ${ALLOWED_ROUTE} among route files`, () => {
      const offenders: string[] = [];

      for (const filePath of routeFiles) {
        const basename = path.basename(filePath);
        if (basename === ALLOWED_ROUTE) continue; // the permitted writer

        const source = fs.readFileSync(filePath, 'utf8');
        if (source.includes(identifier)) {
          offenders.push(basename);
        }
      }

      expect(offenders).toEqual(
        [],
        `SECURITY: "${identifier}" must only be used in routes/${ALLOWED_ROUTE} ` +
        `(M2M-gated), but was found in: ${offenders.join(', ')}. ` +
        `This means a user-JWT route can now write subscription data — ` +
        `add the M2M gate or move the call to internal-billing.ts.`,
      );
    });
  }

  it('the M2M-gated internal-billing route IS the plan writer (test stays meaningful)', () => {
    const internalBillingPath = path.join(SRC_ROOT, 'routes', ALLOWED_ROUTE);
    const internalBillingSource = fs.readFileSync(internalBillingPath, 'utf8');

    for (const identifier of PLAN_WRITE_IDENTIFIERS) {
      expect(internalBillingSource.includes(identifier)).toBe(
        true,
        `REGRESSION: "${identifier}" is missing from routes/${ALLOWED_ROUTE}. ` +
        `If this mutator was moved or renamed, update PLAN_WRITE_IDENTIFIERS ` +
        `to maintain the integrity of this isolation test.`,
      );
    }
  });
});
