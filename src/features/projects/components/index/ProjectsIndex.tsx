import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { FolderOpen, FolderPlus, Github, Sparkles } from 'lucide-react'
import { CommandPallete, type CommandPalleteItem } from '@/components/ui/CommandPallete'
import { projectsQueries } from '../../server/queries'
import { useConfirmProject } from '../../server/mutations'
import { PROJECT_TYPE_LABELS, type ProjectSummary } from '../../lib/types'
import { partitionProjects } from '../../lib/classify'
import { useToastStore } from '@/lib/stores/toast-store'
import { ProjectCard } from './ProjectCard'
import { PendingProjectCard } from './PendingProjectCard'
import { ProjectFilterBar, type ProjectFilterValue } from './ProjectFilterBar'

const DEFAULT_FILTERS: ProjectFilterValue = { type: 'all', status: 'all' }

export function ProjectsIndex() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<ProjectFilterValue>(DEFAULT_FILTERS)
  const [palleteOpen, setPalleteOpen] = useState(false)

  const { data, isPending, isError, error } = useQuery(
    projectsQueries.list({ limit: 100, offset: 0, includeArchived: false }),
  )

  const items = data?.items ?? []
  // The list endpoint returns every non-archived project. Only user-confirmed
  // projects ("curated") belong in the grid — raw per-repo defaults stay hidden
  // (they still enrich JD analysis server-side) and AI proposals live in the
  // review flow. See lib/classify.
  const { curated, proposals, pending, defaults } = useMemo(() => partitionProjects(items), [items])
  const filtered = useMemo(() => applyFilters(curated, filters), [curated, filters])
  const commandItems = useMemo(
    () => curated.map((p) => ({ id: p.id, name: p.name, description: p.tagline ?? PROJECT_TYPE_LABELS[p.type] })),
    [curated],
  )

  // ⌘K / Ctrl+K opens the search palette — mirrors the applications list.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPalleteOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  if (isPending) return <SkeletonGrid />
  if (isError)   return <ErrorState message={error instanceof Error ? error.message : 'Failed to load projects'} />
  // No synced repos at all → nothing to build projects from yet.
  if (items.length === 0) return <EmptyState />

  // Repos are synced but the user hasn't curated any project yet. Guide them to
  // the right next step. If there are pending-setup projects, surface them so
  // the user knows setup is in progress rather than seeing nothing.
  if (curated.length === 0) {
    // A lone synced repo can be turned into a project directly (no second repo
    // required) — confirming its default project queues the case study. With
    // two or more defaults, the clustering/connect-another path fits better.
    const loneDefault = defaults.length === 1 ? defaults[0] : undefined
    return (
      <div className="space-y-4">
        {pending.length > 0 && <PendingSection projects={pending} />}
        <NoCuratedState
          proposalCount={proposals.length}
          repoCount={defaults.length}
          buildableDefault={loneDefault ? { id: loneDefault.id, name: loneDefault.name } : undefined}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CommandPallete
        open={palleteOpen}
        setOpen={setPalleteOpen}
        items={commandItems}
        placeholder="Jump to project..."
        onSelect={(item: CommandPalleteItem) => navigate({ to: '/projects/$id', params: { id: item.id } })}
      />

      {proposals.length > 0 && <ProposalsBanner count={proposals.length} />}

      {pending.length > 0 && <PendingSection projects={pending} />}

      <ProjectFilterBar
        value={filters}
        onChange={setFilters}
        onSearchClick={() => setPalleteOpen(true)}
      />

      {filtered.length === 0 ? (
        <FilteredEmptyState onReset={() => setFilters(DEFAULT_FILTERS)} />
      ) : (
        <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** A strip of in-progress setup cards shown above the main grid or guidance. */
function PendingSection({ projects }: { readonly projects: ProjectSummary[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Finishing setup
      </p>
      <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <PendingProjectCard key={p.id} project={p} />
        ))}
      </ul>
    </div>
  )
}

function applyFilters(items: ProjectSummary[], filters: ProjectFilterValue): ProjectSummary[] {
  return items.filter((p) => {
    if (filters.type   !== 'all' && p.type   !== filters.type)   return false
    if (filters.status !== 'all' && p.status !== filters.status) return false
    return true
  })
}

/** A nudge to the review flow when AI groupings are waiting to be accepted. */
function ProposalsBanner({ count }: { readonly count: number }) {
  return (
    <Link
      to="/projects/review"
      className="flex items-center justify-between gap-3 rounded-md bg-indigo-400/5 px-4 py-3 inset-ring inset-ring-indigo-400/30 transition-colors hover:bg-indigo-400/10"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-indigo-400/10 text-indigo-300 inset-ring inset-ring-indigo-400/30">
          <Sparkles className="size-3.5" />
        </span>
        <span className="text-xs text-zinc-300">
          Tucaken grouped your repositories into{' '}
          <span className="font-semibold text-zinc-100">
            {count} project{count === 1 ? '' : 's'}
          </span>{' '}
          to review.
        </span>
      </span>
      <span className="shrink-0 text-xs font-medium text-indigo-300">Review →</span>
    </Link>
  )
}

function SkeletonGrid() {
  return (
    <ul
      role="list"
      aria-label="Loading projects"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="h-24 animate-pulse rounded-md bg-white/2 inset-ring inset-ring-white/10"
        />
      ))}
    </ul>
  )
}

/** Shown when the user has no synced repositories at all. */
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md bg-white/2 px-6 py-16 text-center inset-ring inset-ring-white/10">
      <span className="flex size-12 items-center justify-center rounded-md bg-white/5 inset-ring inset-ring-white/10">
        <FolderOpen className="size-6 text-zinc-400" />
      </span>
      <div className="max-w-sm space-y-1">
        <h2 className="text-base font-semibold text-zinc-100">No projects yet</h2>
        <p className="text-sm text-zinc-500">
          Connect repositories and Tucaken will cluster them into projects automatically.
        </p>
      </div>
      <a
        href="/settings/github"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-300 hover:text-teal-200"
      >
        <Github className="size-3.5" />
        Connect repositories
      </a>
    </div>
  )
}

/**
 * Repos are synced but no project has been curated yet. Three paths:
 *  - AI proposals exist → send the user to review/accept them.
 *  - Exactly one raw default → let them build a project from that single repo
 *    directly (confirming its default project queues the case study).
 *  - Two or more raw defaults → invite them to connect/group via clustering.
 * Either way the user is never shown the raw per-repo defaults as "projects".
 */
function NoCuratedState({
  proposalCount,
  repoCount,
  buildableDefault,
}: {
  readonly proposalCount: number
  readonly repoCount: number
  readonly buildableDefault?: { id: string; name: string }
}) {
  const hasProposals = proposalCount > 0
  return (
    <div className="flex flex-col items-center gap-4 rounded-md bg-white/2 px-6 py-16 text-center inset-ring inset-ring-white/10">
      <span className="flex size-12 items-center justify-center rounded-md bg-teal-400/10 text-teal-300 inset-ring inset-ring-teal-400/30">
        {hasProposals ? <Sparkles className="size-6" /> : <FolderPlus className="size-6" />}
      </span>
      <div className="max-w-sm space-y-1">
        <h2 className="text-base font-semibold text-zinc-100">Create your first project</h2>
        <p className="text-sm text-zinc-500">
          {hasProposals
            ? `Tucaken grouped your repositories into ${proposalCount} project${proposalCount === 1 ? '' : 's'}. Review and accept the ones that look right.`
            : `You've synced ${repoCount} repositor${repoCount === 1 ? 'y' : 'ies'}. Connect another so Tucaken can group related repos into a project — or build one from your existing work.`}
        </p>
      </div>
      <NoCuratedCta
        hasProposals={hasProposals}
        proposalCount={proposalCount}
        buildableDefault={buildableDefault}
      />
    </div>
  )
}

/**
 * The call-to-action(s) for the empty Projects state. Guard clauses keep the
 * three mutually-exclusive paths flat (no nested ternaries): review proposals,
 * build from a lone repo, or connect another repo.
 */
function NoCuratedCta({
  hasProposals,
  proposalCount,
  buildableDefault,
}: {
  readonly hasProposals: boolean
  readonly proposalCount: number
  readonly buildableDefault?: { id: string; name: string }
}) {
  const { addToast } = useToastStore()
  const confirm = useConfirmProject()

  if (hasProposals) {
    return (
      <Link
        to="/projects/review"
        className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-400"
      >
        <Sparkles className="size-3.5" />
        Review {proposalCount} proposal{proposalCount === 1 ? '' : 's'}
      </Link>
    )
  }

  if (buildableDefault) {
    const onBuild = () => {
      confirm.mutate(buildableDefault.id, {
        onSuccess: () => addToast('success', 'Building your project — the case study is generating.'),
        onError:   (err: Error) => addToast('error', `Couldn't start your project: ${err.message}`),
      })
    }
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onBuild}
          disabled={confirm.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
        >
          <FolderPlus className="size-3.5" />
          {confirm.isPending ? 'Starting…' : 'Build a project'}
        </button>
        <a
          href="/settings/github"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <Github className="size-3.5" />
          or connect another repository
        </a>
      </div>
    )
  }

  return (
    <a
      href="/settings/github"
      className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-400"
    >
      <Github className="size-3.5" />
      Connect another repository
    </a>
  )
}

function FilteredEmptyState({ onReset }: { readonly onReset: () => void }) {
  return (
    <div className="rounded-md bg-white/2 px-6 py-12 text-center inset-ring inset-ring-white/10">
      <p className="text-sm text-zinc-400">No projects match the current filters.</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-2 text-xs font-medium text-teal-300 hover:text-teal-200"
      >
        Reset filters
      </button>
    </div>
  )
}

function ErrorState({ message }: { readonly message: string }) {
  return (
    <div className="rounded-md bg-rose-400/5 px-6 py-10 text-center inset-ring inset-ring-rose-400/30">
      <p className="text-sm font-medium text-rose-300">Couldn't load projects</p>
      <p className="mt-1 text-xs text-rose-300/80">{message}</p>
    </div>
  )
}
