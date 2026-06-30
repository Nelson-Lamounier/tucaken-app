/**
 * @format
 * Dev-only auth + admin-api mock.
 *
 * Enabled with `MOCK_AUTH=true yarn dev`. Lets a developer reach the
 * /onboarding workflow (and ImportCareerStep's data queries) with a fake
 * authenticated user — no AWS Cognito, no admin-api, no RDS.
 *
 * Three seams consult this module:
 *   - session.ts        → fake user for router auth context
 *   - auth-guard.ts      → fake user for requireAuth()
 *   - _api-client.ts     → fixture responses instead of real admin-api fetch
 *
 * Production builds never set MOCK_AUTH, so this is inert in prod.
 */

import type { AuthUser } from './session'

export const MOCK_AUTH = process.env['MOCK_AUTH'] === 'true'

export const MOCK_USER: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'dev@tucaken.local',
}

const MOCK_IMPORT_ID = '11111111-1111-4111-8111-111111111111'

// Browser PUTs the file bytes straight to this presigned URL. The Vite dev
// middleware in vite.config.ts answers `/__mock-s3` with 204 so the upload
// step resolves without S3.
const MOCK_UPLOAD_URL = '/__mock-s3'

// Replace UUID path segments with :id so route matching is stable.
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

function normalise(path: string): string {
  const noQuery = path.split('?')[0]
  return noQuery.replace(UUID_RE, ':id')
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockEntries = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    entryType: 'experience',
    rawData: {
      title: 'Senior Software Engineer',
      company: 'Acme Corp',
      period: '2021 — Present',
      highlights: [
        'Led migration of the billing platform to event-driven architecture',
        'Reduced p99 API latency 40% via query + cache redesign',
        'Mentored 4 engineers; owned the on-call rotation',
      ],
    },
    enrichedData: { summary: 'AI-enriched summary placeholder.' },
    enrichmentStatus: 'complete',
    displayOrder: 0,
    createdAt: '2026-01-10T09:00:00.000Z',
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    entryType: 'experience',
    rawData: {
      title: 'Software Engineer',
      company: 'Globex',
      period: '2018 — 2021',
      highlights: ['Built the internal design-system component library'],
    },
    enrichedData: null,
    enrichmentStatus: 'pending',
    displayOrder: 1,
    createdAt: '2026-01-10T09:00:00.000Z',
  },
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    entryType: 'education',
    rawData: {
      degree: 'BSc Computer Science',
      institution: 'University of Example',
      period: '2014 — 2018',
    },
    enrichedData: null,
    enrichmentStatus: 'complete',
    displayOrder: 2,
    createdAt: '2026-01-10T09:00:00.000Z',
  },
  {
    id: 'cccccccc-0000-4000-8000-000000000001',
    entryType: 'skill',
    rawData: {
      skills: [
        'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS',
        'Kubernetes', 'Terraform', 'GraphQL', 'Vitest', 'Tailwind',
      ],
    },
    enrichedData: null,
    enrichmentStatus: 'complete',
    displayOrder: 3,
    createdAt: '2026-01-10T09:00:00.000Z',
  },
]

const mockGapReport = {
  overallScore: 72,
  perRole: [
    {
      roleId: 'aaaaaaaa-0000-4000-8000-000000000001',
      company: 'Acme Corp',
      title: 'Senior Software Engineer',
      period: '2021 — Present',
      completenessScore: 78,
      coveredResponsibilities: ['System design', 'Mentorship', 'Performance'],
      missingResponsibilities: ['Cross-team roadmap ownership'],
      suggestedAdditions: [
        {
          bullet: 'Drove the quarterly platform roadmap across 3 teams',
          rationale: 'Demonstrates scope beyond individual delivery',
        },
      ],
      quantificationOpportunities: ['Quantify cost savings from the cache redesign'],
      keywordsForATS: ['distributed systems', 'observability', 'SLO'],
      externalValidation: 'limited',
    },
  ],
  skillsGap: {
    present: ['TypeScript', 'React', 'AWS'],
    missing: ['Rust'],
    emerging: ['LLM tooling'],
  },
  narrativeFeedback:
    'Strong delivery signal. Add explicit business impact and leadership scope to lift the senior narrative.',
  freeTierLimit: { rolesSkipped: 0, upgradeCta: null },
}

const mockMe = {
  id: MOCK_USER.id,
  email: MOCK_USER.email,
  name: 'Dev User',
  avatarUrl: undefined,
  isNew: false,
  abFreeTier: false,
  plan: {
    plan: 'free',
    effectivePlan: 'free' as const,
    role: 'admin',
    trialStartedAt: null,
    trialEndsAt: null,
    trialDaysRemaining: null,
    subscriptionStatus: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  },
}

// Stateful progress walk so the dev UI renders the processing screen
// (Job queued → Parsing → Extracting → Analyzing) before review, instead
// of jumping straight to the review/gap UI. Each /progress poll advances
// one step; the walk resets when the job is (re)queued via /complete or
// /retry. retryAfterMs sets the poll cadence the UI honours.
// Dev knob: how long the processing screen stays up before going terminal.
// Time-based (not poll-count) so it's an exact wall-clock target and the
// timer restarts per job. Drop to ~6_000 once the UI work is done.
const PROCESSING_MS = 6_000 // shippable default; bump locally to troubleshoot

// Phase boundaries as fractions of PROCESSING_MS — drives the label/bar.
const PROGRESS_PHASES = [
  { until: 0.1, status: 'processing', phase: 'uploading',  step: 1 },
  { until: 0.4, status: 'processing', phase: 'parsing',    step: 2 },
  { until: 0.7, status: 'processing', phase: 'extracting', step: 3 },
  { until: 1.0, status: 'processing', phase: 'analyzing',  step: 4 },
] as const

// Wall-clock start of the current mock job. Reset whenever a job is
// (re)queued or a brand-new upload begins (covers page reload → re-upload).
let progressStartedAt = 0

// ─── GitHub (stateful) ───────────────────────────────────────────────────────
// The onboarding connect/repos/processing steps must run offline. github
// stays "not installed" until the App-install POST /github/installation
// fires (simulated by onboarding's onConnectGithub under VITE_MOCK_AUTH),
// then a fixture installation + accessible/connected repos appear. Persists
// for the dev-server process lifetime; restart the server to test the
// not-connected state again.
let githubInstalled = false

const mockInstallation = {
  installationId:   '90000001',
  accountLogin:     'dev-user',
  accountAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
  repositoryCount:  3,
  connectedAt:      '2026-01-10T09:00:00.000Z',
}

const mockAccessibleRepos = [
  { id: 1, fullName: 'dev-user/portfolio-api', owner: 'dev-user', name: 'portfolio-api', defaultBranch: 'main', private: false, updatedAt: '2026-05-01T12:00:00.000Z' },
  { id: 2, fullName: 'dev-user/tucaken-app',   owner: 'dev-user', name: 'tucaken-app',   defaultBranch: 'main', private: true,  updatedAt: '2026-05-15T12:00:00.000Z' },
  { id: 3, fullName: 'dev-user/infra',         owner: 'dev-user', name: 'infra',         defaultBranch: 'main', private: true,  updatedAt: '2026-04-20T12:00:00.000Z' },
]

// Connected repos are stateful so onboarding runs offline: "Add" queues a
// repo with deferSync (status 'pending', syncStartedAt null); the bulk
// /connected-repos/sync stamps syncStartedAt so each repo goes
// pending → syncing → complete (after SYNC_MS), driving the poll and
// letting ProcessingStep advance once every repo is terminal.
const SYNC_MS = 6_000
type MockConnected = {
  repoFullName: string
  owner:        string
  name:         string
  defaultBranch: string
  addedAt:       number        // epoch ms recorded at POST time; never drifts
  syncStartedAt: number | null // null = queued (pending); ms = sync started
}
let mockConnectedRepos: MockConnected[] = []

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'string') return {}
  try { return JSON.parse(body) as Record<string, unknown> } catch { return {} }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Returns a fixture for the given admin-api path, or `null` for anything
 * unmapped (caller treats null as "no mock, fall through" — but in MOCK_AUTH
 * mode _api-client never falls through; unmapped paths get `{}`).
 */
export function mockApiResponse(path: string, method = 'GET', body?: unknown): unknown {
  const p = normalise(path)

  if (p === '/me') return mockMe

  if (p === '/resume-imports/upload-url') {
    // First signal of a fresh attempt (covers page reload → re-upload):
    // restart the wall-clock so the 2-min timer resets, not resumes.
    progressStartedAt = Date.now()
    return {
      importId: MOCK_IMPORT_ID,
      uploadUrl: MOCK_UPLOAD_URL,
      s3Key: `mock/${MOCK_IMPORT_ID}.pdf`,
      expiresIn: 900,
    }
  }
  if (p === '/resume-imports/:id/complete' || p === '/resume-imports/:id/retry') {
    progressStartedAt = Date.now() // restart the timer for this (re)queued job
    return { importId: MOCK_IMPORT_ID, status: 'queued' }
  }
  if (p === '/resume-imports/:id/progress') {
    if (progressStartedAt === 0) progressStartedAt = Date.now()
    const elapsed  = Date.now() - progressStartedAt
    const fraction = elapsed / PROCESSING_MS
    const terminal = fraction >= 1
    const snap =
      PROGRESS_PHASES.find((ph) => fraction < ph.until) ??
      PROGRESS_PHASES[PROGRESS_PHASES.length - 1]!
    return {
      progress: {
        v: 1,
        status: terminal ? 'ready_for_review' : snap.status,
        phase: terminal ? 'review' : snap.phase,
        step: terminal ? 5 : snap.step,
        totalSteps: 5,
        terminal,
        error: null,
        gapReportReady: terminal,
        heartbeatAt: new Date().toISOString(),
        retryAfterMs: 3000,
      },
    }
  }
  if (p === '/resume-imports/:id/gap-report') {
    return { gapReport: mockGapReport }
  }
  if (p === '/resume-imports/career-entries') {
    return { entries: mockEntries }
  }
  if (p === '/resume-imports/:id') {
    return {
      import: {
        id: MOCK_IMPORT_ID,
        status: 'ready_for_review',
        statusMessage: null,
        currentStep: 'review',
        totalSteps: 5,
        careerEntriesCreated: mockEntries.map((e) => e.id),
        embeddingsCreatedCount: 0,
        errorCode: null,
        originalFilename: 'mock-resume.pdf',
        createdAt: '2026-01-10T09:00:00.000Z',
      },
    }
  }
  if (p === '/resume-imports') return { imports: [] }

  // GitHub installation check (Connect step) — no installation in mock.
  // ── GitHub (stateful) ──────────────────────────────────────────────────
  if (p === '/github/installation') {
    if (method === 'POST') {
      githubInstalled = true // App-install callback
      return { success: true }
    }
    return { installation: githubInstalled ? mockInstallation : null }
  }
  if (p === '/github/repos') {
    return { repos: githubInstalled ? mockAccessibleRepos : [] }
  }
  if (p === '/github/connected-repos/sync' && method === 'POST') {
    let started = 0
    const now = Date.now()
    for (const r of mockConnectedRepos) {
      if (r.syncStartedAt === null) { r.syncStartedAt = now; started++ }
    }
    return { started }
  }
  if (p === '/github/connected-repos') {
    if (method === 'POST') {
      const parsed = parseBody(body)
      const repoFullName = String(parsed['repoFullName'] ?? '')
      const defaultBranch = String(parsed['defaultBranch'] ?? 'main')
      const deferSync = parsed['deferSync'] === true
      const alreadyConnected = mockConnectedRepos.some((r) => r.repoFullName === repoFullName)
      // Simulate the admin-api free-plan repo cap so the upgrade UI is reachable
      // in dev: the Free plan allows 1 repository, and adding another returns the
      // same [403] the real backend does. Set mockMe.plan.effectivePlan to 'pro'
      // to lift the cap when testing other repo flows locally.
      const repoLimit = mockMe.plan.effectivePlan === 'free' ? 1 : Number.POSITIVE_INFINITY
      if (!alreadyConnected && mockConnectedRepos.length >= repoLimit) {
        throw new Error('admin-api POST /github/connected-repos failed [403] — Your plan allows 1 repository. Upgrade for more.')
      }
      if (repoFullName && !alreadyConnected) {
        const [owner, ...rest] = repoFullName.split('/')
        mockConnectedRepos.push({
          repoFullName,
          owner: owner ?? '',
          name: rest.join('/') || repoFullName,
          defaultBranch,
          addedAt: Date.now(),
          // deferSync (onboarding queue) → pending; otherwise (Settings
          // immediate add) → sync starts now.
          syncStartedAt: deferSync ? null : Date.now(),
        })
      }
      return { status: deferSync ? 'queued' : 'syncing', repoFullName, jobName: deferSync ? null : 'mock-ingest-job' }
    }
    if (!githubInstalled) return { repos: [] }
    const now = Date.now()
    return {
      repos: mockConnectedRepos.map((r) => {
        const started = r.syncStartedAt
        let syncStatus: 'pending' | 'syncing' | 'complete'
        if (started === null) syncStatus = 'pending'
        else if (now - started < SYNC_MS) syncStatus = 'syncing'
        else syncStatus = 'complete'
        const complete = syncStatus === 'complete'
        return {
          repoFullName:  r.repoFullName,
          owner:         r.owner,
          name:          r.name,
          defaultBranch: r.defaultBranch,
          syncStatus,
          lastSyncedAt:  complete && started !== null ? new Date(started + SYNC_MS).toISOString() : null,
          addedAt:       new Date(r.addedAt).toISOString(),
          qualityScore:  complete ? 85 : null,
          classification: complete ? 'project' : null,
        }
      }),
    }
  }
  // DELETE /github/connected-repos/<url-encoded repoFullName> — remove it.
  if (p.startsWith('/github/connected-repos/')) {
    const target = decodeURIComponent(p.slice('/github/connected-repos/'.length))
    mockConnectedRepos = mockConnectedRepos.filter((r) => r.repoFullName !== target)
    return { success: true }
  }
  // Any other github path (e.g. timed-out marker) — inert.
  if (p.includes('github')) return null

  if (p === '/profile/summary') {
    return {
      rollup: {
        languages: [
          { language: 'TypeScript', repoCount: 4, commitVolumeProxy: 120, sharePct: 64 },
          { language: 'Python', repoCount: 2, commitVolumeProxy: 40, sharePct: 21 },
        ],
        domains: { counts: { infra: 3, web: 2 }, dominant: 'infra' },
        complexity: { simple: 1, moderate: 3, complex: 1 },
        roles: { creator: 3, maintainer: 1, contributor: 1 },
        techStackTop: [{ tech: 'AWS', repoCount: 3 }, { tech: 'React', repoCount: 2 }],
        activityArc: [
          { repoFullName: 'me/infra', lastActiveAt: '2024-03-01T00:00:00Z', primaryLanguage: 'TypeScript', domain: 'infra' },
          { repoFullName: 'me/app', lastActiveAt: '2026-01-15T00:00:00Z', primaryLanguage: 'TypeScript', domain: 'web' },
        ],
        totals: { projectRepoCount: 5, totalCommitVolumeProxy: 160, earliestActivity: '2024-03-01T00:00:00Z', latestActivity: '2026-01-15T00:00:00Z', activeYearsApprox: 2 },
        classificationCounts: { project: 5, hiddenCount: 0 },
        methodology: { version: 1, commitVolume: 'proxy', domainMix: 'repo-count share', scope: 'project,!hidden,completed', confidence: 'derived from per-repo signals' },
      },
      mirror: { paragraph: 'You are an infrastructure-focused engineer who operates primarily as a creator across AWS and TypeScript projects, with roughly two years of sustained activity skewing toward infra and platform work.' },
      reveal: { reveals: [
        { insight: 'You operate as a builder-creator, not a generalist contributor.', evidence: 'role distribution (creator-heavy)' },
        { insight: 'Your work concentrates in infrastructure rather than spread thin.', evidence: 'domain mix (infra dominant)' },
      ] },
      direction: {
        archetypes: [
          { archetype: 'platform', fit: 'strong', rationale: 'infra-dominant domain mix + AWS tech stack' },
          { archetype: 'devops', fit: 'strong', rationale: 'IaC/CI tech stack + role distribution' },
          { archetype: 'backend', fit: 'moderate', rationale: 'TypeScript language share, fewer product repos' },
          { archetype: 'ml', fit: 'weak', rationale: 'no ML domain in domain mix' },
        ],
        seniority: [
          { area: 'infrastructure', level: 'senior', evidence: 'complexity distribution skews complex + ~2 active years' },
          { area: 'application', level: 'mid-senior', evidence: 'role distribution mostly creator on infra repos' },
        ],
        whatToDeepen: ['Surface incident-response evidence in repo docs.', 'Add public technical writing links.'],
      },
      reconciliation: {
        unsupportedClaims: [
          { claim: 'Led a 12-person ML platform team', resumeRef: 'Acme — Staff Engineer', whyUnsupported: 'No ML domain in the GitHub domain mix; role distribution is creator-heavy solo work' },
          { claim: 'Expert in Kubernetes at scale', resumeRef: 'Cloud skills', whyUnsupported: 'No Kubernetes/infra signal beyond a single infra repo in the activity arc' },
          { claim: 'Drove $2M cost savings', resumeRef: 'Acme — Staff Engineer', whyUnsupported: 'Business outcomes are not derivable from repository evidence' },
        ],
        undersold: [
          { evidence: 'Strong, sustained TypeScript output across infra repos', rollupDimension: 'language share', suggestion: 'Add a TypeScript infrastructure bullet — it is your dominant evidenced strength' },
          { evidence: 'Creator role on the majority of project repos', rollupDimension: 'role distribution', suggestion: 'Surface ownership/initiative explicitly in the résumé summary' },
        ],
      },
      diagnostic: {
        overall: 78,
        components: {
          profileDepth:            { score: 86, blockers: [] },
          ragDepth:                { score: 70, blockers: ['No project repos with high KB quality'] },
          directionConfidence:     { score: 80, blockers: [] },
          reconciliationAlignment: { score: 80, blockers: ['Led a 12-person ML platform team'] },
          resumeCoverage:          { score: 75, blockers: [] },
        },
        methodology: {
          version: 1,
          weights: { profileDepth: 20, ragDepth: 20, directionConfidence: 20, reconciliationAlignment: 20, resumeCoverage: 20 },
          notes:   'Equal-weight v1: each component contributes up to 20.',
        },
        explanation: 'Your readiness score reflects strong infrastructure evidence offset by one unsupported résumé claim and an underdeveloped retrieval area.',
      },
      refreshedAt: '2026-01-15T00:05:00Z',
      synthesisRefreshedAt: '2026-01-15T00:06:00Z',
    }
  }

  // Unknown admin path — empty object keeps other carousel steps from crashing.
  return {}
}
