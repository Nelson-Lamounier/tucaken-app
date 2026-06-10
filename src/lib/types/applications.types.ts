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
 * A scheduled interview stage joined to its application — powers the calendar.
 * `slug` is the application id (the `/applications/$slug` route param).
 */
export interface ScheduledInterview {
  readonly slug: string
  readonly company: string
  readonly role: string
  readonly status: ApplicationStatus
  readonly stage: InterviewStage
  readonly stageStatus: string
  /** ISO 8601 timestamp the user scheduled (interview_stages.scheduled_at). */
  readonly scheduledAt: string
}

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
 * A node in a SystemTour's system map (architecture diagram fallback rendering).
 */
export interface SystemMapNode {
  readonly id: string
  readonly label: string
  readonly kind?: string
}

/** An edge in a SystemTour's system map. */
export interface SystemMapEdge {
  readonly from: string
  readonly to: string
  readonly label?: string
}

/**
 * The system map of a SystemTour — a grounded architecture diagram. Renders
 * `diagramSource` via the existing Mermaid renderer when present, else falls
 * back to the `nodes`/`edges` list.
 */
export interface SystemMap {
  readonly diagramFormat: 'mermaid' | 'svg'
  readonly diagramSource?: string
  readonly nodes: readonly SystemMapNode[]
  readonly edges: readonly SystemMapEdge[]
}

/**
 * A grounded per-project architecture walkthrough, generated by S7a's agent and
 * persisted in `project_system_tours`. Served by admin-api `GET /:slug` →
 * `ApplicationDetail.systemTours` (user-scoped via RLS, cap 3, newest first).
 * Real content only — never fabricated.
 */
export interface SystemTour {
  /** The area of the system this tour walks through (heading). */
  readonly area: string
  /** Why this area exists / what problem it solves. */
  readonly context: string
  /** Key architectural decisions with their rationale. */
  readonly keyDecisions: readonly { decision: string; rationale: string }[]
  /** Trade-offs taken: the tension, the chosen path, and its cost. */
  readonly tradeoffs: readonly { tension: string; chosenPath: string; cost: string }[]
  /** The system map / architecture diagram. */
  readonly systemMap: SystemMap
  /** Concrete outcomes delivered. */
  readonly outcomes: readonly string[]
  /** What the author would change with hindsight. */
  readonly whatIdChange: readonly string[]
}

/** Interview-prep pillar identifier. */
export type Pillar = 'swe-general' | 'swe-dsa' | 'devops-sre-platform' | 'ai-engineering'

/**
 * JD interview-prep pillar classification emitted by the research agent (optional).
 * Inferred from JD language only — not a guaranteed signal.
 */
export interface PillarClassification {
  readonly primaryPillar: Pillar
  readonly secondaryPillars: Pillar[]
  readonly confidence: number
  readonly jdEvidenceTokens: string[]
  readonly classificationNote: string
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

/** One retrieved KB source and its absolute cosine relevance. */
export interface KbRetrievalSource {
  readonly source: string
  readonly cosine: number
}

/**
 * Retrieval-health snapshot for a research run (RAG quality). Powers the
 * "Knowledge Base — data health" panel. Present only on runs produced after the
 * retrieval-hygiene change; absent on older runs.
 */
export interface KbRetrievalStats {
  readonly passageCount: number
  readonly maxCosine: number
  readonly medianCosine: number
  readonly minCosine: number
  readonly floor: number
  readonly topSources: readonly KbRetrievalSource[]
  readonly repoBreakdown: readonly { readonly repo: string; readonly count: number }[]
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
  /** JD interview-prep pillar classification — present only when the research agent classified the role */
  readonly pillarClassification?: PillarClassification
  /** RAG retrieval health for this run — present only on post-hygiene runs. */
  readonly kbRetrievalStats?: KbRetrievalStats
  /**
   * Ranked project references keyed by lowercased topic skill — the user's
   * documented projects most relevant to each topic. Computed live by admin-api
   * (deterministic stack/tag/name match). Absent when no projects match.
   */
  readonly topicProjectRefs?: Record<string, readonly ProjectReferenceData[]>
}

/** A deep-link to one of the user's project case-studies (routes to /projects/$id). */
export interface ProjectReferenceData {
  readonly id: string
  readonly title: string
  /** One-line pitch. */
  readonly pitch: string
  /** Top matched stack/skill tags. */
  readonly highlights?: readonly string[]
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
  /** ATS check for the persisted tailored resume (resumes.ats_check_json). */
  readonly atsCheck?: AtsCheckResult | null
}

/** One JD keyword and whether the tailored resume covers it (grounded = KB-verified). */
export interface AtsKeywordCoverage {
  readonly term: string
  readonly present: boolean
  readonly grounded: boolean
}

/**
 * ATS check result produced by the job-strategist (render resume PDF → parse
 * back → assert). Mirrors AtsCheckResultSchema in ai-applications.
 */
export interface AtsCheckResult {
  readonly machineReadable: boolean
  readonly standardSectionsDetected: readonly string[]
  readonly contactDetected: { readonly name: string; readonly email: string }
  readonly parseBreakers: readonly string[]
  readonly jdKeywordCoverage: readonly AtsKeywordCoverage[]
  readonly status: 'passed' | 'issues' | 'unverified'
  readonly passed: boolean
  readonly issues: readonly string[]
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
  /** Matches the Coach Agent contract field name (ai-applications strategist-types). */
  readonly suggestedResources: string[]
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
  /** Verified-match skills this point draws on (one-to-many). Empty/absent on legacy rows. */
  readonly matchedSkills?: readonly string[]
}

/** Phone-screen compensation conversation script */
export interface CompScript {
  readonly targetEcho: string
  readonly marketContext: string | null
  readonly deflectTemplate: string
}

/** One "what to expect" item — a short bold label and its description. */
export interface InterviewFocusItem {
  readonly label: string
  readonly detail: string
}

/** Pre-interview checklist — actionable items + an optional closing note. */
export interface FinalCheckpoint {
  readonly items: readonly string[]
  readonly note?: string
}

/**
 * Structured stage coaching emitted by the Coach Agent. Each section is its own
 * field so the UI can place them across the page without parsing prose. String
 * fields are Markdown; only `positioning` is required.
 */
/** Legacy 7-field coaching shape — kept only so the adapter can map old rows. */
export interface CoachingNotes {
  readonly positioning: string
  readonly interviewFocus?: readonly InterviewFocusItem[]
  readonly tacticalPrep?: string
  readonly communication?: string
  readonly mindset?: string
  readonly debrief?: string
  /** Structured checklist (new) or legacy Markdown string (old rows). */
  readonly finalCheckpoint?: string | FinalCheckpoint
}

/**
 * One composable coaching block. The coach emits an ordered list of these; the
 * UI distributes them to build a per-stage narrative. `checklist` present → the
 * section renders as an interactive, persisted checklist.
 */
export interface CoachingSection {
  /** Stable kebab-case id, e.g. "esl-coaching" — lets the UI place a section. */
  readonly key: string
  readonly title: string
  /** Narrative content (markdown). */
  readonly body: string
  /** When present, the section renders as a tickable checklist. */
  readonly checklist?: readonly string[]
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
  /**
   * Stage coaching. New rows are a structured `CoachingNotes` object; legacy
   * rows are a Markdown string. `parseCoachingSections` handles both.
   */
  readonly coachingNotes: string | CoachingNotes | readonly CoachingSection[]
  /** Phone-screen only: 2-3 sentence career-arc narrative */
  readonly careerArcSummary?: string
  /** Phone-screen only: JD-cross-referenced verified talking points */
  readonly jdTalkingPoints?: readonly PhoneScreenTalkingPoint[]
  /** Phone-screen only: compensation conversation script */
  readonly compScript?: CompScript
  /** System-design only: project-anchored walkthrough, one card per JD-relevant concern. */
  readonly systemDesignWalkthrough?: readonly SystemDesignCard[]
  /** System-design only: concern-coverage summary (code-authoritative). */
  readonly systemDesignCoverage?: SystemDesignCoverage
  /** Bar-raiser only: grounded leadership-principle walkthrough, one card per principle. */
  readonly barRaiserWalkthrough?: readonly BarRaiserPrinciple[]
  /** Bar-raiser only: leadership-principle coverage summary (code-authoritative). */
  readonly barRaiserCoverage?: BarRaiserCoverage
  /** Final only: grounded pre-final-round prep (why-this-role, mutual fit, substantive questions, long-term framing). */
  readonly finalPrep?: FinalPrep
}

/** One mutual-fit talking point for the final round, grounded in evidence. */
export interface FinalTalkingPoint {
  readonly point: string
  readonly grounding: string
}

/** One substantive question for the candidate to ask in the final round. */
export interface FinalQuestion {
  readonly question: string
  readonly rationale: string
}

/** Grounded pre-final-round prep emitted by the Coach Agent (final stage only). */
export interface FinalPrep {
  /** Narrative on why this role fits (whitespace-pre-line). */
  readonly whyThisRole: string
  /** Mutual-fit talking points, each grounded in evidence. */
  readonly mutualFitTalkingPoints: readonly FinalTalkingPoint[]
  /** Substantive questions to ask, each with its rationale. */
  readonly substantiveQuestions: readonly FinalQuestion[]
  /** Long-term framing for the role / trajectory. */
  readonly longTermFraming: string
}

/** Evidence pointer cited by a System Design walkthrough card. */
export interface EvidenceRef {
  readonly source: string
  readonly id: string
  readonly label: string
  readonly fileLine?: string
}

export type SystemDesignFollowUpStatus = 'addressed' | 'partial' | 'gap'

/** A follow-up the interviewer might ask, with how the candidate handles it. */
export interface SystemDesignFollowUp {
  readonly question: string
  readonly status: SystemDesignFollowUpStatus
  readonly framing: string
}

/** One concern in the project-anchored System Design walkthrough. */
export interface SystemDesignCard {
  readonly concernId: string
  readonly concernQuestion: string
  readonly whyItMatters: string
  readonly evidenceRefs: readonly EvidenceRef[]
  readonly choiceMade: string | null
  readonly articulation: string
  readonly followUps: readonly SystemDesignFollowUp[]
  readonly gapGuidance: string | null
}

/** Code-authoritative concern coverage for the System Design walkthrough. */
export interface SystemDesignCoverage {
  readonly relevantTotal: number
  readonly relevantAddressed: number
}

/** One grounded STAR story backing a Bar Raiser leadership principle. */
export interface BarRaiserStory {
  readonly title: string
  readonly situation: string
  readonly task: string
  readonly action: string
  readonly result: string
  readonly evidenceRefs: readonly EvidenceRef[]
  /** Load-bearing: how to keep the story honest (claimed vs demonstrated). */
  readonly honestyCalibration: string
  /** What lands this story at the target seniority. */
  readonly seniorityNote: string
}

/** Coverage strength for one leadership principle. */
export type BarRaiserPrincipleCoverage = 'strong' | 'partial' | 'none'

/** One principle in the project-anchored Bar Raiser walkthrough. */
export interface BarRaiserPrinciple {
  readonly principleId: string
  readonly principleName: string
  readonly interpretation: string
  readonly coverage: BarRaiserPrincipleCoverage
  readonly stories: readonly BarRaiserStory[]
  readonly probingQuestions: readonly { question: string; framing: string }[]
  readonly gapGuidance: string | null
}

/** Code-authoritative principle coverage for the Bar Raiser walkthrough. */
export interface BarRaiserCoverage {
  readonly relevantTotal: number
  readonly relevantAddressed: number
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
   * Grounded per-project architecture walkthroughs (user-scoped, cap 3, newest
   * first). Served from `project_system_tours`. Surfaced in the System Design
   * workspace for system-design / architecture-review rounds. Omitted when the
   * query failed (fail-open) or the user has no generated tours.
   */
  readonly systemTours?: SystemTour[]
  /**
   * Per-stage lifecycle state, keyed by stage_type. Populated by the stages
   * endpoint and used to drive the interview-prep UI (scheduling, prep status,
   * user annotations). May be absent on older records.
   */
  readonly stages?: Record<string, StageState>
  /**
   * User annotations, keyed by the insight item id (e.g. `gap-Ruby`). Each item
   * carries its section + label and a list of timestamped notes. Persisted on
   * `job_applications.user_annotations` (JSONB). Absent on older records.
   */
  readonly userAnnotations?: Record<string, ItemAnnotations>
}

// =============================================================================
// ANNOTATIONS
// =============================================================================

/** A single timestamped annotation on an insight item. */
export interface Annotation {
  readonly id: string
  readonly text: string
  readonly createdAt: string
}

/** All annotations for one insight item, with the section/label for the breakdown view. */
export interface ItemAnnotations {
  /** Group/section the item belongs to (e.g. "Skills gaps"). */
  readonly section?: string
  /** Item label (e.g. "Ruby"). */
  readonly label: string
  readonly notes: readonly Annotation[]
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
// FUNNEL ANALYTICS — Search-analytics dashboard (2026-framed)
// =============================================================================

/**
 * Top-line search summary, plain-language only — no score, no velocity.
 *
 * @see GET /applications/analytics/funnel — admin-api `summary`
 */
export interface FunnelSummary {
  /** Total roles applied to. */
  readonly totalApplied: number
  /** Days since the first application. */
  readonly daysSinceFirstApplied: number
  /** Applications currently active (not terminal). */
  readonly active: number
  /** Applications that advanced past the phone screen. */
  readonly advancedPastScreen: number
  /** Applications that reached a final round. */
  readonly reachedFinal: number
  /** Offers received. */
  readonly offers: number
}

/** Band classifying a transition rate against an honest reference range. */
export type FunnelBand = 'above' | 'typical' | 'below'

/**
 * One stage-to-stage transition in the funnel. `context` is the honest range
 * qualifier — a rate must NEVER render without it.
 *
 * @see GET /applications/analytics/funnel — admin-api `transitions[]`
 */
export interface FunnelTransition {
  /** Stable transition key (e.g. 'applied->screen'). */
  readonly key: string
  /** Count entering this transition. */
  readonly fromCount: number
  /** Count that advanced through it. */
  readonly toCount: number
  /** Conversion rate (0–1). */
  readonly rate: number
  /** Band relative to the honest reference range. */
  readonly band: FunnelBand
  /** Honest range qualifier string — the load-bearing context for the rate. */
  readonly context: string
}

/**
 * 2026-search reference ranges that contextualise the funnel.
 *
 * @see GET /applications/analytics/funnel — admin-api `ranges`
 */
export interface FunnelRanges {
  /** ISO 8601 timestamp the figures were computed. */
  readonly asOf: string
  /** Median days to an offer in the reference cohort (null when unknown). */
  readonly medianDaysToOffer: number | null
  /** Per-transition reference context strings, keyed by transition key. */
  readonly transitions: Record<string, string>
}

/**
 * Full funnel analytics payload.
 *
 * @see GET /applications/analytics/funnel
 */
export interface FunnelAnalytics {
  readonly summary: FunnelSummary
  readonly transitions: readonly FunnelTransition[]
  readonly ranges: FunnelRanges
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

// =============================================================================
// STAGE OUTCOME + FEEDBACK
// =============================================================================

/**
 * Per-stage outcome. The five stored values plus 'ghosted', which admin-api
 * derives (a stage left `not_completed` past its expected window).
 *
 * @see PUT /applications/:slug/stages/:stage/feedback
 */
export type StageOutcome = 'advanced' | 'rejected' | 'withdrew' | 'not_completed' | 'skipped' | 'ghosted'

/** Opt-in feedback category the user can attribute a terminal outcome to. */
export type FeedbackCategory =
  | 'compensation'
  | 'skills_mismatch'
  | 'culture_fit'
  | 'communication'
  | 'technical_perf'
  | 'process_timing'
  | 'unclear'
  | 'other'

/**
 * Opt-in feedback the user captures at a terminal stage outcome. Every field
 * is optional — the whole capture is voluntary.
 *
 * @see PUT /applications/:slug/stages/:stage/feedback
 */
export interface StageFeedback {
  readonly userCategory?: FeedbackCategory
  readonly userNote?: string
  readonly companyFeedback?: string
  readonly companyFeedbackVerbatim?: boolean
  readonly prepSelfRating?: number
}
