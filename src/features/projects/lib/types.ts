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
  last_activity_at: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
  repository_count: number
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
