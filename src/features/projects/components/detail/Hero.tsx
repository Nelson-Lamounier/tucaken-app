import { Link } from '@tanstack/react-router'
import { Boxes, FolderGit, FolderGit2, RefreshCw, SlidersHorizontal } from 'lucide-react'
import {
  PROJECT_ROLE_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type ProjectDetail,
  type ProjectShape,
  type ProjectStatus,
} from '../../lib/types'
import { formatRelativeTime } from '../../lib/format'
import { usePatchProject, useRegenerateProject } from '../../server/mutations'
import { InlineText } from './InlineText'
import { InlineSelect } from './InlineSelect'

const SHAPE_ICON: Readonly<Record<ProjectShape, React.ComponentType<{ className?: string }>>> = {
  single_repo:     FolderGit,
  multi_repo:      FolderGit2,
  monorepo_subset: Boxes,
}

const STATUS_OPTIONS: ReadonlyArray<{ value: ProjectStatus; label: string }> =
  (Object.entries(PROJECT_STATUS_LABELS) as Array<[ProjectStatus, string]>).map(([value, label]) => ({
    value,
    label,
  }))

export interface HeroProps {
  readonly project: ProjectDetail
}

export function Hero({ project }: HeroProps) {
  const ShapeIcon = SHAPE_ICON[project.shape] ?? FolderGit

  const patch       = usePatchProject(project.id)
  const regenerate  = useRegenerateProject(project.id)
  const canRegenerate = project.is_user_confirmed && project.status !== 'archived'

  return (
    <section className="overflow-hidden rounded-2xl bg-white/2 inset-ring inset-ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-6 px-6 py-6">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-300 inset-ring inset-ring-teal-400/30">
            <ShapeIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <InlineText
                value={project.name}
                displayAs="heading"
                ariaLabel="project name"
                maxLength={200}
                onSave={(next) => patch.mutate({ name: next ?? project.name })}
              />
              <InlineSelect<ProjectStatus>
                value={project.status}
                options={STATUS_OPTIONS}
                ariaLabel="project status"
                onChange={(next) => patch.mutate({ status: next })}
              />
            </div>
            <div className="mt-2">
              <InlineText
                value={project.tagline}
                placeholder={`Add a tagline (defaults to "${PROJECT_TYPE_LABELS[project.type] ?? project.type}")`}
                ariaLabel="project tagline"
                maxLength={140}
                onSave={(next) => patch.mutate({ tagline: next })}
              />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-zinc-500 sm:grid-cols-4">
              <Meta label="Type"   value={PROJECT_TYPE_LABELS[project.type] ?? project.type} />
              <Meta label="Role"   value={PROJECT_ROLE_LABELS[project.role_exhibited] ?? project.role_exhibited} />
              <Meta label="Repos"  value={`${project.repository_count}`} />
              <Meta label="Active" value={formatRelativeTime(project.last_activity_at)} />
            </dl>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <Link
            to="/projects/$id/edit"
            params={{ id: project.id }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-zinc-200 inset-ring inset-ring-white/10 transition-colors hover:bg-white/10"
          >
            <SlidersHorizontal className="size-3.5" />
            Edit
          </Link>
          <button
            type="button"
            onClick={() => regenerate.mutate()}
            disabled={!canRegenerate || regenerate.isPending}
            title={
              canRegenerate
                ? 'Re-run case-study generation'
                : 'Confirm this project before regenerating'
            }
            className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-zinc-200 inset-ring inset-ring-white/10 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${regenerate.isPending ? 'animate-spin' : ''}`} />
            {regenerate.isPending ? 'Queuing…' : 'Regenerate'}
          </button>
        </div>
      </div>
      {regenerate.isError && (
        <p className="border-t border-rose-400/20 bg-rose-400/5 px-6 py-2 text-xs text-rose-300">
          {regenerate.error instanceof Error ? regenerate.error.message : 'Regenerate failed'}
        </p>
      )}
      {patch.isError && (
        <p className="border-t border-rose-400/20 bg-rose-400/5 px-6 py-2 text-xs text-rose-300">
          {patch.error instanceof Error ? patch.error.message : 'Update failed — change reverted'}
        </p>
      )}
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
