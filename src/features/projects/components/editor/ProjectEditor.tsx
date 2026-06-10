import { useMemo, useState } from 'react'
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import type { ProjectRepositoryLink } from '../../lib/types'
import { projectsQueries } from '../../server/queries'
import { useMergeProjects, useSplitProject } from '../../server/mutations'
import { ComponentCard } from './ComponentCard'
import { MergePanel } from './MergePanel'
import { SPLIT_DROP_ID, SplitPanel } from './SplitPanel'

export function ProjectEditor({ projectId }: { readonly projectId: string }) {
  const navigate = useNavigate()
  const { data: project, isPending, isError, error } = useQuery(projectsQueries.detail(projectId))

  const [staged, setStaged] = useState<Set<string>>(new Set())

  const split = useSplitProject(projectId)
  const merge = useMergeProjects(projectId)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const reposByComponent = useMemo(() => {
    const map = new Map<string, ProjectRepositoryLink[]>()
    for (const r of project?.repositories ?? []) {
      const list = map.get(r.component_id) ?? []
      list.push(r)
      map.set(r.component_id, list)
    }
    return map
  }, [project])

  if (isPending) return <EditorSkeleton />
  if (isError) {
    return (
      <div className="rounded-md bg-rose-400/5 px-6 py-10 text-center inset-ring inset-ring-rose-400/30">
        <p className="text-sm font-medium text-rose-300">Couldn't load project</p>
        <p className="mt-1 text-xs text-rose-300/80">{error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="rounded-md bg-white/2 px-6 py-10 text-center inset-ring inset-ring-white/10">
        <p className="text-sm text-zinc-400">Project not found.</p>
      </div>
    )
  }

  const stagedComponents = project.components.filter((c) => staged.has(c.id))

  const onDragEnd = (event: DragEndEvent) => {
    if (event.over?.id === SPLIT_DROP_ID) {
      const componentId = event.active.id as string
      setStaged((prev) => new Set(prev).add(componentId))
    }
  }

  const onSplit = (input: { name: string; slug: string }) => {
    split.mutate(
      { componentIds: [...staged], ...input },
      {
        onSuccess: (res) => {
          setStaged(new Set())
          void navigate({ to: '/projects/$id', params: { id: res.newProjectId } })
        },
      },
    )
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-md bg-white/2 p-4 inset-ring inset-ring-white/10">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-white/5 text-zinc-400 inset-ring inset-ring-white/10">
              <Layers className="size-3.5" />
            </span>
            <h3 className="text-sm font-semibold text-zinc-100">Components</h3>
          </div>
          {project.components.length === 0 ? (
            <p className="text-xs text-zinc-500">This project has no components.</p>
          ) : (
            <div className="space-y-2">
              {project.components.map((c) => (
                <ComponentCard
                  key={c.id}
                  component={c}
                  repositories={reposByComponent.get(c.id) ?? []}
                  staged={staged.has(c.id)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-5">
          <SplitPanel
            stagedComponents={stagedComponents}
            totalComponents={project.components.length}
            isPending={split.isPending}
            error={split.isError ? (split.error instanceof Error ? split.error.message : 'Split failed') : null}
            onUnstage={(id) => setStaged((prev) => { const n = new Set(prev); n.delete(id); return n })}
            onSplit={onSplit}
          />
          <MergePanel
            targetId={project.id}
            targetName={project.name}
            isPending={merge.isPending}
            error={merge.isError ? (merge.error instanceof Error ? merge.error.message : 'Merge failed') : null}
            onMerge={(sourceIds) => merge.mutate(sourceIds)}
          />
        </div>
      </div>
    </DndContext>
  )
}

function EditorSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]" aria-label="Loading editor">
      <div className="h-64 animate-pulse rounded-md bg-white/2 inset-ring inset-ring-white/10" />
      <div className="space-y-5">
        <div className="h-40 animate-pulse rounded-md bg-white/2 inset-ring inset-ring-white/10" />
        <div className="h-40 animate-pulse rounded-md bg-white/2 inset-ring inset-ring-white/10" />
      </div>
    </div>
  )
}
