'use client'

import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { STORY_THEMES } from '../types/workspace'
import type { StoryTheme } from '../types/workspace'
import type { StoryDraft } from '../hooks/useStoryBank'

interface StoryFormProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onSubmit: (draft: StoryDraft) => void
  /** Present when editing an existing story. */
  readonly initial?: StoryDraft
}

const EMPTY: StoryDraft = { title: '', situation: '', task: '', action: '', result: '', themes: [] }

const FIELD_CLASS =
  'block w-full rounded-md border-0 bg-zinc-50 p-2 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10'

const STAR_FIELDS: readonly { key: 'situation' | 'task' | 'action' | 'result'; label: string }[] = [
  { key: 'situation', label: 'Situation' },
  { key: 'task', label: 'Task' },
  { key: 'action', label: 'Action' },
  { key: 'result', label: 'Result' },
]

/** Create / edit a STAR story. Guided manual authoring — the "generate from
 *  portfolio" path is a separate follow-on stub. */
export function StoryForm({ open, onClose, onSubmit, initial }: StoryFormProps) {
  const [form, setForm] = useState<StoryDraft>(initial ?? EMPTY)

  function toggleTheme(theme: StoryTheme) {
    setForm(prev => ({
      ...prev,
      themes: prev.themes.includes(theme) ? prev.themes.filter(t => t !== theme) : [...prev.themes, theme],
    }))
  }

  function submit() {
    if (!form.title.trim()) return
    onSubmit(form)
    setForm(EMPTY)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-30">
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {initial ? 'Edit story' : 'Add a story'}
          </DialogTitle>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="story-title" className="mb-1.5 block text-xs font-medium text-zinc-500">Title</label>
              <input id="story-title" type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={FIELD_CLASS} placeholder="e.g. Led the incident bridge during a prod outage" />
            </div>

            {STAR_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label htmlFor={`story-${key}`} className="mb-1.5 block text-xs font-medium text-zinc-500">{label}</label>
                <textarea id={`story-${key}`} rows={2} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className={FIELD_CLASS} />
              </div>
            ))}

            <div>
              <span className="mb-1.5 block text-xs font-medium text-zinc-500">Themes</span>
              <div className="flex flex-wrap gap-1.5">
                {STORY_THEMES.map(theme => {
                  const selected = form.themes.includes(theme)
                  return (
                    <button
                      key={theme}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleTheme(theme)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-(--accent) text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
                      }`}
                    >
                      {theme}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={!form.title.trim()} className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {initial ? 'Save' : 'Add story'}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
