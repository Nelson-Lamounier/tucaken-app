'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, GraduationCap, Wrench, Award, Info, Pencil, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { notifyError } from '@/lib/errors/notify'
import { adminKeys } from '@/lib/api/query-keys'
import { listCareerEntriesFn, updateCareerEntryFn, deleteCareerEntryFn } from '@/server/resume-imports'
import type { CareerEntry, CareerEntryType } from '@/server/resume-imports'
import { entryFields, getList, getText, entryTitle } from '../lib/entry-fields'
import { EntryEditForm } from './EntryEditForm'

const GROUP_ORDER: readonly CareerEntryType[] = [
  'experience', 'education', 'skill', 'certification', 'project', 'achievement',
]

const GROUP_META: Record<CareerEntryType, { label: string; icon: LucideIcon }> = {
  experience:    { label: 'Experience', icon: Briefcase },
  education:     { label: 'Education', icon: GraduationCap },
  skill:         { label: 'Skills', icon: Wrench },
  certification: { label: 'Certifications', icon: Award },
  project:       { label: 'Projects', icon: Award },
  achievement:   { label: 'Achievements', icon: Award },
}

const CAVEAT =
  'Edits update the career data used for resumes and coaching; the knowledge-base embeddings created at import are unchanged. Deleting an entry also removes its embeddings.'

interface CareerEntriesModalProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Scope to one import's entries; undefined shows all entries. */
  readonly entryIds?: readonly string[]
  /** Header context, e.g. the import's original filename. */
  readonly title?: string
}

/** One entry in view mode: headline, secondary line, list values, enrichment badge. */
function EntryView({ entry }: { readonly entry: CareerEntry }) {
  const fields = entryFields(entry)
  const textFields = fields.filter(f => f.kind === 'text')
  const listFields = fields.filter(f => f.kind === 'list')
  const headline = entryTitle(entry)
  const secondary = textFields
    .map(f => getText(entry.rawData, f.key))
    .filter(v => v.length > 0 && v !== headline)
    .join(' · ')
  const enriched = entry.enrichmentStatus === 'complete' && entry.enrichedData !== null

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{headline}</p>
        {enriched && (
          <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/25">
            AI enriched
          </span>
        )}
      </div>
      {secondary.length > 0 && <p className="mt-0.5 truncate text-xs text-zinc-500">{secondary}</p>}
      {listFields.map(f => {
        const items = getList(entry.rawData, f.key)
        if (items.length === 0) return null
        if (entry.entryType === 'skill') {
          return (
            <div key={f.key} className="mt-2 flex flex-wrap gap-1.5">
              {items.map(item => (
                <span key={item} className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                  {item}
                </span>
              ))}
            </div>
          )
        }
        return (
          <ul key={f.key} className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {items.map(item => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-600" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )
      })}
    </div>
  )
}

export function CareerEntriesModal({ open, onClose, entryIds, title }: CareerEntriesModalProps) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: adminKeys.resumeImports.entries(),
    queryFn:  () => listCareerEntriesFn({ data: {} }),
    enabled:  open,
  })

  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<CareerEntry | null>(null)

  const invalidateEntries = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.resumeImports.all })

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; rawData: Record<string, unknown> }) =>
      updateCareerEntryFn({ data: input }),
    onSuccess: async () => {
      setEditingId(null)
      await invalidateEntries()
    },
    onError: (err) => notifyError(err, 'save'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCareerEntryFn({ data: { id } }),
    onSuccess: async () => {
      setDeleting(null)
      await invalidateEntries()
    },
    onError: (err) => notifyError(err, 'delete'),
  })

  const handleClose = () => {
    setEditingId(null)
    setDeleting(null)
    onClose()
  }

  // Reset in-progress edit/delete state whenever the modal closes (regardless
  // of trigger) so reopening never resumes an abandoned draft or confirm dialog.
  useEffect(() => {
    if (!open) {
      setEditingId(null)
      setDeleting(null)
    }
  }, [open])

  const idSet = entryIds ? new Set(entryIds) : null
  const scoped = idSet ? entries.filter(e => idSet.has(e.id)) : entries
  const groups = GROUP_ORDER
    .map(type => ({ type, ...GROUP_META[type], items: scoped.filter(e => e.entryType === type) }))
    .filter(group => group.items.length > 0)

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-30">
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div className="fixed inset-0 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
        <DialogPanel className="flex w-full flex-col overflow-hidden bg-white dark:bg-zinc-900 sm:max-h-[85vh] sm:max-w-2xl sm:rounded-md sm:border sm:border-zinc-200 sm:shadow-xl dark:sm:border-white/10">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-white/10">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Career data
              </DialogTitle>
              {title && <p className="mt-0.5 truncate text-xs text-zinc-500">{title}</p>}
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {isLoading && <p className="py-8 text-center text-sm text-zinc-500">Loading career data…</p>}

            {!isLoading && scoped.length === 0 && (
              <p className="py-8 text-center text-sm text-zinc-500">No entries extracted yet</p>
            )}

            {groups.map(group => (
              <section key={group.type}>
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  <group.icon className="size-3.5" aria-hidden /> {group.label}
                  <span className="tabular-nums text-zinc-300 dark:text-zinc-600">· {group.items.length}</span>
                </h3>
                <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-white/10 dark:border-white/10">
                  {group.items.map(entry => {
                    const isEditing = editingId === entry.id
                    return (
                      <li key={entry.id} data-entry-id={entry.id} className="flex items-start gap-3 px-4 py-3">
                        {isEditing ? (
                          <EntryEditForm
                            entry={entry}
                            busy={updateMutation.isPending}
                            onCancel={() => setEditingId(null)}
                            onSave={(rawData) => updateMutation.mutate({ id: entry.id, rawData })}
                          />
                        ) : (
                          <>
                            <EntryView entry={entry} />
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Edit ${entryTitle(entry)}`}
                                onClick={() => setEditingId(entry.id)}
                                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/5 dark:hover:text-zinc-200"
                              >
                                <Pencil className="size-3.5" aria-hidden />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${entryTitle(entry)}`}
                                onClick={() => setDeleting(entry)}
                                className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>

          <p className="flex items-start gap-2 border-t border-zinc-200 px-5 py-3 text-[11px] leading-relaxed text-zinc-500 dark:border-white/10">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {CAVEAT}
          </p>
        </DialogPanel>
      </div>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deleteMutation.mutate(deleting.id) }}
        title="Delete this entry?"
        body={`"${deleting ? entryTitle(deleting) : ''}" and its knowledge-base embeddings will be removed. This cannot be undone.`}
        confirmLabel="Delete entry"
        destructive
        busy={deleteMutation.isPending}
      />
    </Dialog>
  )
}
