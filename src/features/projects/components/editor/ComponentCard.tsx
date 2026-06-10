import { useDraggable } from '@dnd-kit/core'
import { GitBranch, GripVertical } from 'lucide-react'
import type { ComponentKind, ProjectComponent, ProjectRepositoryLink } from '../../lib/types'

const KIND_LABEL: Readonly<Record<ComponentKind, string>> = {
  frontend: 'Frontend',
  backend:  'Backend',
  infra:    'Infra',
  mobile:   'Mobile',
  data:     'Data',
  ml:       'ML',
  docs:     'Docs',
  shared:   'Shared',
}

export interface ComponentCardProps {
  readonly component:    ProjectComponent
  readonly repositories: ProjectRepositoryLink[]
  readonly staged:       boolean
  readonly disabled?:    boolean
}

export function ComponentCard({ component, repositories, staged, disabled = false }: ComponentCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:       component.id,
    disabled,
    data:     { type: 'component', componentId: component.id },
  })

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md bg-white/2 inset-ring inset-ring-white/10 transition-opacity ${
        isDragging ? 'opacity-40' : ''
      } ${staged ? 'inset-ring-teal-400/40' : ''}`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-label={`Drag ${component.name}`}
          className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-300 active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
          disabled={disabled}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="truncate text-sm font-medium text-zinc-100">{component.name}</span>
        <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-400 inset-ring inset-ring-white/10">
          {KIND_LABEL[component.kind] ?? component.kind}
        </span>
      </div>
      {repositories.length > 0 && (
        <ul className="border-t border-white/5 px-3 py-2">
          {repositories.map((r) => (
            <li key={r.repository_id} className="flex items-center gap-1.5 py-0.5 text-xs text-zinc-400">
              <GitBranch className="size-3 shrink-0 text-zinc-600" />
              <span className="truncate">{r.repository_name}</span>
              {r.subpath && <span className="text-zinc-600">/{r.subpath}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
