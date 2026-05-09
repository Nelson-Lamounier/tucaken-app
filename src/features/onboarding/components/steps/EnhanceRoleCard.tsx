import { useState, useEffect } from 'react'
import { Loader2, X, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/lib/stores/toast-store'
import type { CareerEntry } from '@/server/resume-imports'

interface EnhanceRoleCardProps {
  entry:  CareerEntry
  onSave: (id: string, highlights: string[]) => Promise<void>
}

type RawData = {
  title?:      string
  company?:    string
  period?:     string
  highlights?: string[]
}

type EnrichedData = {
  responsibilities?:   string[]
  transferableSkills?: string[]
  industryContext?:    string
  careerLevel?:        string
}

function isTerminal(status: string) {
  return status === 'complete' || status === 'skipped' || status === 'failed'
}

/** Rough dedup: treat responsibility as already present if first 30 chars match any field. */
function notAlreadyIn(fields: string[]) {
  return (r: string) =>
    !fields.some((f) => f.toLowerCase().includes(r.toLowerCase().slice(0, 30)))
}

export function EnhanceRoleCard({ entry, onSave }: EnhanceRoleCardProps) {
  const raw      = entry.rawData      as RawData
  const enriched = entry.enrichedData as EnrichedData | null

  const { addToast } = useToastStore()

  const [fields, setFields]           = useState<string[]>(raw.highlights ?? [])
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (initialized || !isTerminal(entry.enrichmentStatus)) return
    const existing = raw.highlights ?? []
    if (entry.enrichmentStatus === 'complete' && enriched?.responsibilities?.length) {
      const novel = enriched.responsibilities.filter(notAlreadyIn(existing))
      setFields([...existing, ...novel])
    } else {
      setFields(existing)
    }
    setInitialized(true)
  }, [entry.enrichmentStatus])

  const isLoading     = !isTerminal(entry.enrichmentStatus)
  const isUnavailable = entry.enrichmentStatus === 'skipped' || entry.enrichmentStatus === 'failed'

  const responsibilityChips = (enriched?.responsibilities ?? []).filter(notAlreadyIn(fields))
  const skillChips          = (enriched?.transferableSkills ?? []).filter(notAlreadyIn(fields))

  function addChip(text: string) {
    setFields((prev) => [...prev, text])
    setSaved(false)
  }

  function updateField(i: number, value: string) {
    setFields((prev) => { const next = [...prev]; next[i] = value; return next })
    setSaved(false)
  }

  function removeField(i: number) {
    setFields((prev) => prev.filter((_, j) => j !== i))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(entry.id, fields.filter((f) => f.trim()))
      setSaved(true)
    } catch {
      addToast('error', 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{raw.title ?? '—'}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {raw.company} · {raw.period}
            </p>
          </div>
          <Loader2 className="h-4 w-4 shrink-0 text-indigo-400 animate-spin" />
        </div>
        <p className="mt-2 text-xs text-zinc-600">Researching this role…</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-200 truncate">
              {raw.title ?? '—'}
            </span>
            {enriched?.careerLevel && (
              <span className="shrink-0 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
                {enriched.careerLevel}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {raw.company} · {raw.period}
          </p>
          {enriched?.industryContext && (
            <p className="mt-1 text-xs text-zinc-600 line-clamp-1">
              {enriched.industryContext}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Your highlights
        </p>
        {fields.map((field, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="mt-2.5 text-zinc-600 text-xs select-none">•</span>
            <textarea
              value={field}
              rows={2}
              onChange={(e) => updateField(i, e.target.value)}
              placeholder="Describe what you did…"
              className="flex-1 resize-none rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
            <button
              type="button"
              onClick={() => removeField(i)}
              className="mt-1.5 text-zinc-600 hover:text-zinc-400 transition-colors"
              aria-label="Remove highlight"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => { setFields((prev) => [...prev, '']); setSaved(false) }}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add highlight
        </button>
      </div>

      {(responsibilityChips.length > 0 || skillChips.length > 0) && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Suggested from web research
          </p>
          <div className="flex flex-wrap gap-1.5">
            {responsibilityChips.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => addChip(r)}
                className="rounded-full border border-indigo-500/20 bg-indigo-500/5 px-2.5 py-0.5 text-left text-xs text-indigo-400 hover:bg-indigo-500/10 transition-colors"
              >
                + {r}
              </button>
            ))}
            {skillChips.map((s, i) => (
              <button
                key={`skill-${i}`}
                type="button"
                onClick={() => addChip(s)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-left text-xs text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-colors"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {isUnavailable && (
        <p className="text-xs text-zinc-600">No web research available for this role.</p>
      )}

      <div className="flex justify-end pt-1">
        <Button
          variant="secondary"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs"
        >
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </>
          ) : saved ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              Saved
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </div>
  )
}
