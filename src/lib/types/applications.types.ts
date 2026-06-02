/**
 * Job Applications — Shared Types
 *
 * TypeScript interfaces and union types for the Job Applications pipeline.
 * Derived from the infrastructure contracts in `applications-types.ts`,
 * `trigger-handler.ts`, `coach-handler.ts`, and `applications-data-stack.ts`.
 *
 * Used by:
 * - Next.js API routes (server-side DynamoDB/Lambda calls)
 * - TanStack Query hooks (client-side data fetching)
 * - Page components (rendering pipeline output)
 */

import type { ResumeData } from '../resumes/resume-data'

// =============================================================================
// JSON VALUE — serialisable primitive used where Record<string, unknown> would
// break TanStack Start's ValidateSerializableMapped strict-mode check.
// =============================================================================

type JsonPrimitive = string | number | boolean | null
/** Recursively JSON-serialisable value. Replaces `unknown` in index signatures. */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

// =============================================================================
// ENUMS / UNION TYPES
// =============================================================================

/**
 * Application lifecycle status.
 * Matches the DynamoDB GSI1 partition key pattern: `APP_STATUS#<status>`.
 */
export type ApplicationStatus =
  | 'analysing'
  | 'analysis-ready'
  | 'coaching'
  | 'interview-prep'
  | 'applied'
  | 'interviewing'
  | 'offer-received'
  | 'accepted'
  | 'withdrawn'
  | 'rejected'
  | 'failed'

/**
 * Interview stage progression.
 * Used by the Coach agent to tailor interview preparation.
 */
export type InterviewStage =
  | 'applied'
  | 'phone-screen'
  | 'technical'
  | 'system-design'
  | 'behavioural'
  | 'bar-raiser'
  | 'final'

/**
 * Overall fit rating assigned by the Research Agent.
 * Determines the colour-coding on dashboard cards.
 */
export type FitRating =
  | 'STRONG_FIT'
  | 'REASONABLE_FIT'
  | 'STRETCH'
  | 'REACH'

/**
 * Application recommendation from the Applications Agent.
 * Shown as a banner on the detail page.
 */
export type ApplicationRecommendation =
  | 'APPLY'
  | 'APPLY_WITH_CAVEATS'
  | 'STRETCH_APPLICATION'
  | 'NOT_RECOMMENDED'

// =============================================================================
// API CONTRACTS — Analysis Trigger (Research → Applications State Machine)
// =============================================================================

/**
 * Request body for the Analysis trigger Lambda.
 * Invokes the Research → Applications pipeline.
 *
 * @see POST /api/admin/applications/trigger
 */
export interface AnalyseTriggerBody {
  /** Raw job description text (free-form, pasted) */
  readonly jobDescription: string
  /** Target company name (e.g. "Revolut") */
  readonly targetCompany: string
  /** Target role title (e.g. "Senior DevOps Engineer") */
  readonly targetRole: string
  /** Interview stage — defaults to 'applied' if omitted */
  readonly interviewStage?: InterviewStage
  /** Resume version ID — undefined means use the active resume */
  readonly resumeId?: string
  /** Whether to generate a cover letter — defaults to true */
  readonly includeCoverLetter?: boolean
}

/**
 * @deprecated Use AnalyseTriggerBody instead
 * Kept for backward compatibility with existing consumers.
 */
export type TriggerRequestBody = AnalyseTriggerBody

// =============================================================================
// API CONTRACTS — Coach Trigger (CoachLoader → Coach State Machine)
// =============================================================================

/**
 * Request body for the Coach trigger Lambda.
 * Invokes the Coach pipeline for a specific interview stage.
 *
 * @see POST /api/admin/applications/coach
 */
export interface CoachTriggerBody {
  /** The existing application slug to prepare for */
  readonly applicationSlug: string
  /** Interview stage to prepare for (e.g. 'phone-screen') */
  readonly interviewStage: InterviewStage
}

/**
 * Response from the strategist-job pipeline trigger.
 */
export interface TriggerResponse {
  /** Always 'queued' on trigger */
  readonly status: 'queued'
  /** UUID used to poll /api/admin/pipelines/runs/:id */
  readonly pipelineRunId: string
  /** K8s Job name */
  readonly jobName: string
  /** UUID of the created job_applications row */
  readonly applicationId: string
  /** Same as applicationId (used as the route slug) */
  readonly applicationSlug: string
}

// =============================================================================
// APPLICATION SUMMARY (List Endpoint)
// =============================================================================

/**
 * Lightweight application summary for the dashboard listing.
 * Returned by `GET /api/admin/applications/applications`.
 */
export interface ApplicationSummary {
  /** Kebab-case application slug */
  readonly slug: string
  /** Target company name */
  readonly targetCompany: string
  /** Target role title */
  readonly targetRole: string
  /** Current lifecycle status */
  readonly status: ApplicationStatus
  /** Overall fit rating (may be undefined while analysing) */
  readonly fitRating?: FitRating
  /** Application recommendation (may be undefined while analysing) */
  readonly recommendation?: ApplicationRecommendation
  /** Current interview stage */
  readonly interviewStage: InterviewStage
  /** Cumulative pipeline cost in USD */
  readonly costUsd?: number
  /** ISO 8601 creation timestamp */
  readonly createdAt: string
  /** ISO 8601 last-updated timestamp */
  readonly updatedAt: string
}

// =============================================================================
// APPLICATION DETAIL (Detail Endpoint)
// =============================================================================

/** Verified skill match from the Research Agent */
export interface VerifiedMatch {
  readonly skill: string
  readonly sourceCitation: string
  readonly depthBadge: string
  readonly recency: string
}

/** Partial skill match from the Research Agent */
export interface PartialMatch {
  readonly skill: string
  readonly gapDescription: string
  readonly transferableFoundation: string
  readonly framingSuggestion: string
}

/** Skills gap identified by the Research Agent */
export interface SkillGap {
  readonly skill: string
  readonly gapType: 'hard' | 'soft'
  readonly severity: string
  readonly isDisqualifying: boolean
}

/** Experience signal from the Research Agent */
export interface ExperienceSignal {
  readonly yearsExpected: string
  readonly domain: string
  readonly leadership: string
  readonly scale: string
}

/** Technology category from the Research Agent's inventory */
export interface TechnologyInventory {
  readonly languages: string[]
  readonly frameworks: string[]
  readonly infrastructure: string[]
  readonly tools: string[]
  readonly methodologies: string[]
}

/**
 * A single DSA topic aggregated from real-work `dsa_evidence` rows.
 * Served by admin-api `GET /:slug` → `ApplicationDetail.dsaRealWork`.
 * User-scoped (RLS). Absent when no GitHub repos have been scanned or no
 * DSA patterns were detected.
 */
export interface DsaRealWorkTopic {
  /** Joins to `DsaTopicCalibration.likelyTopics[].canonicalName` */
  readonly canonicalName: string
  /** Total number of matching evidence rows across all user repos */
  readonly matchCount: number
  /** Highest confidence score among the matched rows (0–1) */
  readonly topConfidence: number
  /** Distinct detector signal names, e.g. ['networkx_import', 'heap'] */
  readonly signals: string[]
  /** Up to 3 highest-confidence sample locations */
  readonly samples: { repo: string; file: string; line: number }[]
}

/**
 * DSA topic calibration from the job-strategist research agent.
 * Present in pipeline_runs.metadata.research when the research run includes
 * DSA topic inference (optional field — absent for older runs).
 */
export interface DsaTopicCalibration {
  readonly likelyTopics: readonly {
    readonly canonicalName: string
    readonly displayName: string
    readonly confidence: number
    readonly rationale: string
    readonly jdEvidenceQuote: string
  }[]
  readonly honestyNote: string
}

/** Research Agent output — part of ApplicationDetail */
export interface ResearchOutput {
  readonly fitSummary: string
  readonly fitRating: FitRating
  readonly verifiedMatches: VerifiedMatch[]
  readonly partialMatches: PartialMatch[]
  readonly gaps: SkillGap[]
  readonly experienceSignals: ExperienceSignal
  readonly technologyInventory: TechnologyInventory
  /** DSA topic calibration — present only when the research agent inferred topics */
  readonly dsaTopicCalibration?: DsaTopicCalibration
}

/** Analysis metadata from the Applications Agent */
export interface AnalysisMetadata {
  readonly overallFitRating: FitRating
  readonly applicationRecommendation: ApplicationRecommendation
}

// =============================================================================
// RESUME SUGGESTION ITEMS — Structured per-section suggestions
// =============================================================================

/** A suggested bullet point to add to a resume section */
export interface ResumeAdditionSuggestion {
  /** Target resume section (e.g. "Experience — Acme Corp") */
  readonly section: string
  /** The suggested bullet point text */
  readonly suggestedBullet: string
  /** Optional KB citation or source reference */
  readonly sourceCitation?: string
}

/** A reframe suggestion with original → improved text */
export interface ResumeReframeSuggestion {
  /** Target resume section */
  readonly section: string
  /** Original bullet text */
  readonly original: string
  /** Suggested reframe */
  readonly suggested: string
  /** Rationale for the reframe */
  readonly rationale: string
}

/** An ESL grammar/phrasing correction */
export interface ResumeEslCorrection {
  /** Original text with the ESL issue */
  readonly original: string
  /** Corrected text */
  readonly corrected: string
}

/** Resume modification suggestions from the Applications Agent */
export interface ResumeSuggestions {
  /** Count of addition suggestions */
  readonly additions: number
  /** Count of reframe suggestions */
  readonly reframes: number
  /** Count of ESL corrections */
  readonly eslCorrections: number
  /** High-level summary of suggestions */
  readonly summary: string
  /** Per-section addition suggestions (populated by pipeline) */
  readonly additionItems?: ResumeAdditionSuggestion[]
  /** Per-section reframe suggestions (populated by pipeline) */
  readonly reframeItems?: ResumeReframeSuggestion[]
  /** ESL correction items (populated by pipeline) */
  readonly eslCorrectionItems?: ResumeEslCorrection[]
}

/** Applications Agent output — part of ApplicationDetail */
export interface AnalysisOutput {
  /** Full XML analysis document */
  readonly analysisXml: string
  /** Generated cover letter (plain text or Markdown). Null if skipped. */
  readonly coverLetter: string | null
  /** Structured analysis metadata */
  readonly metadata: AnalysisMetadata
  /** Resume modification suggestions */
  readonly resumeSuggestions: ResumeSuggestions
  /** Generated tailored resume from the Applications Agent */
  readonly tailoredResume?: ResumeData
}

/** Interview question from the Coach Agent */
export interface InterviewQuestion {
  readonly question: string
  readonly difficulty: string
  readonly answerFramework: string
  readonly keyPoints: string[]
  readonly sourceProject?: string
}

/** Difficult/bridging question from the Coach Agent */
export interface DifficultQuestion {
  readonly question: string
  readonly answerFramework: string
  readonly bridgeStrategy: string
}

/** Technical preparation item from the Coach Agent */
export interface TechnicalPrepItem {
  readonly topic: string
  readonly priority: string
  readonly rationale: string
  readonly resources: string[]
}

/** Question to ask the interviewer */
export interface QuestionToAsk {
  readonly question: string
  readonly rationale: string
}

/** Phone-screen talking point: a verified strength cross-referenced against the JD */
export interface PhoneScreenTalkingPoint {
  readonly point: string
  readonly evidence: string
}

/** Phone-screen compensation conversation script */
export interface CompScript {
  readonly targetEcho: string
  readonly marketContext: string | null
  readonly deflectTemplate: string
}

/** Coach Agent output — part of ApplicationDetail */
export interface InterviewPrepOutput {
  /** Current interview stage */
  readonly stage: InterviewStage
  /** Human-readable stage description */
  readonly stageDescription: string
  /** Technical questions for this stage */
  readonly technicalQuestions: InterviewQuestion[]
  /** Behavioural questions for this stage */
  readonly behaviouralQuestions: InterviewQuestion[]
  /** Difficult/bridging questions */
  readonly difficultQuestions: DifficultQuestion[]
  /** Technical preparation checklist */
  readonly technicalPrepChecklist: TechnicalPrepItem[]
  /** Questions to ask the interviewer */
  readonly questionsToAsk: QuestionToAsk[]
  /** Free-text coaching notes (Markdown) */
  readonly coachingNotes: string
  /** Phone-screen only: 2-3 sentence career-arc narrative */
  readonly careerArcSummary?: string
  /** Phone-screen only: JD-cross-referenced verified talking points */
  readonly jdTalkingPoints?: readonly PhoneScreenTalkingPoint[]
  /** Phone-screen only: compensation conversation script */
  readonly compScript?: CompScript
}

/**
 * Per-stage coaching payload as the detail endpoint actually returns it
 * (`application.coaching[stage]`). `topics` is the FULL `InterviewCoachResult`
 * JSON the Coach Agent emitted (the admin-api stores it under `topics_to_study`
 * and returns it verbatim); `questions` is the grouped subset; `personal` is the
 * extracted highlights array (shape not guaranteed — left `unknown`).
 */
export interface StageCoaching {
  readonly topics: InterviewPrepOutput | null
  readonly questions: {
    readonly technical?: InterviewQuestion[]
    readonly behavioural?: InterviewQuestion[]
    readonly difficult?: DifficultQuestion[]
  } | null
  /**
   * Extracted personal highlights. The Coach Agent's persisted shape isn't
   * guaranteed; typed as a string array (the common case) and not rendered in
   * the v1 wiring. Widen if a richer shape is confirmed.
   */
  readonly personal: readonly string[] | null
}

/** Pipeline execution context with token/cost tracking */
export interface PipelineContext {
  readonly pipelineId: string
  readonly cumulativeInputTokens: number
  readonly cumulativeOutputTokens: number
  readonly cumulativeThinkingTokens: number
  readonly cumulativeCostUsd: number
}

/**
 * A single DevOps/infrastructure topic found in the user's technology_evidence,
 * mapped via devops_topic_mappings. Tier-1 only: artifact presence, not competence.
 */
export interface DevopsTopicEvidence {
  readonly canonicalTopicName: string
  readonly displayName: string
  readonly topicGroup: string
  readonly artifactCount: number
  readonly samples: { repo: string; file: string; line: number; rawName: string }[]
}

/**
 * Full application detail — combines all three agent outputs.
 * Returned by `GET /api/admin/applications/applications/[slug]`.
 */
export interface ApplicationDetail {
  /** Application slug */
  readonly slug: string
  /** Target company */
  readonly targetCompany: string
  /** Target role */
  readonly targetRole: string
  /** Current lifecycle status */
  readonly status: ApplicationStatus
  /** Current interview stage */
  readonly interviewStage: InterviewStage
  /** ISO 8601 creation timestamp */
  readonly createdAt: string
  /** ISO 8601 last-updated timestamp */
  readonly updatedAt: string
  /** Pipeline execution context */
  readonly context: PipelineContext
  /** Research Agent output (may be null while analysing) */
  readonly research: ResearchOutput | null
  /** Applications Agent output (may be null while analysing) */
  readonly analysis: AnalysisOutput | null
  /**
   * The type of technical round inferred from the company's interview profile.
   * Defaults to 'dsa' when no company profile or round_type is available.
   */
  readonly technicalRoundType?: 'dsa' | 'practical' | 'take-home' | 'system-design' | 'behavioural' | 'mixed' | 'troubleshooting' | 'architecture-review' | 'hands-on-lab'
  /**
   * Real-work DSA evidence aggregated from `dsa_evidence` (user-scoped, all repos).
   * Absent when the query failed (fail-open) or no patterns were detected.
   * Join to `research.dsaTopicCalibration.likelyTopics` on `canonicalName`.
   */
  readonly dsaRealWork?: DsaRealWorkTopic[]
  /** Coach Agent output (may be null if no interview prep yet) */
  readonly interviewPrep: InterviewPrepOutput | null
  /**
   * Per-stage coaching, keyed by stage_type. The detail endpoint populates this
   * (and leaves `interviewPrep` null); each stage's `.topics` is the full Coach
   * output for that stage. May be absent until the Coach Job has run for a stage.
   */
  readonly coaching?: Record<string, StageCoaching> | null
  /**
   * DevOps/infrastructure evidence: technology_evidence rows resolved through
   * devops_topic_mappings. Tier-1 (artifact presence) — never a competence claim.
   * Omitted when the join query fails (fail-open) or returns no rows.
   */
  readonly devopsEvidence?: DevopsTopicEvidence[]
  /**
   * Per-stage lifecycle state, keyed by stage_type. Populated by the stages
   * endpoint and used to drive the interview-prep UI (scheduling, prep status,
   * user annotations). May be absent on older records.
   */
  readonly stages?: Record<string, StageState>
}

// =============================================================================
// STAGE STATE
// =============================================================================

/**
 * Per-stage lifecycle state as stored by the admin-api stages endpoint.
 * Keyed by stage_type in `ApplicationDetail.stages`.
 *
 * @see PATCH /api/admin/applications/:slug/stages/:stage
 */
export interface StageState {
  readonly stage_status: 'upcoming' | 'current' | 'completed' | 'not_applicable'
  readonly prep_status: 'none' | 'queued' | 'ready' | 'failed'
  readonly scheduled_at: string | null
  /** Arbitrary user annotations — JSON-serialisable to satisfy TanStack Start's strict serialization check. */
  readonly user_state: { [key: string]: JsonValue }
  readonly coach_run_id: string | null
}

// =============================================================================
// STATUS UPDATE
// =============================================================================

/**
 * Request body for PATCH status updates.
 *
 * @see PATCH /api/admin/applications/applications/[slug]/status
 */
export interface StatusUpdateRequest {
  /** New lifecycle status */
  readonly status: ApplicationStatus
  /** Optional: new interview stage (relevant for 'interviewing' status) */
  readonly interviewStage?: InterviewStage
}

/** Response from a status update */
export interface StatusUpdateResponse {
  readonly success: boolean
  readonly status: ApplicationStatus
  readonly message: string
}
