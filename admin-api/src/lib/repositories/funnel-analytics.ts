/**
 * @format
 * Funnel analytics — computes a user's application funnel (furthest stage reached
 * per application), derives per-transition conversion rates, and surfaces summary
 * counts (active / advanced-past-screen / reached-final / offers).
 *
 * Owner-scoping is enforced by RLS: the caller MUST run computeFunnel() inside
 * withUser() (which SET LOCALs app.current_user_id). job_applications and
 * interview_stages both scope rows to the current user via that setting, so no
 * explicit WHERE user_id is needed here.
 *
 * Furthest-stage + ghost derivation are done in TS (after fetching the rows) so
 * the logic is unit-testable against a mocked Queryable and easy to reason about.
 */
import type { Queryable } from '../pg.js';

/** Canonical interview stage order (index = funnel depth). */
export const STAGE_ORDER = [
  'applied',
  'phone-screen',
  'technical',
  'system-design',
  'behavioural',
  'bar-raiser',
  'final',
] as const;

export type StageName = (typeof STAGE_ORDER)[number];

/** kanban_status values that count as an offer (offers metric). */
const OFFER_STATUSES = new Set(['offer-received', 'accepted']);

/** kanban_status values that make an application terminal regardless of stage rows. */
const TERMINAL_STATUSES = new Set(['offer-received', 'accepted', 'withdrawn', 'rejected']);

/** Per-stage outcomes that terminate an application on its current stage. */
const TERMINAL_OUTCOMES = new Set(['rejected', 'withdrew']);

const MS_PER_DAY = 86_400_000;

export interface FunnelSummary {
  totalApplied: number;
  daysSinceFirstApplied: number;
  active: number;
  advancedPastScreen: number;
  reachedFinal: number;
  offers: number;
}

export interface FunnelTransition {
  key: string;
  fromCount: number;
  toCount: number;
  rate: number; // toCount / fromCount (0 when fromCount is 0)
}

export interface FunnelResult {
  summary: FunnelSummary;
  transitions: FunnelTransition[];
}

interface AppRow {
  id: string;
  kanban_status: string;
  applied_at: string | Date | null;
}

interface StageRow {
  job_application_id: string;
  stage_type: string;
  stage_status: string;
  outcome: string | null;
  last_activity_at: string | Date | null;
}

/** Per-application derived state used to build the funnel + summary. */
interface AppState {
  furthestIndex: number; // max STAGE_ORDER index reached (>= 0; 'applied' is 0)
  terminal: boolean; // true when no longer active (rejected/withdrew/offer/accepted/ghosted)
  isOffer: boolean;
}

/** A row "reaches" its stage when it exists and is not explicitly N/A. */
function rowReachesStage(stageStatus: string): boolean {
  return stageStatus !== 'not_applicable';
}

function stageIndex(stageType: string): number {
  return (STAGE_ORDER as readonly string[]).indexOf(stageType);
}

function toMs(value: string | Date | null): number | null {
  if (value === null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Decide whether the application's current stage row constitutes a derived
 * "ghosted" terminal state: non-terminal outcome (null), stale beyond ghostDays.
 * Only the furthest (current) stage row is considered the live one.
 */
function isGhosted(currentRow: StageRow | undefined, ghostDays: number, nowMs: number): boolean {
  if (!currentRow || currentRow.outcome !== null) return false;
  const last = toMs(currentRow.last_activity_at);
  if (last === null) return false;
  return nowMs - last > ghostDays * MS_PER_DAY;
}

/**
 * Reduce an application's stage rows to its derived state (furthest stage,
 * whether it is terminal, whether it is an offer).
 */
function deriveAppState(
  kanbanStatus: string,
  rows: StageRow[],
  ghostDays: number,
  nowMs: number,
): AppState {
  const isOffer = OFFER_STATUSES.has(kanbanStatus);

  // Furthest reached stage row (and its index). 'applied' (index 0) is implicit.
  let furthestIndex = 0;
  let furthestRow: StageRow | undefined;
  for (const row of rows) {
    if (!rowReachesStage(row.stage_status)) continue;
    const idx = stageIndex(row.stage_type);
    if (idx > furthestIndex) {
      furthestIndex = idx;
      furthestRow = row;
    }
  }

  const statusTerminal = TERMINAL_STATUSES.has(kanbanStatus);
  const outcomeTerminal = furthestRow ? TERMINAL_OUTCOMES.has(furthestRow.outcome ?? '') : false;
  const ghosted = isGhosted(furthestRow, ghostDays, nowMs);

  return {
    furthestIndex,
    terminal: statusTerminal || outcomeTerminal || ghosted,
    isOffer,
  };
}

/** Group stage rows by job_application_id. */
function groupStages(stageRows: StageRow[]): Map<string, StageRow[]> {
  const byApp = new Map<string, StageRow[]>();
  for (const row of stageRows) {
    const list = byApp.get(row.job_application_id);
    if (list) list.push(row);
    else byApp.set(row.job_application_id, [row]);
  }
  return byApp;
}

/** Count of apps that reached at least the given stage index. */
function reachedAtLeast(states: AppState[], minIndex: number): number {
  return states.filter(s => s.furthestIndex >= minIndex).length;
}

/** Build the consecutive-stage transitions with from/to counts and rates. */
function buildTransitions(states: AppState[]): FunnelTransition[] {
  const transitions: FunnelTransition[] = [];
  for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
    const fromCount = reachedAtLeast(states, i);
    const toCount = reachedAtLeast(states, i + 1);
    const rate = fromCount === 0 ? 0 : toCount / fromCount;
    const key = `${STAGE_ORDER[i]}_to_${STAGE_ORDER[i + 1]}`.replace(/-/g, '_');
    transitions.push({ key, fromCount, toCount, rate });
  }
  return transitions;
}

/** Days since the earliest applied_at across all applications (0 when none). */
function daysSinceFirstApplied(appRows: AppRow[], nowMs: number): number {
  let earliest = Infinity;
  for (const app of appRows) {
    const ms = toMs(app.applied_at);
    if (ms !== null && ms < earliest) earliest = ms;
  }
  if (earliest === Infinity) return 0;
  return Math.floor((nowMs - earliest) / MS_PER_DAY);
}

/**
 * Compute the user's application funnel. `db` is already RLS-scoped (withUser).
 *
 * @param db        - RLS-scoped Queryable (run inside withUser()).
 * @param ghostDays - Days of inactivity (on a non-terminal current stage with a
 *                    null outcome) after which an application is treated as ghosted.
 */
export async function computeFunnel(db: Queryable, ghostDays: number): Promise<FunnelResult> {
  const nowMs = Date.now();

  const appResult = await db.query<AppRow>(
    `SELECT id, kanban_status, applied_at FROM job_applications`,
  );
  const stageResult = await db.query<StageRow>(
    `SELECT job_application_id, stage_type, stage_status, outcome, last_activity_at
       FROM interview_stages`,
  );

  const appRows = appResult.rows;
  const byApp = groupStages(stageResult.rows);

  const states = appRows.map(app =>
    deriveAppState(app.kanban_status, byApp.get(app.id) ?? [], ghostDays, nowMs),
  );

  const summary: FunnelSummary = {
    totalApplied: appRows.length,
    daysSinceFirstApplied: daysSinceFirstApplied(appRows, nowMs),
    active: states.filter(s => !s.terminal).length,
    advancedPastScreen: reachedAtLeast(states, stageIndex('technical')),
    reachedFinal: reachedAtLeast(states, stageIndex('final')),
    offers: states.filter(s => s.isOffer).length,
  };

  return { summary, transitions: buildTransitions(states) };
}
