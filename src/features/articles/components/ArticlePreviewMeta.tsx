import type { ArticleMetadata, ArticleVersion } from '@/hooks/use-admin-articles'

interface VersionData {
  slug: string
  totalVersions: number
  versions: ArticleVersion[]
}

interface ArticlePreviewMetaProps {
  readonly metadata: ArticleMetadata | null | undefined
  readonly versionData: VersionData | null | undefined
  readonly metaIsLoading: boolean
  readonly versionsIsLoading: boolean
}

const STATUS_CLASS: Record<string, string> = {
  draft:      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  published:  'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  flagged:    'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  review:     'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  rejected:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  processing: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
}

const QA_CLASS: Record<string, string> = {
  approve: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  revise:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  reject:  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
}

export function ArticlePreviewMeta({
  metadata,
  versionData,
  metaIsLoading,
  versionsIsLoading,
}: ArticlePreviewMetaProps) {
  const sortedVersions = versionData?.versions
    ? [...versionData.versions].sort((a, b) => b.version - a.version)
    : null
  const latestVersion = sortedVersions?.[0] ?? null

  function renderVersions() {
    if (versionsIsLoading) {
      return (
        <div className="space-y-2 animate-pulse">
          <div className="h-8 rounded bg-zinc-800" />
          <div className="h-8 rounded bg-zinc-800" />
        </div>
      )
    }
    if (!versionData?.versions?.length) {
      return <p className="text-xs text-zinc-500 italic">No pipeline runs yet.</p>
    }
    return (
      <div className="space-y-2">
        {(sortedVersions ?? [])
          .map((v) => (
            <div
              key={v.sk}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
            >
              <span className="shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 font-mono text-xs font-semibold text-zinc-300">
                v{v.version}
              </span>
              <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[v.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                {v.status}
              </span>
              {v.qaRecommendation && (
                <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${QA_CLASS[v.qaRecommendation] ?? ''}`}>
                  QA: {v.qaRecommendation}
                  {v.qaTotalScore !== undefined && ` (${v.qaTotalScore})`}
                </span>
              )}
              <time className="ml-auto text-xs text-zinc-500" dateTime={v.createdAt}>
                {new Date(v.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short',
                })}
              </time>
            </div>
          ))}
      </div>
    )
  }

  function renderMetadata() {
    if (metaIsLoading) {
      return (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 w-3/4 rounded bg-zinc-800" />
          <div className="h-3 w-1/2 rounded bg-zinc-800" />
          <div className="h-3 w-2/3 rounded bg-zinc-800" />
        </div>
      )
    }
    if (metadata === null) {
      return <p className="text-xs text-zinc-500 italic">Metadata unavailable</p>
    }
    if (!metadata) return null
    return (
      <dl className="space-y-2.5 text-xs">
        <div>
          <dt className="text-zinc-500">Status</dt>
          <dd className="mt-0.5">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[metadata.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
              {metadata.status}
            </span>
          </dd>
        </div>
        {metadata.excerpt && (
          <div>
            <dt className="text-zinc-500">Excerpt</dt>
            <dd className="mt-0.5 text-zinc-300 leading-relaxed line-clamp-4">{metadata.excerpt}</dd>
          </div>
        )}
        {metadata.tags.length > 0 && (
          <div>
            <dt className="text-zinc-500">Tags</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {metadata.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-300">
                  {tag}
                </span>
              ))}
            </dd>
          </div>
        )}
        {metadata.aiModel && (
          <div>
            <dt className="text-zinc-500">AI Model</dt>
            <dd className="mt-0.5 font-mono text-zinc-300">{metadata.aiModel}</dd>
          </div>
        )}
        {metadata.publishedAt && (
          <div>
            <dt className="text-zinc-500">Published</dt>
            <dd className="mt-0.5 text-zinc-300">
              {new Date(metadata.publishedAt).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </dd>
          </div>
        )}
        {metadata.updatedAt && (
          <div>
            <dt className="text-zinc-500">Updated</dt>
            <dd className="mt-0.5 text-zinc-300">
              {new Date(metadata.updatedAt).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </dd>
          </div>
        )}
      </dl>
    )
  }

  return (
    <aside className="w-80 shrink-0 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto">
      <div className="divide-y divide-zinc-800">

        {/* ── Article Info ─────────────────────────────────────────────────── */}
        <div className="px-4 py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Article Info
          </p>
          {renderMetadata()}
        </div>

        {/* ── Latest QA ────────────────────────────────────────────────────── */}
        {latestVersion?.qaRecommendation && (
          <div className="px-4 py-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Latest QA — v{latestVersion.version}
            </p>
            <div className="space-y-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${QA_CLASS[latestVersion.qaRecommendation] ?? ''}`}>
                {latestVersion.qaRecommendation}
                {latestVersion.qaTotalScore !== undefined && ` · ${latestVersion.qaTotalScore}/100`}
              </span>
              {latestVersion.qaIssues && latestVersion.qaIssues.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {[...new Set(latestVersion.qaIssues)].map((issue) => (
                    <li key={issue} className="text-xs text-zinc-400 flex gap-1.5">
                      <span className="mt-0.5 shrink-0 text-amber-500">·</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ── Pipeline Versions ────────────────────────────────────────────── */}
        <div className="px-4 py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Pipeline History
            {versionData && (
              <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">
                {versionData.totalVersions}
              </span>
            )}
          </p>
          {renderVersions()}
        </div>

      </div>
    </aside>
  )
}
