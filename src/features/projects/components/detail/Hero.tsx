import { Boxes, FolderGit, FolderGit2 } from 'lucide-react'
import {
  PROJECT_ROLE_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type ProjectDetail,
  type ProjectShape,
  type ProjectStatus,
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

export interface HeroProps {
  readonly project: ProjectDetail
}

export function Hero({ project }: HeroProps) {
  const ShapeIcon = SHAPE_ICON[project.shape] ?? FolderGit
  const statusStyle = STATUS_STYLES[project.status] ?? STATUS_STYLES.archived

  return (
    <section className="overflow-hidden rounded-2xl bg-white/2 inset-ring inset-ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-6 px-6 py-6">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-300 inset-ring inset-ring-teal-400/30">
            <ShapeIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-zinc-100">{project.name}</h1>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle}`}>
                {PROJECT_STATUS_LABELS[project.status] ?? project.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              {project.tagline ?? PROJECT_TYPE_LABELS[project.type] ?? '—'}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-zinc-500 sm:grid-cols-4">
              <Meta label="Type"   value={PROJECT_TYPE_LABELS[project.type] ?? project.type} />
              <Meta label="Role"   value={PROJECT_ROLE_LABELS[project.role_exhibited] ?? project.role_exhibited} />
              <Meta label="Repos"  value={`${project.repository_count}`} />
              <Meta label="Active" value={formatRelativeTime(project.last_activity_at)} />
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}

function Meta({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">{label}</dt>
      <dd className="mt-0.5 truncate text-zinc-300">{value}</dd>
    </div>
  )
}
