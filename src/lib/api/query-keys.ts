/**
 * Admin Query Key Factory
 *
 * Structured query keys for TanStack Query cache management.
 * Follows the recommended factory pattern for hierarchical invalidation:
 * - Invalidating `adminKeys.articles.all` clears all article-related queries.
 * - Invalidating `adminKeys.all` clears the entire admin cache.
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
 */

/**
 * Centralised query key factory for the admin dashboard.
 *
 * Usage:
 * ```typescript
 * // In a useQuery hook
 * useQuery({ queryKey: adminKeys.articles.list('all'), queryFn: ... })
 *
 * // Cache invalidation after a mutation
 * queryClient.invalidateQueries({ queryKey: adminKeys.articles.all })
 * ```
 */
export const adminKeys = {
  /** Root key — invalidate this to clear the entire admin cache */
  all: ['admin'] as const,

  /** Admin settings (chatbot feature flag, etc.) */
  settings: {
    all: ['admin', 'settings'] as const,
    chatbot: () => ['admin', 'settings', 'chatbot'] as const,
  },

  /** Article-related query keys */
  articles: {
    /** All article queries (list + content) */
    all: ['admin', 'articles'] as const,
    /** Article listing by status filter */
    list: (status: string) => ['admin', 'articles', 'list', status] as const,
    /** Individual article content for the editor */
    content: (slug: string) => ['admin', 'articles', 'content', slug] as const,
    /** Individual article metadata from GET /articles/:slug */
    metadata: (slug: string) => ['admin', 'articles', 'metadata', slug] as const,
  },

  /** Comment-related query keys */
  comments: {
    /** All comment queries */
    all: ['admin', 'comments'] as const,
    /** Comment listing (pending moderation queue) */
    list: () => ['admin', 'comments', 'list'] as const,
  },

  /** Resume-related query keys */
  resumes: {
    /** All resume queries */
    all: ['admin', 'resumes'] as const,
    /** Resume listing */
    list: () => ['admin', 'resumes', 'list'] as const,
    /** Individual resume detail */
    detail: (id: string) => ['admin', 'resumes', id] as const,
  },

  /** Pipeline-related query keys (Bedrock multi-agent pipeline) */
  pipeline: {
    /** All pipeline queries */
    all: ['admin', 'pipeline'] as const,
    /** Individual pipeline status by slug */
    status: (slug: string) => ['admin', 'pipeline', 'status', slug] as const,
  },

  /** Job Applications query keys */
  applications: {
    /** All applications queries */
    all: ['admin', 'applications'] as const,
    /** Application listing by status filter */
    applications: (status: string) =>
      ['admin', 'applications', 'applications', status] as const,
    /** Individual application detail */
    detail: (slug: string) =>
      ['admin', 'applications', 'detail', slug] as const,
    /** All scheduled interviews (calendar) */
    scheduledInterviews: ['admin', 'applications', 'scheduled-interviews'] as const,
    /** Tailored resumes (+ cover letters) extracted from applications */
    tailoredResumes: ['admin', 'applications', 'tailored-resumes'] as const,
  },

  /** Admin user-management query keys */
  users: {
    /** All users queries */
    all: ['admin', 'users'] as const,
    /** User listing by tier filter */
    list: (tier: string) => ['admin', 'users', 'list', tier] as const,
    /** Individual user detail */
    detail: (id: string) => ['admin', 'users', 'detail', id] as const,
  },

  /** GitHub integration query keys */
  github: {
    /** All GitHub queries */
    all: ['admin', 'github'] as const,
    /** GitHub App installation status */
    installation: () => ['admin', 'github', 'installation'] as const,
    /** Repos accessible via the GitHub App */
    accessibleRepos: () => ['admin', 'github', 'accessible-repos'] as const,
    /** Repos connected (indexed) to the KB */
    connectedRepos: () => ['admin', 'github', 'connected-repos'] as const,
  },

  /** Live Stripe billing reads (payment method, invoices, customer details) */
  billing: {
    all: ['admin', 'billing'] as const,
    paymentMethod: () => ['admin', 'billing', 'payment-method'] as const,
    invoices: () => ['admin', 'billing', 'invoices'] as const,
    details: () => ['admin', 'billing', 'details'] as const,
  },

  /** Current-user profile + plan (from /api/admin/me) */
  me: {
    detail: () => ['admin', 'me'] as const,
  },

  /** Profile summary (mirror + reveal synthesis) */
  profile: {
    /** Aggregated profile summary (rollup, mirror, reveal) */
    summary: () => ['admin', 'profile', 'summary'] as const,
  },

  /** Knowledge-base health (document_embeddings composition + tech evidence) */
  kb: {
    health: () => ['admin', 'kb', 'health'] as const,
  },

  /** Resume import pipeline query keys */
  resumeImports: {
    /** All resume import queries */
    all: ['admin', 'resumeImports'] as const,
    /** Import status polling for a specific import */
    status: (importId: string) => ['admin', 'resumeImports', 'status', importId] as const,
    /** Server-driven progress polling for a specific import */
    progress: (importId: string) => ['admin', 'resumeImports', 'progress', importId] as const,
    /** Write-once gap-analysis report for a specific import */
    gapReport: (importId: string) => ['admin', 'resumeImports', 'gapReport', importId] as const,
    /** Career entries list (optional type filter) */
    entries: (type?: string) => ['admin', 'resumeImports', 'entries', type ?? 'all'] as const,
    /** Past imports list */
    list: () => ['admin', 'resumeImports', 'list'] as const,
  },
} as const
