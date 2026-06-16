/**
 * @format
 * Bedrock usage repository — reads prompt_invocations and user_token_budgets
 * for the admin Cost tab (migration 013).
 *
 * prompt_invocations is written by:
 *   - agent-runner.ts onInvocationComplete (Converse API pipelines)
 *   - bedrock-cost.ts recordBedrockCost (direct InvokeModel pipelines)
 *
 * For direct InvokeModel rows: system_prompt_tokens=0, user_message_tokens=inputTokens.
 * Summary query sums both so the "tokens in" figure is consistent across both patterns.
 */
import type { Pool } from 'pg';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PromptInvocationRow {
  id:             string;
  userId:         string | null;
  email:          string | null;
  pipeline:       string;
  agent:          string;
  modelId:        string;
  inputTokens:    number;
  outputTokens:   number;
  totalCostCents: number;
  importId:       string | null;
  repoName:       string | null;
  syncKind:       string | null;
  invokedAt:      string;
}

/** Per-user spend roll-up (accurate — aggregated in SQL, not capped at 500 rows). */
export interface UserCostRow {
  userId:       string | null;
  email:        string | null;
  totalCents:   number;
  inputTokens:  number;
  outputTokens: number;
  invocations:  number;
}

/** Per-repo spend on the repo-sync pipeline, split by sync kind (initial vs resync). */
export interface RepoCostRow {
  repoName:    string;
  syncKind:    string | null;
  totalCents:  number;
  invocations: number;
}

/** Per job-application spend (job-strategist pipeline). */
export interface ApplicationCostRow {
  applicationId: string;
  company:       string | null;
  role:          string | null;
  totalCents:    number;
  invocations:   number;
}

/** Per-project spend (project-case-study pipeline). */
export interface ProjectCostRow {
  projectId:   string;
  name:        string | null;
  totalCents:  number;
  invocations: number;
}

export interface UsageSummary {
  rows:          PromptInvocationRow[];
  totalCents:    number;
  byPipeline:    Record<string, number>;
  byModel:       Record<string, number>;
  byUser:        UserCostRow[];
  byRepo:        RepoCostRow[];
  byApplication: ApplicationCostRow[];
  byProject:     ProjectCostRow[];
}

export interface UserTokenBudget {
  userId:             string;
  monthlyLimitCents:  number;
  alertThresholdPct:  number;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Builds the shared WHERE clause (month window + optional user filter) used by
 * the detail-rows query and every aggregate query, so they all describe the
 * same slice of spend. Conditions are qualified with the `pi` table alias.
 */
function buildWindow(userId?: string, month?: string): { where: string; params: string[] } {
  const params: string[] = [];
  const conditions: string[] = [];

  if (month) {
    params.push(month);
    conditions.push(
      `pi.invoked_at >= DATE_TRUNC('month', $${params.length}::date)`,
      `pi.invoked_at <  DATE_TRUNC('month', $${params.length}::date) + INTERVAL '1 month'`,
    );
  } else {
    conditions.push(
      `pi.invoked_at >= DATE_TRUNC('month', now())`,
      `pi.invoked_at <  DATE_TRUNC('month', now()) + INTERVAL '1 month'`,
    );
  }

  if (userId) {
    params.push(userId);
    conditions.push(`pi.user_id = $${params.length}`);
  }

  return { where: conditions.join(' AND '), params };
}

async function queryDetailRows(pool: Pool, where: string, params: string[]): Promise<PromptInvocationRow[]> {
  const { rows } = await pool.query<PromptInvocationRow>(
    `SELECT
       pi.id,
       pi.user_id                                          AS "userId",
       u.email                                             AS "email",
       pi.pipeline,
       pi.agent,
       pi.model_id                                         AS "modelId",
       (pi.system_prompt_tokens + pi.user_message_tokens)  AS "inputTokens",
       pi.output_tokens                                    AS "outputTokens",
       pi.total_cost_cents                                 AS "totalCostCents",
       pi.import_id                                        AS "importId",
       pi.repo_name                                        AS "repoName",
       pi.sync_kind                                        AS "syncKind",
       pi.invoked_at                                       AS "invokedAt"
     FROM prompt_invocations pi
     LEFT JOIN users u ON u.id = pi.user_id
     WHERE ${where}
     ORDER BY pi.invoked_at DESC
     LIMIT 500`,
    params,
  );
  return rows;
}

async function queryByUser(pool: Pool, where: string, params: string[]): Promise<UserCostRow[]> {
  const { rows } = await pool.query<UserCostRow>(
    `SELECT
       pi.user_id                                              AS "userId",
       u.email                                                 AS "email",
       SUM(pi.total_cost_cents)::float8                        AS "totalCents",
       SUM(pi.system_prompt_tokens + pi.user_message_tokens)::int AS "inputTokens",
       SUM(pi.output_tokens)::int                              AS "outputTokens",
       COUNT(*)::int                                           AS "invocations"
     FROM prompt_invocations pi
     LEFT JOIN users u ON u.id = pi.user_id
     WHERE ${where}
     GROUP BY pi.user_id, u.email
     ORDER BY SUM(pi.total_cost_cents) DESC`,
    params,
  );
  return rows;
}

async function queryByRepo(pool: Pool, where: string, params: string[]): Promise<RepoCostRow[]> {
  const { rows } = await pool.query<RepoCostRow>(
    `SELECT
       pi.repo_name                      AS "repoName",
       pi.sync_kind                      AS "syncKind",
       SUM(pi.total_cost_cents)::float8  AS "totalCents",
       COUNT(*)::int                     AS "invocations"
     FROM prompt_invocations pi
     WHERE ${where} AND pi.repo_name IS NOT NULL
     GROUP BY pi.repo_name, pi.sync_kind
     ORDER BY SUM(pi.total_cost_cents) DESC`,
    params,
  );
  return rows;
}

async function queryByApplication(pool: Pool, where: string, params: string[]): Promise<ApplicationCostRow[]> {
  const { rows } = await pool.query<ApplicationCostRow>(
    `SELECT
       pi.application_id                 AS "applicationId",
       ja.company                        AS "company",
       ja.role                           AS "role",
       SUM(pi.total_cost_cents)::float8  AS "totalCents",
       COUNT(*)::int                     AS "invocations"
     FROM prompt_invocations pi
     LEFT JOIN job_applications ja ON ja.id = pi.application_id
     WHERE ${where} AND pi.application_id IS NOT NULL
     GROUP BY pi.application_id, ja.company, ja.role
     ORDER BY SUM(pi.total_cost_cents) DESC`,
    params,
  );
  return rows;
}

async function queryByProject(pool: Pool, where: string, params: string[]): Promise<ProjectCostRow[]> {
  const { rows } = await pool.query<ProjectCostRow>(
    `SELECT
       pi.project_id                     AS "projectId",
       p.name                            AS "name",
       SUM(pi.total_cost_cents)::float8  AS "totalCents",
       COUNT(*)::int                     AS "invocations"
     FROM prompt_invocations pi
     LEFT JOIN projects p ON p.id = pi.project_id
     WHERE ${where} AND pi.project_id IS NOT NULL
     GROUP BY pi.project_id, p.name
     ORDER BY SUM(pi.total_cost_cents) DESC`,
    params,
  );
  return rows;
}

export async function getUsageSummary(
  pool:    Pool,
  userId?: string,
  month?:  string,
): Promise<UsageSummary> {
  const { where, params } = buildWindow(userId, month);

  const [rows, byUser, byRepo, byApplication, byProject] = await Promise.all([
    queryDetailRows(pool, where, params),
    queryByUser(pool, where, params),
    queryByRepo(pool, where, params),
    queryByApplication(pool, where, params),
    queryByProject(pool, where, params),
  ]);

  // Total is the accurate per-user sum (SQL aggregate, not capped). byPipeline
  // and byModel remain row-derived (last 500) — a finer, recency-biased view.
  const totalCents = byUser.reduce((sum, u) => sum + Number(u.totalCents), 0);

  const byPipeline: Record<string, number> = {};
  const byModel:    Record<string, number> = {};
  for (const row of rows) {
    byPipeline[row.pipeline] = (byPipeline[row.pipeline] ?? 0) + Number(row.totalCostCents);
    byModel[row.modelId]     = (byModel[row.modelId]     ?? 0) + Number(row.totalCostCents);
  }

  return { rows, totalCents, byPipeline, byModel, byUser, byRepo, byApplication, byProject };
}

export async function getUserBudget(
  pool:   Pool,
  userId: string,
): Promise<UserTokenBudget | null> {
  const { rows } = await pool.query<UserTokenBudget>(
    `SELECT
       user_id            AS "userId",
       monthly_limit_cents AS "monthlyLimitCents",
       alert_threshold_pct AS "alertThresholdPct"
     FROM user_token_budgets
     WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function setUserBudget(
  pool:               Pool,
  userId:             string,
  monthlyLimitCents:  number,
  alertThresholdPct:  number,
): Promise<void> {
  await pool.query(
    `INSERT INTO user_token_budgets (user_id, monthly_limit_cents, alert_threshold_pct)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET monthly_limit_cents = EXCLUDED.monthly_limit_cents,
           alert_threshold_pct = EXCLUDED.alert_threshold_pct,
           updated_at           = now()`,
    [userId, monthlyLimitCents, alertThresholdPct],
  );
}
