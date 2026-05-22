/**
 * Public case-study shape returned by ai-applications public-api
 * (GET /public/projects/:username/:slug). Distinct from the authenticated
 * ProjectDetail: camelCase keys, no ids on nested rows, no edit/visibility
 * metadata. Mirror the public-api payload exactly.
 */
import type {
  CiMaturity,
  DecisionConfidence,
  DocumentationDensity,
  JsonValue,
  ProjectRole,
  ProjectShape,
  ProjectStatus,
  ProjectType,
  ResumeAngle,
  StackCategory,
  TestCoverageSignal,
} from './types'

export interface PublicComponent {
  id:          string
  name:        string
  kind:        string
  order_index: number
}

export interface PublicRepository {
  component_id:         string
  repository_full_name: string
  subpath:              string | null
}

export interface PublicDecision {
  title:          string
  context:        string | null
  decision:       string | null
  consequences:   string | null
  confidence:     DecisionConfidence
  source_signals: JsonValue
  order_index:    number
}

export interface PublicHighlight {
  title:       string
  description: string | null
  order_index: number
}

export interface PublicChallenge {
  problem:        string
  solution:       string | null
  source_signals: JsonValue
  order_index:    number
}

export interface PublicStackItem {
  category:      StackCategory
  name:          string
  justification: string | null
  order_index:   number
}

export interface PublicDepthMarkers {
  has_tests:               boolean
  test_coverage_signal:    TestCoverageSignal
  has_ci:                  boolean
  ci_maturity:             CiMaturity
  documentation_density:   DocumentationDensity
  has_deployment_evidence: boolean
  deployment_url:          string | null
  refactor_count:          number
}

export interface PublicArchitecture {
  diagram_format: 'mermaid' | 'svg'
  diagram_source: string
  nodes:          JsonValue
  edges:          JsonValue
}

export interface PublicResumeBullets {
  angle:   ResumeAngle
  bullets: string[]
}

export interface PublicCaseStudy {
  username:       string
  slug:           string
  name:           string
  tagline:        string | null
  pitch:          string | null
  type:           ProjectType
  shape:          ProjectShape
  status:         ProjectStatus
  roleExhibited:  ProjectRole
  startedAt:      string | null
  endedAt:        string | null
  lastActivityAt: string | null
  updatedAt:      string
  components:     PublicComponent[]
  repositories:   PublicRepository[]
  decisions:      PublicDecision[]
  highlights:     PublicHighlight[]
  challenges:     PublicChallenge[]
  stack:          PublicStackItem[]
  depthMarkers:   PublicDepthMarkers | null
  architecture:   PublicArchitecture | null
  resumeBullets:  PublicResumeBullets[]
  tags:           string[]
}
