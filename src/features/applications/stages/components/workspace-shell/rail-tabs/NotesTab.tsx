'use client'

import { useMemo } from 'react'
import type { ItemAnnotations } from '@/lib/types/applications.types'
import type { AnnotationStore } from '@/features/applications/stages/hooks/useAnnotations'

const NO_SECTION = 'Other'

interface SectionGroup {
  readonly section: string
  readonly items: readonly ItemAnnotations[]
}

/** Group the item-annotations by section for the breakdown view. */
function groupBySection(store: AnnotationStore): SectionGroup[] {
  const bySection = new Map<string, ItemAnnotations[]>()
  for (const item of Object.values(store)) {
    if (item.notes.length === 0) continue
    const key = item.section ?? NO_SECTION
    const list = bySection.get(key) ?? []
    list.push(item)
    bySection.set(key, list)
  }
  return Array.from(bySection, ([section, items]) => ({ section, items }))
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * Read-only breakdown of every annotation on this application, grouped by the
 * section it was written in (e.g. "Skills gaps") and then by item. Notes are
 * authored from each item's Detail tab; this aggregates them.
 */
export function NotesTab({ store }: { readonly store: AnnotationStore }) {
  const groups = useMemo(() => groupBySection(store), [store])

  if (groups.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No annotations yet. Add notes from an item&apos;s Detail tab and they&apos;ll appear here, grouped by section.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <section key={group.section} className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase text-accent">{group.section}</h3>
          <div className="space-y-3">
            {group.items.map(item => (
              <div key={item.label}>
                <p className="mb-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.label}</p>
                <ul className="space-y-2">
                  {item.notes.map(n => (
                    <li
                      key={n.id}
                      className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5"
                    >
                      <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">{n.text}</p>
                      <time className="mt-2 block text-[11px] text-zinc-400">{formatWhen(n.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
