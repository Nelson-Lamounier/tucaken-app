/**
 * Parse a pipeline_runs.metadata JSONB blob into the typed review verdicts the
 * admin preview surfaces. The article pipeline writes four independent verdicts
 * under metadata: `qa`, `grounding`, `prose`, `lint` (added across ai-applications
 * PRs — QA/grounding, #378 prose, #379 structural lint). The admin-api
 * `/articles/:slug/versions` endpoint returns the raw metadata per run; this
 * module turns it into a stable shape so a NOT_GROUNDED / lint-error draft is
 * visible at publish time instead of shipping blind.
 *
 * Every parser is defensive: metadata is untrusted JSONB, so each field is
 * type-guarded and a malformed verdict is dropped (returns undefined) rather
 * than throwing.
 */

// =============================================================================
// Types
// =============================================================================

export interface QaVerdict {
  readonly overallScore?: number
  readonly recommendation?: string
  readonly summary?: string
  readonly dimensionScores?: Record<string, number>
  readonly issues: ReadonlyArray<{ dimension?: string; severity?: string; description: string }>
}

export interface GroundingVerdict {
  readonly status: 'GROUNDED' | 'NOT_GROUNDED'
  readonly reason?: string
  readonly ungroundedClaims: readonly string[]
}

export interface ProseVerdict {
  readonly status: 'PASS' | 'FAIL'
  readonly total?: number
  readonly belowThreshold: boolean
  readonly issueCount: number
}

export interface LintFinding {
  readonly rule: string
  readonly severity: 'error' | 'warn'
  readonly message: string
}

export interface LintVerdict {
  readonly errors: number
  readonly warnings: number
  readonly findings: readonly LintFinding[]
}

export interface RunVerdicts {
  readonly qa?: QaVerdict
  readonly grounding?: GroundingVerdict
  readonly prose?: ProseVerdict
  readonly lint?: LintVerdict
}

/** One pipeline run, as returned by admin-api /articles/:slug/versions. */
export interface RunVersion {
  readonly pipelineRunId: string
  readonly status: string
  readonly createdAt: string
  readonly errorMessage: string | null
  readonly verdicts: RunVerdicts
}

// =============================================================================
// Guards
// =============================================================================

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// =============================================================================
// Per-verdict parsers
// =============================================================================

export function parseQa(v: unknown): QaVerdict | undefined {
  const o = asRecord(v)
  if (!o) return undefined

  const rawDims = asRecord(o['dimensionScores'])
  let dimensionScores: Record<string, number> | undefined
  if (rawDims) {
    const entries = Object.entries(rawDims)
      .map(([k, val]) => [k, asNumber(val)] as const)
      .filter((e): e is [string, number] => e[1] !== undefined)
    dimensionScores = entries.length > 0 ? Object.fromEntries(entries) : undefined
  }

  const rawIssues = Array.isArray(o['issues']) ? o['issues'] : []
  const issues = rawIssues
    .map((i) => {
      const io = asRecord(i)
      const description = asString(io?.['description'])
      if (!description) return undefined
      return { dimension: asString(io?.['dimension']), severity: asString(io?.['severity']), description }
    })
    .filter((i): i is NonNullable<typeof i> => i !== undefined)

  return {
    overallScore: asNumber(o['overallScore']),
    recommendation: asString(o['recommendation']),
    summary: asString(o['summary']),
    dimensionScores,
    issues,
  }
}

export function parseGrounding(v: unknown): GroundingVerdict | undefined {
  const o = asRecord(v)
  const status = asString(o?.['status'])
  if (status !== 'GROUNDED' && status !== 'NOT_GROUNDED') return undefined
  return {
    status,
    reason: asString(o?.['reason']),
    ungroundedClaims: asStringArray(o?.['ungroundedClaims']),
  }
}

export function parseProse(v: unknown): ProseVerdict | undefined {
  const o = asRecord(v)
  const status = asString(o?.['status'])
  if (status !== 'PASS' && status !== 'FAIL') return undefined
  const score = asRecord(o?.['score'])
  const issues = Array.isArray(o?.['issues']) ? (o?.['issues'] as unknown[]) : []
  return {
    status,
    total: asNumber(score?.['total']),
    belowThreshold: o?.['belowThreshold'] === true,
    issueCount: issues.length,
  }
}

export function parseLint(v: unknown): LintVerdict | undefined {
  const o = asRecord(v)
  if (!o) return undefined
  const rawFindings = Array.isArray(o['findings']) ? o['findings'] : []
  const findings = rawFindings
    .map((f) => {
      const fo = asRecord(f)
      const rule = asString(fo?.['rule'])
      const message = asString(fo?.['message'])
      const severity = asString(fo?.['severity'])
      if (!rule || !message || (severity !== 'error' && severity !== 'warn')) return undefined
      return { rule, message, severity }
    })
    .filter((f): f is LintFinding => f !== undefined)

  const errors = asNumber(o['errors']) ?? findings.filter((f) => f.severity === 'error').length
  const warnings = asNumber(o['warnings']) ?? findings.filter((f) => f.severity === 'warn').length
  return { errors, warnings, findings }
}

// =============================================================================
// Top-level
// =============================================================================

export function parseRunVerdicts(metadata: unknown): RunVerdicts {
  const o = asRecord(metadata)
  if (!o) return {}
  return {
    qa: parseQa(o['qa']),
    grounding: parseGrounding(o['grounding']),
    prose: parseProse(o['prose']),
    lint: parseLint(o['lint']),
  }
}

/** Map one raw admin-api version row into a typed RunVersion. */
export function parseRunVersion(raw: unknown): RunVersion {
  const o = asRecord(raw) ?? {}
  const createdAt = asString(o['createdAt'])
  return {
    pipelineRunId: asString(o['pipelineRunId']) ?? asString(o['id']) ?? '',
    status: asString(o['status']) ?? 'unknown',
    createdAt: createdAt ?? new Date(0).toISOString(),
    errorMessage: asString(o['errorMessage']) ?? null,
    verdicts: parseRunVerdicts(o['metadata']),
  }
}
