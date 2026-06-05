/** @format */
import type { Queryable } from '../pg.js';

/**
 * User-provided + recruiter-relayed feedback captured per interview stage.
 * All fields optional — the UI submits whatever the user filled in.
 */
export interface StageFeedbackInput {
  userCategory?: string;
  userNote?: string;
  companyFeedback?: string;
  companyFeedbackVerbatim?: boolean;
  prepSelfRating?: number;
}

/** Canonical taxonomy for the user's self-assessed reason a stage went the way it did. */
export const FEEDBACK_CATEGORIES = [
  'compensation',
  'skills_mismatch',
  'culture_fit',
  'communication',
  'technical_perf',
  'process_timing',
  'unclear',
  'other',
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** Thrown when a {@link StageFeedbackInput} field fails validation. */
export class InvalidStageFeedbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStageFeedbackError';
  }
}

/** Type guard for {@link FeedbackCategory}. */
export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return typeof value === 'string' && (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Validate a {@link StageFeedbackInput}'s constrained fields.
 * @throws InvalidStageFeedbackError on an out-of-set category or a non-integer / out-of-range rating.
 */
function validateStageFeedback(input: StageFeedbackInput): void {
  if (input.userCategory !== undefined && !isFeedbackCategory(input.userCategory)) {
    throw new InvalidStageFeedbackError(
      `Invalid userCategory. Expected one of: ${FEEDBACK_CATEGORIES.join(', ')}`,
    );
  }
  const r = input.prepSelfRating;
  if (r !== undefined && (!Number.isInteger(r) || r < 1 || r > 5)) {
    throw new InvalidStageFeedbackError('Invalid prepSelfRating. Expected an integer 1..5');
  }
}

export interface StageFeedbackRow {
  user_category: string | null;
  user_note: string | null;
  company_feedback: string | null;
  company_feedback_verbatim: boolean;
  prep_self_rating: number | null;
}

/**
 * UPSERT a stage's feedback row, owner-scoped via RLS.
 *
 * The caller MUST run this inside withUser() (which SET LOCALs
 * app.current_user_id). The application_stage_feedback owner policy (asf_owner)
 * keys USING + WITH CHECK on `user_id = current_setting('app.current_user_id')::uuid`,
 * so the INSERT explicitly sets user_id = $3 to the same userId the caller passed
 * to withUser — the WITH CHECK passes only when they match.
 *
 * @throws InvalidStageFeedbackError when userCategory ∉ FEEDBACK_CATEGORIES or
 *         prepSelfRating is not an integer in 1..5.
 */
export async function upsertStageFeedback(
  db: Queryable,
  appId: string,
  stageType: string,
  userId: string,
  input: StageFeedbackInput,
): Promise<void> {
  validateStageFeedback(input);

  await db.query(
    `INSERT INTO application_stage_feedback (
       job_application_id, stage_type, user_id,
       user_category, user_note, company_feedback, company_feedback_verbatim, prep_self_rating
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (job_application_id, stage_type) DO UPDATE SET
       user_category             = EXCLUDED.user_category,
       user_note                 = EXCLUDED.user_note,
       company_feedback          = EXCLUDED.company_feedback,
       company_feedback_verbatim = EXCLUDED.company_feedback_verbatim,
       prep_self_rating          = EXCLUDED.prep_self_rating,
       updated_at                = now()`,
    [
      appId,
      stageType,
      userId,
      input.userCategory ?? null,
      input.userNote ?? null,
      input.companyFeedback ?? null,
      input.companyFeedbackVerbatim ?? false,
      input.prepSelfRating ?? null,
    ],
  );
}

/** Read the feedback row for (appId, stageType) so the UI can prefill. RLS-scoped. */
export async function getStageFeedback(
  db: Queryable,
  appId: string,
  stageType: string,
): Promise<StageFeedbackRow | null> {
  const r = await db.query<StageFeedbackRow>(
    `SELECT user_category, user_note, company_feedback, company_feedback_verbatim, prep_self_rating
       FROM application_stage_feedback
      WHERE job_application_id = $1 AND stage_type = $2`,
    [appId, stageType],
  );
  return r.rows[0] ?? null;
}
