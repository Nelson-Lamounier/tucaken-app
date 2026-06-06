'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { X } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { useApplicationAnnotations, type AnnotationsApi } from '@/features/applications/stages/hooks/useAnnotations'
import { useDetailRail, type RailTab, type RailSelection } from './selection'
import { NotesTab } from './rail-tabs/NotesTab'
import { TimelineTab } from './rail-tabs/TimelineTab'

const TABS: readonly { id: RailTab; label: string }[] = [
  { id: 'detail', label: 'Detail' },
  { id: 'notes', label: 'Notes' },
  { id: 'timeline', label: 'Timeline' },
]

interface DetailRailProps {
  readonly detail: ApplicationDetail
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Per-item annotations — saved notes for the selected item, with an add form. */
function Annotations({ item, ann }: { readonly item: RailSelection; readonly ann: AnnotationsApi }) {
  const notes = ann.store[item.id]?.notes ?? []
  const [draft, setDraft] = useState('')

  function submit() {
    ann.add({ id: item.id, label: item.label, section: item.section }, draft)
    setDraft('')
  }

  return (
    <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-white/10">
      <h4 className="mb-3 text-[11px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">Annotations</h4>

      {notes.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {notes.map(n => (
            <li key={n.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">{n.text}</p>
              <div className="mt-2 flex items-center justify-between">
                <time className="text-[11px] text-zinc-400">{formatWhen(n.createdAt)}</time>
                <button
                  type="button"
                  onClick={() => ann.remove(item.id, n.id)}
                  className="text-[11px] font-medium text-zinc-400 transition-colors hover:text-red-500"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-500">No annotations yet for this item.</p>
      )}

      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        rows={3}
        placeholder="Add an annotation for this item…"
        className="block w-full rounded-md border-0 bg-zinc-50 p-2.5 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add annotation
        </button>
      </div>
    </div>
  )
}

function DetailPane({ detail, ann }: { readonly detail: ApplicationDetail; readonly ann: AnnotationsApi }) {
  const { tab, selected } = useDetailRail()
  if (tab === 'notes') return <NotesTab store={ann.store} />
  if (tab === 'timeline') return <TimelineTab detail={detail} />
  if (!selected) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Select an item on the left to see its full prep here.
      </p>
    )
  }
  return (
    <div>
      <div className="text-sm text-zinc-600 dark:text-zinc-300">{selected.node}</div>
      <Annotations item={selected} ann={ann} />
    </div>
  )
}

/**
 * Detail drawer: slides in from the right covering 60% of the window; the left
 * 40% is a frosted-glass backdrop that closes on click (or Escape). A titled
 * header names the section + item being viewed; the tabs switch Detail · Notes ·
 * Timeline. The Detail tab ends with the item's annotations; the Notes tab shows
 * the application-wide annotation breakdown per section.
 */
export function DetailRailDrawer({ detail }: DetailRailProps) {
  const { tab, setTab, selected, clear } = useDetailRail()
  const ann = useApplicationAnnotations(detail.slug, detail.userAnnotations)
  const open = selected !== null

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, clear])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ willChange: 'opacity' }}
        >
          {/* Frosted backdrop — left 40%, closes on click */}
          <button
            type="button"
            aria-label="Close detail"
            onClick={clear}
            className="hidden flex-1 cursor-default bg-white/30 backdrop-blur-md sm:block dark:bg-zinc-950/40"
          />

          {/* Panel — right 60% */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Detail"
            className="flex h-full w-full flex-col gap-6 border-l border-zinc-200 bg-white p-8 shadow-2xl sm:w-3/5 dark:border-white/10 dark:bg-zinc-900"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', visualDuration: 0.4, bounce: 0.08 }}
            style={{ willChange: 'transform' }}
          >
            <MotionConfig transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              {/* Title — names the section + item being viewed */}
              <header className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {selected?.section && (
                    <p className="mb-1 text-[11px] font-semibold uppercase text-accent">{selected.section}</p>
                  )}
                  <h2 className="truncate text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {selected?.label ?? 'Detail'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={clear}
                  className="-mr-1 shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  <span className="sr-only">Close detail</span>
                  <X className="size-5" aria-hidden />
                </button>
              </header>

              <div role="tablist" aria-label="Detail rail" className="flex gap-1 rounded-md bg-zinc-100 p-1 dark:bg-white/5">
                {TABS.map(t => {
                  const isActive = t.id === tab
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      id={`rail-tab-${t.id}`}
                      aria-selected={isActive}
                      aria-controls="detail-rail-content"
                      onClick={() => setTab(t.id)}
                      className={`relative flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        isActive ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="rail-drawer-tab"
                          className="absolute inset-0 rounded-md bg-white shadow-sm dark:bg-white/10"
                          style={{ willChange: 'transform' }}
                        />
                      )}
                      <span className="relative">{t.label}</span>
                    </button>
                  )
                })}
              </div>

              <div
                id="detail-rail-content"
                role="tabpanel"
                aria-labelledby={`rail-tab-${tab}`}
                className="min-h-40 flex-1 overflow-y-auto"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    style={{ willChange: 'transform, opacity' }}
                  >
                    <DetailPane detail={detail} ann={ann} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </MotionConfig>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
