/** JSON-compatible value used for jsonb columns surfaced via the API. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

/**
 * Frontend mirror of admin-api `ProjectSummary` (admin-api/src/lib/repositories/projects.ts).
 * Keep in sync when the upstream shape changes.
 */
export interface ProjectSummary {
  id: string
  slug: string
  name: string
  tagline: string | null
  type: ProjectType
  shape: ProjectShape
  status: ProjectStatus
  role_exhibited: ProjectRole
  visibility: ProjectVisibility
  is_ai_suggested: boolean
  is_user_confirmed: boolean
  case_study_status: CaseStudyStatus | null
  case_study_generated_at: string | null
  /** Add-time intent action waiting for the first ingestion to apply. */
  post_sync_action: string | null
  last_activity_at: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
  repository_count: number
  /** Newest successful sync across the project's member repos (null if none). */
  latest_repo_sync_at: string | null
  /**
   * True when a member repo synced after the case study was generated — the
   * case study no longer reflects the code; prompt the user to regenerate.
   */
  case_study_stale: boolean
}

export type ProjectType =
  | 'side_project'
  | 'open_source'
  | 'production_saas'
  | 'client_work'
  | 'internal_tool'
  | 'learning_project'

export type ProjectShape = 'single_repo' | 'multi_repo' | 'monorepo_subset'

export type ProjectStatus = 'active' | 'stable' | 'dormant' | 'archived'

export type ProjectRole = 'sole_builder' | 'lead' | 'contributor' | 'maintainer'

export type ProjectVisibility = 'private' | 'unlisted' | 'public'

export type CaseStudyStatus = 'pending' | 'running' | 'complete' | 'failed'

export interface ProjectListResponse {
  total: number
  limit: number
  offset: number
  items: ProjectSummary[]
}

export interface ProjectListParams {
  limit?: number
  offset?: number
  includeArchived?: boolean
  proposalsOnly?: boolean
}

export const PROJECT_TYPE_LABELS: Readonly<Record<ProjectType, string>> = {
  side_project:     'Side project',
  open_source:      'Open source',
  production_saas:  'Production SaaS',
  client_work:      'Client work',
  internal_tool:    'Internal tool',
  learning_project: 'Learning',
}

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  active:   'Active',
  stable:   'Stable',
  dormant:  'Dormant',
  archived: 'Archived',
}

export const PROJECT_ROLE_LABELS: Readonly<Record<ProjectRole, string>> = {
  sole_builder: 'Sole builder',
  lead:         'Lead',
  contributor:  'Contributor',
  maintainer:   'Maintainer',
}

// ─── Detail shape (mirror of admin-api ProjectDetail) ───────────────────────

export type ComponentKind =
  | 'frontend' | 'backend' | 'infra' | 'mobile' | 'data' | 'ml' | 'docs' | 'shared'

export interface ProjectComponent {
  id:          string
  name:        string
  kind:        ComponentKind
  order_index: number
}

export type RepoSyncStatus = 'pending' | 'syncing' | 'complete' | 'error'

export interface ProjectRepositoryLink {
  component_id:    string
  repository_id:   string
  repository_name: string
  subpath:         string
  /** Last successful ingestion of this repo (null = never synced). */
  last_synced_at:  string | null
  /** Current sync state of this repo, if tracked. */
  sync_status:     RepoSyncStatus | null
}

export type DecisionConfidence = 'high' | 'medium' | 'low'

export interface ProjectDecision {
  id:                string
  title:             string
  context:           string | null
  decision:          string | null
  consequences:      string | null
  confidence:        DecisionConfidence
  is_user_confirmed: boolean
  source_signals:    JsonValue
  order_index:       number
}

export interface ProjectHighlight {
  id:             string
  title:          string
  description:    string | null
  source_signals: JsonValue
  order_index:    number
}

export interface ProjectChallenge {
  id:             string
  problem:        string
  solution:       string | null
  source_signals: JsonValue
  order_index:    number
}

export type StackCategory =
  | 'language' | 'framework' | 'database' | 'infrastructure'
  | 'observability' | 'ci_cd' | 'external_service'

export interface ProjectStackItem {
  id:                   string
  category:             StackCategory
  name:                 string
  justification:        string | null
  used_in_component_id: string | null
  source_signals:       JsonValue
  order_index:          number
}

/**
 * SBOM-grounded dependency identity, stamped server-side into a stack item's
 * `source_signals.verifiedTech[]` (ai-applications case-study pipeline). Lets
 * the UI show the real version + a purl link instead of a bare tech name.
 */
export interface VerifiedTech {
  name:    string
  version: string | null
  purl:    string | null
  path:    string | null
  line:    number | null
}

/**
 * Read the verifiedTech array off an untyped `source_signals` blob, defensively
 * (the field is optional and only present on SBOM-grounded stack items).
 */
export function readVerifiedTech(signals: JsonValue): VerifiedTech[] {
  if (typeof signals !== 'object' || signals === null || Array.isArray(signals)) return []
  const raw = (signals as Record<string, JsonValue>)['verifiedTech']
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return []
    const e = entry as Record<string, JsonValue>
    if (typeof e['name'] !== 'string') return []
    return [{
      name:    e['name'],
      version: typeof e['version'] === 'string' ? e['version'] : null,
      purl:    typeof e['purl'] === 'string' ? e['purl'] : null,
      path:    typeof e['path'] === 'string' ? e['path'] : null,
      line:    typeof e['line'] === 'number' ? e['line'] : null,
    }]
  })
}

export type TestCoverageSignal    = 'none' | 'light' | 'moderate' | 'strong'
export type CiMaturity            = 'none' | 'basic' | 'deploys_to_prod' | 'multi_env'
export type DocumentationDensity  = 'none' | 'readme_only' | 'docs_dir' | 'comprehensive'

export interface ProjectDepthMarkers {
  has_tests:               boolean
  test_coverage_signal:    TestCoverageSignal
  has_ci:                  boolean
  ci_maturity:             CiMaturity
  documentation_density:   DocumentationDensity
  has_deployment_evidence: boolean
  deployment_url:          string | null
  refactor_count:          number
  computed_at:             string
}

export interface ProjectArchitecture {
  diagram_format: 'mermaid' | 'svg'
  diagram_source: string
  nodes:          JsonValue
  edges:          JsonValue
  is_user_edited: boolean
  generated_at:   string
}

export type ResumeAngle =
  | 'backend' | 'frontend' | 'infrastructure' | 'fullstack' | 'data_ml' | 'product_leadership'

export interface ProjectResumeBullets {
  angle:        ResumeAngle
  bullets:      string[]
  generated_at: string
}

export interface ProjectDetail extends ProjectSummary {
  pitch:                    string | null
  proposal_reasoning:       string | null
  proposal_confidence:      DecisionConfidence | null
  proposal_pipeline_run_id: string | null
  user_overrides:           Record<string, JsonValue>
  components:               ProjectComponent[]
  repositories:             ProjectRepositoryLink[]
  decisions:                ProjectDecision[]
  highlights:               ProjectHighlight[]
  challenges:               ProjectChallenge[]
  stack_items:              ProjectStackItem[]
  depth_markers:            ProjectDepthMarkers | null
  architecture:             ProjectArchitecture | null
  resume_bullets:           ProjectResumeBullets[]
  tags:                     string[]
}

export const STACK_CATEGORY_LABELS: Readonly<Record<StackCategory, string>> = {
  language:         'Languages',
  framework:        'Frameworks',
  database:         'Data',
  infrastructure:   'Infrastructure',
  observability:    'Observability',
  ci_cd:            'CI/CD',
  external_service: 'External services',
}

export const RESUME_ANGLE_LABELS: Readonly<Record<ResumeAngle, string>> = {
  backend:            'Backend',
  frontend:           'Frontend',
  infrastructure:     'Infrastructure',
  fullstack:          'Full-stack',
  data_ml:            'Data / ML',
  product_leadership: 'Product / leadership',
}
