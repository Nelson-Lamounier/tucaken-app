/**
 * @format
 * Admin/user reads backing the per-user RAG view + the user activity panel.
 *
 *   getUserRepositories  — admin: a user's synced repos with KB-quality +
 *                          retrieval (RAG) metrics. repo_sync_state ⋈
 *                          repository_profiles (classification lives on the
 *                          profile, not the sync row).
 *   getUserDiagnostic    — admin: the full Resume-Readiness diagnostic for an
 *                          arbitrary user (the user-facing /profile/summary only
 *                          returns the caller's own rollup).
 *   getDailyActivity     — user: applications + resumes generated per day. Two
 *                          grouped reads merged + zero-filled into a dense series
 *                          via the pure buildDailySeries() helper (unit-tested).
 */
import type { Pool } from 'pg';

type Queryable = Pick<Pool, 'query'>;

// =============================================================================
// PER-USER REPOSITORIES + RAG METRICS (admin)
// =============================================================================

export interface RepoRagSummary {
    readonly repoFullName: string;
    readonly classification: string | null;
    readonly extractionStatus: string | null;
    readonly syncStatus: string | null;
    readonly kbQualityScore: number | null;
    readonly kbQualityBreakdown: unknown | null;
    readonly retrievalScore: number | null;
    readonly retrievalBreakdown: unknown | null;
    readonly chunkCount: number | null;
    readonly fileCount: number | null;
    readonly embeddedCount: number | null;
    readonly lastSyncedAt: string | null;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : (v as string | null) ?? null);

export async function getUserRepositories(pool: Queryable, userId: string): Promise<RepoRagSummary[]> {
    const { rows } = await pool.query(
        `SELECT s.repo_full_name,
                p.classification,
                p.extraction_status,
                s.sync_status,
                s.kb_quality_score,
                s.kb_quality_breakdown,
                s.retrieval_score,
                s.retrieval_breakdown,
                s.chunk_count,
                s.file_count,
                s.embedded_count,
                s.last_synced_at
           FROM repo_sync_state s
           LEFT JOIN repository_profiles p
             ON p.repo_full_name = s.repo_full_name AND p.user_id = s.user_id
          WHERE s.user_id = $1::uuid
          ORDER BY s.kb_quality_score DESC NULLS LAST, s.repo_full_name`,
        [userId],
    );
    return rows.map((r) => ({
        repoFullName:       r.repo_full_name,
        classification:     r.classification ?? null,
        extractionStatus:   r.extraction_status ?? null,
        syncStatus:         r.sync_status ?? null,
        kbQualityScore:     num(r.kb_quality_score),
        kbQualityBreakdown: r.kb_quality_breakdown ?? null,
        retrievalScore:     num(r.retrieval_score),
        retrievalBreakdown: r.retrieval_breakdown ?? null,
        chunkCount:         num(r.chunk_count),
        fileCount:          num(r.file_count),
        embeddedCount:      num(r.embedded_count),
        lastSyncedAt:       iso(r.last_synced_at),
    }));
}

export interface KbHealth {
    readonly repositories: RepoRagSummary[];
    readonly totals: {
        readonly repoCount: number;
        readonly files: number;
        readonly chunks: number;
        readonly embedded: number;
        /** Mean kb_quality_score across repos that have one (0..1), or null. */
        readonly avgKbQuality: number | null;
    };
}

/**
 * Aggregate a user's repositories into KB-health totals for the at-a-glance
 * panel. Pure over the already-fetched rows so it is unit-tested without a DB.
 */
export function summariseKbHealth(repositories: RepoRagSummary[]): KbHealth {
    let files = 0;
    let chunks = 0;
    let embedded = 0;
    let qualitySum = 0;
    let qualityN = 0;
    for (const r of repositories) {
        files += r.fileCount ?? 0;
        chunks += r.chunkCount ?? 0;
        embedded += r.embeddedCount ?? 0;
        if (r.kbQualityScore != null) {
            qualitySum += r.kbQualityScore;
            qualityN += 1;
        }
    }
    return {
        repositories,
        totals: {
            repoCount: repositories.length,
            files,
            chunks,
            embedded,
            avgKbQuality: qualityN === 0 ? null : qualitySum / qualityN,
        },
    };
}

/** Single repo's RAG detail, or null when the user has no such synced repo. */
export async function getUserRepository(
    pool: Queryable,
    userId: string,
    repoFullName: string,
): Promise<RepoRagSummary | null> {
    const all = await getUserRepositories(pool, userId);
    return all.find((r) => r.repoFullName === repoFullName) ?? null;
}

// =============================================================================
// PER-USER READINESS DIAGNOSTIC (admin)
// =============================================================================

export interface UserDiagnostic {
    readonly diagnostic: unknown | null;
    readonly refreshedAt: string | null;
}

export async function getUserDiagnostic(pool: Queryable, userId: string): Promise<UserDiagnostic | null> {
    const { rows } = await pool.query(
        `SELECT diagnostic, refreshed_at FROM user_profile_rollup WHERE user_id = $1::uuid`,
        [userId],
    );
    const r = rows[0];
    if (!r) return null;
    return { diagnostic: r.diagnostic ?? null, refreshedAt: iso(r.refreshed_at) };
}

// =============================================================================
// DAILY ACTIVITY (user) — applications + resumes generated per day
// =============================================================================

export interface DailyActivity {
    readonly date: string; // YYYY-MM-DD (UTC)
    readonly applications: number;
    readonly resumes: number;
}

export interface ActivitySeries {
    readonly days: DailyActivity[];
    readonly totals: { applications: number; resumes: number };
}

interface DayCount {
    readonly day: string;
    readonly n: number;
}

/**
 * Merge per-day application + resume counts into a dense, zero-filled series of
 * `days` entries ending on `todayUtc` (inclusive), oldest → newest. Pure so the
 * merge/zero-fill is unit-tested without a DB or a clock.
 *
 * @param todayUtc reference day as YYYY-MM-DD (UTC). Days run [today-(days-1), today].
 */
export function buildDailySeries(
    appRows: readonly DayCount[],
    resumeRows: readonly DayCount[],
    days: number,
    todayUtc: string,
): ActivitySeries {
    const appByDay = new Map(appRows.map((r) => [r.day, r.n]));
    const resByDay = new Map(resumeRows.map((r) => [r.day, r.n]));

    const out: DailyActivity[] = [];
    let totalApps = 0;
    let totalResumes = 0;

    // Walk back `days-1` days from todayUtc, emitting oldest first.
    const base = Date.parse(`${todayUtc}T00:00:00Z`);
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(base - i * 86_400_000).toISOString().slice(0, 10);
        const applications = appByDay.get(date) ?? 0;
        const resumes = resByDay.get(date) ?? 0;
        totalApps += applications;
        totalResumes += resumes;
        out.push({ date, applications, resumes });
    }

    return { days: out, totals: { applications: totalApps, resumes: totalResumes } };
}

export async function getDailyActivity(
    pool: Queryable,
    userId: string,
    days: number,
    todayUtc: string,
): Promise<ActivitySeries> {
    const window = `${days} days`;
    const [apps, resumes] = await Promise.all([
        pool.query(
            `SELECT to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
               FROM job_applications
              WHERE user_id = $1::uuid AND created_at >= now() - $2::interval
              GROUP BY day`,
            [userId, window],
        ),
        pool.query(
            `SELECT to_char((generated_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
               FROM resumes
              WHERE user_id = $1::uuid AND generated_at >= now() - $2::interval
              GROUP BY day`,
            [userId, window],
        ),
    ]);
    return buildDailySeries(
        apps.rows as DayCount[],
        resumes.rows as DayCount[],
        days,
        todayUtc,
    );
}
