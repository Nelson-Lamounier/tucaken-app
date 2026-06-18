import { Link } from '@tanstack/react-router'
import { Boxes, ChevronRight, FolderGit, FolderGit2, GitBranch, RefreshCw } from 'lucide-react'
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type ProjectShape,
  type ProjectStatus,
  type ProjectSummary,
} from '../../lib/types'
import { formatRelativeTime } from '../../lib/format'
import { useUpdateProjectFromSync } from '../../server/mutations'

const SHAPE_ICON: Readonly<Record<ProjectShape, React.ComponentType<{ className?: string }>>> = {
  single_repo:     FolderGit,
  multi_repo:      FolderGit2,
  monorepo_subset: Boxes,
}

const STATUS_STYLES: Readonly<Record<ProjectStatus, string>> = {
  active:   'bg-teal-400/10 text-teal-300 inset-ring inset-ring-teal-400/30',
  stable:   'bg-emerald-400/10 text-emerald-300 inset-ring inset-ring-emerald-400/30',
  dormant:  'bg-amber-400/10 text-amber-300 inset-ring inset-ring-amber-400/30',
  archived: 'bg-white/5 text-zinc-400 inset-ring inset-ring-white/10',
}

export interface ProjectCardProps {
  readonly project: ProjectSummary
}

export function ProjectCard({ project }: ProjectCardProps) {
  const ShapeIcon = SHAPE_ICON[project.shape] ?? FolderGit
  const statusStyle = STATUS_STYLES[project.status] ?? STATUS_STYLES.archived

  // "Update from latest sync" re-runs the case study as an incremental refine,
  // for when a repo already in this project was resynced with more data. Only
  // meaningful for confirmed, non-archived projects (mirrors the detail Hero).
  const update = useUpdateProjectFromSync()
  const canUpdate = project.is_user_confirmed && project.status !== 'archived'

  return (
    <li className="group relative col-span-1 flex h-full overflow-hidden rounded-md bg-white/2 inset-ring inset-ring-white/10 transition-colors hover:bg-white/5">
      {/* The whole card navigates; the Update button below sits above it (z-10)
          as a sibling, so clicking it does not trigger navigation. */}
      <Link
        to="/projects/$id"
        params={{ id: project.id }}
        className="flex min-w-0 flex-1"
        aria-label={`Open ${project.name}`}
      >
        <div className="flex w-14 shrink-0 items-center justify-center bg-teal-500/10 text-teal-300">
          <ShapeIcon className="size-5" />
        </div>
        <div className="flex flex-1 flex-col justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate pr-20 text-sm font-semibold text-zinc-100 group-hover:text-white">
              {project.name}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">
              {project.tagline ?? PROJECT_TYPE_LABELS[project.type] ?? '—'}
            </p>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle}`}
                title={`Status: ${PROJECT_STATUS_LABELS[project.status] ?? project.status}`}
              >
                {PROJECT_STATUS_LABELS[project.status] ?? project.status}
              </span>
              <span className="flex items-center gap-1.5">
                <GitBranch className="size-3" />
                {project.repository_count} repo{project.repository_count === 1 ? '' : 's'}
              </span>
            </span>
            <span className="flex items-center gap-1">
              {formatRelativeTime(project.last_activity_at)}
              <ChevronRight className="size-3.5 text-zinc-600 transition-colors group-hover:text-zinc-400" />
            </span>
          </div>
        </div>
      </Link>

      {canUpdate && (
        <button
          type="button"
          onClick={() => update.mutate({ projectId: project.id, projectName: project.name })}
          disabled={update.isPending}
          title="Update this project from the latest synced repository data"
          aria-label={`Update ${project.name} from the latest synced data`}
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-200 inset-ring inset-ring-white/10 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`size-3 ${update.isPending ? 'animate-spin' : ''}`} />
          {update.isPending ? 'Queuing…' : 'Update'}
        </button>
      )}
    </li>
  )
}
