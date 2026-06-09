import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { FolderOpen, Github } from 'lucide-react'
import { CommandPallete, type CommandPalleteItem } from '@/components/ui/CommandPallete'
import { projectsQueries } from '../../server/queries'
import { PROJECT_TYPE_LABELS, type ProjectSummary } from '../../lib/types'
import { ProjectCard } from './ProjectCard'
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
  const filtered = useMemo(() => applyFilters(items, filters), [items, filters])
  const commandItems = useMemo(
    () => items.map((p) => ({ id: p.id, name: p.name, description: p.tagline ?? PROJECT_TYPE_LABELS[p.type] })),
    [items],
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
  if (items.length === 0) return <EmptyState />

  return (
    <div className="space-y-4">
      <CommandPallete
        open={palleteOpen}
        setOpen={setPalleteOpen}
        items={commandItems}
        placeholder="Jump to project..."
        onSelect={(item: CommandPalleteItem) => navigate({ to: '/projects/$id', params: { id: item.id } })}
      />

      <ProjectFilterBar value={filters} onChange={setFilters} onSearchClick={() => setPalleteOpen(true)} />
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

function applyFilters(items: ProjectSummary[], filters: ProjectFilterValue): ProjectSummary[] {
  return items.filter((p) => {
    if (filters.type   !== 'all' && p.type   !== filters.type)   return false
    if (filters.status !== 'all' && p.status !== filters.status) return false
    return true
  })
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
