/**
 * @format
 * CareerHistory repository — typed pg queries for resume_imports and
 * user_career_history tables (migration 009).
 *
 * Separation of concerns:
 *   resume_imports      — import job state machine (admin-api reads/writes)
 *   user_career_history — extracted career entries (admin-api reads; K8s Job writes)
 *
 * The K8s Job (resume-import-processor) writes directly to both tables using
 * the platform-rds-credentials Secret — it does not go through this layer.
 * This repository is the admin-api read/control path only.
 */
import type { Pool } from 'pg';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ImportStatus =
  | 'awaiting_upload'
  | 'queued'
  | 'parsing'
  | 'extracting_career'
  | 'analyzing'
  | 'ready_for_review'
  | 'confirmed'
  | 'enriching'
  | 'completed'
  | 'failed';

export interface ResumeImport {
  id:                    string;
  userId:                string;
  s3Key:                 string;
  originalFilename:      string;
  contentType:           string;
  fileSizeBytes:         number;
  status:                ImportStatus;
  statusMessage:         string | null;
  currentStep:           string | null;
  totalSteps:            number | null;
  careerEntriesCreated:  string[];
  embeddingsCreatedCount: number;
  errorCode:             string | null;
  errorDetails:          Record<string, unknown> | null;
  retryCount:            number;
  createdAt:             Date;
  startedAt:             Date | null;
  completedAt:           Date | null;
}

/**
 * Compact progress DTO for the polling contract. Deliberately excludes the
 * heavy columns (raw_extracted_text, gap_report) — the frontend polls this
 * cheaply and fetches heavy artifacts once, gated on the flags here.
 */
export type ImportPhase =
  | 'uploading' | 'parsing' | 'extracting' | 'analyzing'
  | 'review' | 'enriching' | 'done' | 'error';

export interface ImportProgress {
  v:              1;
  status:         ImportStatus;
  phase:          ImportPhase;
  step:           number;
  totalSteps:     number;
  terminal:       boolean;
  error:          { code: string; message: string } | null;
  gapReportReady: boolean;
  heartbeatAt:    string;   // server clock — client uses this, not its own
  retryAfterMs:   number;   // server-driven poll cadence
}

export type CareerEntryType =
  | 'experience'
  | 'education'
  | 'skill'
  | 'certification'
  | 'project'
  | 'achievement';

export type EnrichmentStatus = 'pending' | 'enriching' | 'complete' | 'skipped' | 'failed';

export interface CareerEntry {
  id:                       string;
  userId:                   string;
  importId:                 string | null;
  entryType:                CareerEntryType;
  rawData:                  Record<string, unknown>;
  enrichedData:             Record<string, unknown> | null;
  enrichmentStatus:         EnrichmentStatus;
  enrichmentSkippedReason:  string | null;
  displayOrder:             number;
  createdAt:                Date;
  updatedAt:                Date;
}

// ─── resume_imports ───────────────────────────────────────────────────────────

const IMPORT_COLS = `
  id, user_id, s3_key, original_filename, content_type, file_size_bytes,
  status, status_message, current_step, total_steps,
  career_entries_created, embeddings_created_count,
  error_code, error_details, retry_count,
  created_at, started_at, completed_at
`;

function rowToImport(row: Record<string, unknown>): ResumeImport {
  return {
    id:                    row['id'] as string,
    userId:                row['user_id'] as string,
    s3Key:                 row['s3_key'] as string,
    originalFilename:      row['original_filename'] as string,
    contentType:           row['content_type'] as string,
    fileSizeBytes:         row['file_size_bytes'] as number,
    status:                row['status'] as ImportStatus,
    statusMessage:         (row['status_message'] as string | null) ?? null,
    currentStep:           (row['current_step'] as string | null) ?? null,
    totalSteps:            (row['total_steps'] as number | null) ?? null,
    careerEntriesCreated:  (row['career_entries_created'] as string[]) ?? [],
    embeddingsCreatedCount: row['embeddings_created_count'] as number,
    errorCode:             (row['error_code'] as string | null) ?? null,
    errorDetails:          (row['error_details'] as Record<string, unknown> | null) ?? null,
    retryCount:            row['retry_count'] as number,
    createdAt:             row['created_at'] as Date,
    startedAt:             (row['started_at'] as Date | null) ?? null,
    completedAt:           (row['completed_at'] as Date | null) ?? null,
  };
}

/**
 * Creates a new resume_import row in 'awaiting_upload' state.
 * Called when the admin-api issues the presigned URL — the record exists
 * before the file reaches S3 so we can attach the import ID to the URL path.
 */
export async function createResumeImport(
  pool: Pool,
  params: {
    userId:           string;
    s3Key:            string;
    originalFilename: string;
    contentType:      string;
    fileSizeBytes:    number;
  },
): Promise<ResumeImport> {
  const result = await pool.query<Record<string, unknown>>(
    `INSERT INTO resume_imports
           (user_id, s3_key, original_filename, content_type, file_size_bytes, status)
     VALUES ($1::uuid, $2, $3, $4, $5, 'awaiting_upload')
     RETURNING ${IMPORT_COLS}`,
    [params.userId, params.s3Key, params.originalFilename, params.contentType, params.fileSizeBytes],
  );
  const row = result.rows[0];
  if (!row) throw new Error('createResumeImport: INSERT returned no row');
  return rowToImport(row);
}

/**
 * Transitions a resume_import from 'awaiting_upload' → 'queued'.
 * Called after the frontend confirms the S3 PUT succeeded.
 * Returns null if the record doesn't belong to this user (ownership check).
 */
export async function markUploadComplete(
  pool: Pool,
  importId: string,
  userId: string,
): Promise<ResumeImport | null> {
  const result = await pool.query<Record<string, unknown>>(
    `UPDATE resume_imports
        SET status = 'queued', started_at = NOW()
      WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'awaiting_upload'
      RETURNING ${IMPORT_COLS}`,
    [importId, userId],
  );
  return result.rows[0] ? rowToImport(result.rows[0]) : null;
}

/**
 * Transitions a resume_import 'ready_for_review' → 'confirmed'.
 * Called when the user accepts their reviewed career history. The status
 * guard makes this idempotent-safe: a double-click can't re-confirm and
 * the admin-api won't dispatch a second enrichment Job.
 * Returns null if not found, not owned, or not in 'ready_for_review'.
 */
export async function confirmImportForEnrichment(
  pool: Pool,
  importId: string,
  userId: string,
): Promise<ResumeImport | null> {
  const result = await pool.query<Record<string, unknown>>(
    `UPDATE resume_imports
        SET status = 'confirmed', updated_at = NOW()
      WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'ready_for_review'
      RETURNING ${IMPORT_COLS}`,
    [importId, userId],
  );
  return result.rows[0] ? rowToImport(result.rows[0]) : null;
}

const PHASE_BY_STATUS: Record<ImportStatus, ImportPhase> = {
  awaiting_upload:   'uploading',
  queued:            'uploading',
  parsing:           'parsing',
  extracting_career: 'extracting',
  analyzing:         'analyzing',
  ready_for_review:  'review',
  confirmed:         'enriching',
  enriching:         'enriching',
  completed:         'done',
  failed:            'error',
};

// Ordinal for the UI progress bar. ready_for_review is the Phase-1 finish
// line (the user can act); enrichment is Phase 2 and counts beyond it.
const STEP_BY_PHASE: Record<ImportPhase, number> = {
  uploading: 1, parsing: 2, extracting: 3, analyzing: 4,
  review: 5, enriching: 6, done: 7, error: 0,
};
const TOTAL_STEPS = 7;

const TERMINAL = new Set<ImportStatus>(['ready_for_review', 'completed', 'failed']);

/**
 * Compact progress for the polling contract. Narrow query — deliberately
 * omits raw_extracted_text and gap_report. The server owns poll cadence
 * (retryAfterMs) and terminal authority so the client needs no timeout
 * guesswork. Returns null if the import is absent / not owned.
 */
export async function getImportProgress(
  pool: Pool,
  importId: string,
  userId: string,
): Promise<ImportProgress | null> {
  const result = await pool.query<{
    status: ImportStatus;
    error_code: string | null;
    error_details: { message?: string } | null;
    gap_report_generated_at: Date | null;
  }>(
    `SELECT status, error_code, error_details, gap_report_generated_at
       FROM resume_imports
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [importId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const phase = PHASE_BY_STATUS[row.status];
  const terminal = TERMINAL.has(row.status);
  return {
    v: 1,
    status:         row.status,
    phase,
    step:           STEP_BY_PHASE[phase],
    totalSteps:     TOTAL_STEPS,
    terminal,
    error: row.status === 'failed'
      ? { code: row.error_code ?? 'UNKNOWN', message: row.error_details?.message ?? 'Import failed' }
      : null,
    gapReportReady: row.gap_report_generated_at != null,
    heartbeatAt:    new Date().toISOString(),
    // Terminal → client stops polling anyway; non-terminal → 1.5s cadence.
    retryAfterMs:   terminal ? 0 : 1500,
  };
}

/**
 * Fetch the gap-analysis report once (write-once artifact). Distinguishes:
 *   undefined → import not found / not owned
 *   null      → import exists, no report yet (or gap analysis failed)
 *   object    → the GapAnalysisReport JSON
 */
export async function getGapReport(
  pool: Pool,
  importId: string,
  userId: string,
): Promise<Record<string, unknown> | null | undefined> {
  const result = await pool.query<{ gap_report: Record<string, unknown> | null }>(
    `SELECT gap_report FROM resume_imports
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [importId, userId],
  );
  if (!result.rows[0]) return undefined;
  return result.rows[0].gap_report ?? null;
}

/**
 * Fetch a single resume_import by ID, scoped to the authenticated user.
 */
export async function getResumeImport(
  pool: Pool,
  importId: string,
  userId: string,
): Promise<ResumeImport | null> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT ${IMPORT_COLS} FROM resume_imports
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [importId, userId],
  );
  return result.rows[0] ? rowToImport(result.rows[0]) : null;
}

/**
 * List all resume_imports for a user, newest first. Capped at 20 rows.
 */
export async function listResumeImports(
  pool: Pool,
  userId: string,
): Promise<ResumeImport[]> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT ${IMPORT_COLS} FROM resume_imports
      WHERE user_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 20`,
    [userId],
  );
  return result.rows.map(rowToImport);
}

/**
 * Reset a failed resume_import back to 'queued' state for retry.
 * Clears error fields, increments retry count, and resets completion timestamp.
 * Returns the updated record or null if not found/not in failed state.
 */
export async function resetImportForRetry(
  pool: Pool,
  importId: string,
  userId: string,
): Promise<ResumeImport | null> {
  const result = await pool.query<Record<string, unknown>>(
    `UPDATE resume_imports
        SET status        = 'queued',
            error_code    = NULL,
            error_details = NULL,
            started_at    = NOW(),
            completed_at  = NULL,
            retry_count   = retry_count + 1,
            updated_at    = NOW()
      WHERE id = $1::uuid
        AND user_id = $2::uuid
        AND status = 'failed'
  RETURNING ${IMPORT_COLS}`,
    [importId, userId],
  );
  return result.rows[0] ? rowToImport(result.rows[0]) : null;
}

/**
 * Count resume imports for this user in the current calendar month.
 * Used to enforce the free-tier quota (1 import/month).
 */
export async function countImportsThisMonth(
  pool: Pool,
  userId: string,
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM resume_imports
      WHERE user_id = $1::uuid
        AND created_at >= DATE_TRUNC('month', NOW())
        AND status NOT IN ('awaiting_upload', 'failed')`,
    [userId],
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

// ─── user_career_history ──────────────────────────────────────────────────────

const ENTRY_COLS = `
  id, user_id, import_id, entry_type,
  raw_data, enriched_data,
  enrichment_status, enrichment_skipped_reason,
  display_order, created_at, updated_at
`;

function rowToEntry(row: Record<string, unknown>): CareerEntry {
  return {
    id:                      row['id'] as string,
    userId:                  row['user_id'] as string,
    importId:                (row['import_id'] as string | null) ?? null,
    entryType:               row['entry_type'] as CareerEntryType,
    rawData:                 row['raw_data'] as Record<string, unknown>,
    enrichedData:            (row['enriched_data'] as Record<string, unknown> | null) ?? null,
    enrichmentStatus:        row['enrichment_status'] as EnrichmentStatus,
    enrichmentSkippedReason: (row['enrichment_skipped_reason'] as string | null) ?? null,
    displayOrder:            row['display_order'] as number,
    createdAt:               row['created_at'] as Date,
    updatedAt:               row['updated_at'] as Date,
  };
}

/**
 * List all career history entries for a user, grouped by entry_type then
 * display_order. Used to render the profile review screen after import.
 */
export async function listCareerEntries(
  pool: Pool,
  userId: string,
  entryType?: CareerEntryType,
): Promise<CareerEntry[]> {
  if (entryType) {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT ${ENTRY_COLS} FROM user_career_history
        WHERE user_id = $1::uuid AND entry_type = $2
        ORDER BY display_order, created_at`,
      [userId, entryType],
    );
    return result.rows.map(rowToEntry);
  }

  const result = await pool.query<Record<string, unknown>>(
    `SELECT ${ENTRY_COLS} FROM user_career_history
      WHERE user_id = $1::uuid
      ORDER BY entry_type, display_order, created_at`,
    [userId],
  );
  return result.rows.map(rowToEntry);
}

/**
 * Fetch a single career entry by ID, scoped to the authenticated user.
 */
export async function getCareerEntry(
  pool: Pool,
  entryId: string,
  userId: string,
): Promise<CareerEntry | null> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT ${ENTRY_COLS} FROM user_career_history
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [entryId, userId],
  );
  return result.rows[0] ? rowToEntry(result.rows[0]) : null;
}

/**
 * Diff two raw_data objects and yield (field_path, before, after) triples for
 * every changed top-level key. Arrays are diffed element-wise so individual
 * highlight bullets surface as their own corrections (e.g. "highlights[2]").
 *
 * Nested objects (e.g. a future role with `metrics: { ... }`) are diffed as a
 * single field — we don't recurse, because the extracted shapes are flat and
 * the eval queries are simpler when paths are predictable.
 */
function* diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Generator<{ path: string; before: unknown; after: unknown }> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const b = before[key];
    const a = after[key];

    if (Array.isArray(b) && Array.isArray(a)) {
      const maxLen = Math.max(b.length, a.length);
      for (let i = 0; i < maxLen; i++) {
        if (JSON.stringify(b[i]) !== JSON.stringify(a[i])) {
          yield { path: `${key}[${i}]`, before: b[i] ?? null, after: a[i] ?? null };
        }
      }
      continue;
    }

    if (JSON.stringify(b) !== JSON.stringify(a)) {
      yield { path: key, before: b ?? null, after: a ?? null };
    }
  }
}

/**
 * Update the raw_data for a career entry (user editing extracted data).
 *
 * Atomically logs every changed field to `resume_import_corrections`. The
 * correction log is the eval dataset for extraction prompt iteration —
 * pair (extracted, corrected) per field, with model_id provenance.
 */
export async function updateCareerEntry(
  pool: Pool,
  entryId: string,
  userId: string,
  rawData: Record<string, unknown>,
): Promise<CareerEntry | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Read-then-update inside a tx so concurrent edits can't lose corrections.
    // SELECT FOR UPDATE locks the row until COMMIT, so the diff we compute is
    // against the value the UPDATE will actually replace.
    const before = await client.query<{ raw_data: Record<string, unknown>; import_id: string; entry_type: string }>(
      `SELECT raw_data, import_id, entry_type
         FROM user_career_history
        WHERE id = $1::uuid AND user_id = $2::uuid
        FOR UPDATE`,
      [entryId, userId],
    );
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const beforeRaw = before.rows[0].raw_data;
    const importId = before.rows[0].import_id;
    const entryType = before.rows[0].entry_type;

    const result = await client.query<Record<string, unknown>>(
      `UPDATE user_career_history
          SET raw_data   = $1,
              updated_at = NOW()
        WHERE id = $2::uuid AND user_id = $3::uuid
        RETURNING ${ENTRY_COLS}`,
      [JSON.stringify(rawData), entryId, userId],
    );

    // Resolve the extraction model used for this import — best-effort.
    // We pick the most recent extraction-pipeline invocation; if none exists
    // (e.g. the cost-tracking write was lost), we log NULL and move on.
    const modelLookup = await client.query<{ model_id: string }>(
      `SELECT model_id
         FROM prompt_invocations
        WHERE import_id = $1::uuid AND pipeline = 'resume-import'
        ORDER BY invoked_at ASC
        LIMIT 1`,
      [importId],
    );
    const modelId = modelLookup.rows[0]?.model_id ?? null;

    for (const change of diffFields(beforeRaw, rawData)) {
      await client.query(
        `INSERT INTO resume_import_corrections
              (import_id, career_entry_id, user_id, entry_type,
               field_path, extracted_value, corrected_value, model_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7::jsonb, $8)`,
        [
          importId,
          entryId,
          userId,
          entryType,
          change.path,
          change.before === null ? null : JSON.stringify(change.before),
          change.after  === null ? null : JSON.stringify(change.after),
          modelId,
        ],
      );
    }

    await client.query('COMMIT');
    return result.rows[0] ? rowToEntry(result.rows[0]) : null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Delete a career entry and all its experience_embeddings (via CASCADE).
 */
export async function deleteCareerEntry(
  pool: Pool,
  entryId: string,
  userId: string,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM user_career_history WHERE id = $1::uuid AND user_id = $2::uuid`,
    [entryId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Count enriched 'experience' entries for a user (all-time, not monthly).
 * Used to enforce the free-tier enrichment cap (5 roles).
 */
export async function countEnrichedExperienceEntries(
  pool: Pool,
  userId: string,
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM user_career_history
      WHERE user_id = $1::uuid
        AND entry_type = 'experience'
        AND enrichment_status = 'complete'`,
    [userId],
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}
