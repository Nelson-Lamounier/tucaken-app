import { useEffect, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Scissors, X } from 'lucide-react'
import type { ProjectComponent } from '../../lib/types'
import { slugify } from '../../lib/format'

export interface SplitPanelProps {
  readonly stagedComponents: ProjectComponent[]
  readonly totalComponents:  number
  readonly isPending:        boolean
  readonly error:            string | null
  readonly onUnstage:        (componentId: string) => void
  readonly onSplit:          (input: { name: string; slug: string }) => void
}

export const SPLIT_DROP_ID = 'split-drop-zone'

export function SplitPanel({
  stagedComponents,
  totalComponents,
  isPending,
  error,
  onUnstage,
  onSplit,
}: SplitPanelProps) {
  const { setNodeRef, isOver } = useDroppable({ id: SPLIT_DROP_ID })
  const [name, setName]            = useState('')
  const [slug, setSlug]            = useState('')
  const [slugDirty, setSlugDirty]  = useState(false)

  useEffect(() => {
    if (!slugDirty) setSlug(slugify(name))
  }, [name, slugDirty])

  // Splitting every component would empty the source project — block it.
  const wouldEmptySource = stagedComponents.length >= totalComponents && totalComponents > 0
  const canSplit = stagedComponents.length > 0 && name.trim().length > 0 && slug.length > 0 && !wouldEmptySource

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md bg-white/2 p-4 inset-ring transition-colors ${
        isOver ? 'inset-ring-teal-400/50 bg-teal-400/5' : 'inset-ring-white/10'
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-white/5 text-zinc-400 inset-ring inset-ring-white/10">
          <Scissors className="size-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-zinc-100">Split into a new project</h3>
      </div>

      {stagedComponents.length === 0 ? (
        <p className="rounded-md border border-dashed border-white/10 px-4 py-8 text-center text-xs text-zinc-500">
          Drag components here to carve them into a new project.
        </p>
      ) : (
        <>
          <ul className="mb-3 flex flex-wrap gap-1.5">
            {stagedComponents.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-1 rounded-full bg-teal-400/10 px-2 py-0.5 text-xs text-teal-200 inset-ring inset-ring-teal-400/30"
              >
                {c.name}
                <button
                  type="button"
                  onClick={() => onUnstage(c.id)}
                  aria-label={`Remove ${c.name} from split`}
                  className="text-teal-300/70 hover:text-teal-100"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">New project name</span>
              <input
                type="text"
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Billing Service"
                className="mt-1 w-full rounded-md bg-white/5 px-2.5 py-1.5 text-sm text-zinc-100 inset-ring inset-ring-white/10 focus:inset-ring-teal-400/40 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Slug</span>
              <input
                type="text"
                value={slug}
                maxLength={80}
                onChange={(e) => { setSlugDirty(true); setSlug(slugify(e.target.value)) }}
                placeholder="billing-service"
                className="mt-1 w-full rounded-md bg-white/5 px-2.5 py-1.5 font-mono text-xs text-zinc-300 inset-ring inset-ring-white/10 focus:inset-ring-teal-400/40 focus:outline-none"
              />
            </label>
          </div>

          {wouldEmptySource && (
            <p className="mt-2 text-xs text-amber-300">
              Keep at least one component in the original project.
            </p>
          )}
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

          <button
            type="button"
            disabled={!canSplit || isPending}
            onClick={() => onSplit({ name: name.trim(), slug })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal-500/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Scissors className="size-3.5" />
            {isPending ? 'Splitting…' : `Split ${stagedComponents.length} component${stagedComponents.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </div>
  )
}
