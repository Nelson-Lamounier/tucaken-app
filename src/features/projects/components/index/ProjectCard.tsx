import { Boxes, ChevronRight, FolderGit, FolderGit2, GitBranch } from 'lucide-react'
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type ProjectShape,
  type ProjectStatus,
  type ProjectSummary,
} from '../../lib/types'
import { formatRelativeTime } from '../../lib/format'

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

  return (
    <li className="col-span-1">
      {/* TODO(5b): wrap in Link to /_dashboard/projects/$id once detail route exists. */}
      <div
        className="group flex h-full overflow-hidden rounded-2xl bg-white/2 inset-ring inset-ring-white/10 transition-colors hover:bg-white/5"
      >
        <div className="flex w-14 shrink-0 items-center justify-center bg-teal-500/10 text-teal-300">
          <ShapeIcon className="size-5" />
        </div>
        <div className="flex flex-1 flex-col justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-zinc-100 group-hover:text-white">
                {project.name}
              </h3>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle}`}
                title={`Status: ${PROJECT_STATUS_LABELS[project.status] ?? project.status}`}
              >
                {PROJECT_STATUS_LABELS[project.status] ?? project.status}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">
              {project.tagline ?? PROJECT_TYPE_LABELS[project.type] ?? '—'}
            </p>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <GitBranch className="size-3" />
              {project.repository_count} repo{project.repository_count === 1 ? '' : 's'}
            </span>
            <span className="flex items-center gap-1">
              {formatRelativeTime(project.last_activity_at)}
              <ChevronRight className="size-3.5 text-zinc-600 transition-colors group-hover:text-zinc-400" />
            </span>
          </div>
        </div>
      </div>
    </li>
  )
}
