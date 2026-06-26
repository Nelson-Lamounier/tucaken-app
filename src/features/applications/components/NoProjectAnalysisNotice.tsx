import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, FolderPlus, X } from 'lucide-react'
import { projectsQueries } from '@/features/projects/server/queries'
import { partitionProjects } from '@/features/projects/lib/classify'

/**
 * Advisory shown above the JD/resume-builder form when the user has not yet
 * generated (confirmed) a Project. The strategist resume is far stronger when
 * grounded in a real Project; without one, the analysis falls back mainly to the
 * resume imported during onboarding, so JD review and resume quality suffer.
 *
 * Non-blocking and dismissible — guidance, not a gate. Hidden while the projects
 * query is loading/errored and once the user has at least one curated project.
 */
export function NoProjectAnalysisNotice() {
  const [dismissed, setDismissed] = useState(false)
  const projectsQuery = useQuery(projectsQueries.list({ limit: 100, offset: 0, includeArchived: false }))

  if (dismissed) return null
  if (projectsQuery.isPending || projectsQuery.isError) return null

  const { curated } = partitionProjects(projectsQuery.data?.items ?? [])
  if (curated.length > 0) return null

  return (
    <div
      role="alert"
      className="mx-6 mt-5 flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-200">No project generated yet</p>
        <p className="mt-0.5 text-xs text-amber-200/80">
          Generate a project first so Tucaken can tailor your resume to your real work. Without one,
          JD review and resume quality are reduced — the analysis falls back mainly to the resume you
          added during onboarding.
        </p>
        <Link
          to="/projects"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-medium text-zinc-950 transition-colors hover:bg-amber-400"
        >
          <FolderPlus className="size-3.5" />
          Generate a project
        </Link>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md p-0.5 text-amber-300/70 transition hover:bg-amber-500/20 hover:text-amber-100"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
