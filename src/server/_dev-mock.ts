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

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Returns a fixture for the given admin-api path, or `null` for anything
 * unmapped (caller treats null as "no mock, fall through" — but in MOCK_AUTH
 * mode _api-client never falls through; unmapped paths get `{}`).
 */
export function mockApiResponse(path: string): unknown {
  const p = normalise(path)

  if (p === '/me') return mockMe

  if (p === '/resume-imports/upload-url') {
    return {
      importId: MOCK_IMPORT_ID,
      uploadUrl: MOCK_UPLOAD_URL,
      s3Key: `mock/${MOCK_IMPORT_ID}.pdf`,
      expiresIn: 900,
    }
  }
  if (p === '/resume-imports/:id/complete' || p === '/resume-imports/:id/retry') {
    return { importId: MOCK_IMPORT_ID, status: 'queued' }
  }
  if (p === '/resume-imports/:id/progress') {
    // Jump straight to terminal review so the review/gap UI renders fast.
    return {
      progress: {
        v: 1,
        status: 'ready_for_review',
        phase: 'review',
        step: 5,
        totalSteps: 5,
        terminal: true,
        error: null,
        gapReportReady: true,
        heartbeatAt: new Date().toISOString(),
        retryAfterMs: 2000,
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
  if (p.includes('github')) return null

  // Unknown admin path — empty object keeps other carousel steps from crashing.
  return {}
}
