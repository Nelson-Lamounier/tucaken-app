'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import type { InterviewStage } from '@/lib/types/applications.types'

function storageKey(slug: string, stage: InterviewStage): string {
  return `finalcheck:${slug}:${stage}`
}

function readChecked(slug: string, stage: InterviewStage): string[] {
  if (globalThis.localStorage === undefined) return []
  try {
    const raw = globalThis.localStorage.getItem(storageKey(slug, stage))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** One checklist item — whole-card toggle, accent check + strike-through when done. */
function ChecklistCard({ label, done, onToggle }: { readonly label: string; readonly done: boolean; readonly onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      className={[
        'flex w-full items-start gap-3 rounded-md border p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500',
        done
          ? 'border-accent/40 bg-accent/5 ring-1 ring-inset ring-accent/30'
          : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-white/2 dark:hover:bg-white/5',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          done ? 'border-accent bg-accent text-white' : 'border-zinc-300 text-transparent dark:border-zinc-600',
        ].join(' ')}
      >
        <Check className="size-3.5" />
      </span>
      <span className={`min-w-0 flex-1 text-sm leading-snug ${done ? 'text-zinc-400 line-through dark:text-zinc-500' : 'font-medium text-zinc-900 dark:text-zinc-100'}`}>
        {label}
      </span>
    </button>
  )
}

interface FinalChecklistProps {
  readonly slug: string
  readonly stage: InterviewStage
  readonly items: readonly string[]
  readonly note?: string | null
}

/**
 * Interactive pre-interview checklist for the coach's structured "Final
 * checkpoint" (items + optional note — no markdown parsing). Tracks completion
 * locally (persisted per application+stage) with a progress bar. Mirrors the
 * selectable-card language of the phone-screen "Questions to ask".
 */
export function FinalChecklist({ slug, stage, items, note }: FinalChecklistProps) {
  // Hydrate from localStorage after mount to avoid an SSR mismatch.
  const [checked, setChecked] = useState<readonly string[]>([])
  useEffect(() => setChecked(readChecked(slug, stage)), [slug, stage])

  function toggle(id: string) {
    setChecked(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      if (globalThis.localStorage !== undefined) {
        try {
          globalThis.localStorage.setItem(storageKey(slug, stage), JSON.stringify(next))
        } catch {
          /* localStorage unavailable — selection is in-session only. */
        }
      }
      return next
    })
  }

  const doneCount = items.filter(i => checked.includes(i)).length
  const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span>{doneCount} of {items.length} done</span>
          <span className="tabular-nums text-accent">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="space-y-2">
        {items.map(item => (
          <li key={item}>
            <ChecklistCard label={item} done={checked.includes(item)} onToggle={() => toggle(item)} />
          </li>
        ))}
      </ul>

      {note && <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{note}</p>}
    </div>
  )
}

/** Read-only checklist (stages without persistence wiring) — bulleted items + note. */
export function FinalChecklistReadonly({ items, note }: { readonly items: readonly string[]; readonly note?: string | null }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {note && <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{note}</p>}
    </div>
  )
}
