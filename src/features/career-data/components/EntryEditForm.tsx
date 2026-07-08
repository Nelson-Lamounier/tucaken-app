'use client'

import { useForm } from '@tanstack/react-form'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { CareerEntry } from '@/server/resume-imports'
import { buildDefaults, entryFields, mergeFormValues } from '../lib/entry-fields'

const INPUT_CLASSES =
  'w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-accent focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-zinc-100'
const LABEL_CLASSES = 'text-xs font-medium text-zinc-600 dark:text-zinc-400'

interface EntryEditFormProps {
  readonly entry: CareerEntry
  readonly onSave: (rawData: Record<string, unknown>) => void
  readonly onCancel: () => void
  readonly busy?: boolean
}

/** Structured editor for one career entry, driven by the per-type field map.
 *  Text fields render as inputs, list fields as add/remove row editors. */
export function EntryEditForm({ entry, onSave, onCancel, busy }: EntryEditFormProps) {
  const fields = entryFields(entry)
  const form = useForm({
    defaultValues: buildDefaults(entry),
    onSubmit: ({ value }) => {
      const merged = mergeFormValues(entry.rawData, fields, value)
      // Guard: refuse to save an entry whose managed fields are all empty.
      const hasContent = fields.some(def => {
        const fieldValue = merged[def.key]
        if (typeof fieldValue === 'string') return fieldValue.length > 0
        return Array.isArray(fieldValue) && fieldValue.length > 0
      })
      if (!hasContent) return
      onSave(merged)
    },
  })

  return (
    <form
      className="w-full space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {fields.map(def => (
        <div key={def.key} className="space-y-1">
          <label htmlFor={`entry-${entry.id}-${def.key}`} className={LABEL_CLASSES}>{def.label}</label>
          {def.kind === 'text' ? (
            <form.Field
              name={def.key}
              children={(field) => (
                <input
                  id={`entry-${entry.id}-${def.key}`}
                  value={typeof field.state.value === 'string' ? field.state.value : ''}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  className={INPUT_CLASSES}
                />
              )}
            />
          ) : (
            <form.Field
              name={def.key}
              mode="array"
              children={(field) => (
                <div className="space-y-2">
                  {(field.state.value as string[]).map((_, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <form.Field
                        name={`${def.key}[${index}]`}
                        children={(itemField) => (
                          <input
                            aria-label={`${def.label} ${index + 1}`}
                            value={typeof itemField.state.value === 'string' ? itemField.state.value : ''}
                            onChange={(event) => itemField.handleChange(event.target.value)}
                            onBlur={itemField.handleBlur}
                            className={INPUT_CLASSES}
                          />
                        )}
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${def.label} ${index + 1}`}
                        onClick={() => field.removeValue(index)}
                        className="mt-1.5 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/5"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => field.pushValue('')}
                    className="flex items-center gap-1 text-xs text-accent transition-opacity hover:opacity-80"
                  >
                    <Plus className="size-3.5" aria-hidden /> Add {def.label.toLowerCase().replace(/s$/, '')}
                  </button>
                </div>
              )}
            />
          )}
        </div>
      ))}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" type="button" onClick={onCancel} className="text-xs">
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={busy} className="text-xs">
          Save changes
        </Button>
      </div>
    </form>
  )
}
