import type { ReactNode } from 'react'
import { type Tone } from '@/components/ui/tone'

/**
 * Presentational building blocks for the detail rail's Detail tab. The rail is
 * dynamic — every SummaryRow feeds it a different `detail` node — so these give
 * each served node one consistent, readable layout: generous spacing, calm
 * colours, labelled sections, bullets, and soft callouts. All surfaces use the
 * project default `rounded-md` radius.
 */

/** A labelled block: small uppercase eyebrow over a readable body. */
export function RailField({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</h4>
      <div className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-200">{children}</div>
    </section>
  )
}

const CALLOUT_TONE: Record<Tone, string> = {
  good:   'bg-emerald-50 text-emerald-900 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/15',
  warn:   'bg-amber-50 text-amber-900 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/15',
  bad:    'bg-red-50 text-red-900 ring-red-600/15 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-400/15',
  muted:  'bg-zinc-50 text-zinc-700 ring-zinc-500/10 dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10',
  accent: 'bg-accent/8 text-zinc-800 ring-accent/15 dark:text-zinc-200',
}

/** A soft, padded callout for a key line (a bridge, takeaway, suggested answer). */
export function RailCallout({
  label,
  tone = 'accent',
  children,
}: {
  readonly label?: string
  readonly tone?: Tone
  readonly children: ReactNode
}) {
  return (
    <div className={`rounded-md px-4 py-3 ring-1 ring-inset ${CALLOUT_TONE[tone]}`}>
      {label && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>}
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}

/** A bulleted list with accent markers and breathing room between rows. */
export function RailBullets({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-200">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// RailRichText — turns a dense coach blob into readable structure.
// Coach text often embeds an enumeration ("(1) Label: … (2) …") and a trailing
// "Conclusion:" inside one paragraph. We recover that shape so it doesn't render
// as a saturated wall of text. Non-enumerated text falls back to paragraphs.
// ---------------------------------------------------------------------------

interface RichItem {
  readonly label: string | null
  readonly body: string
}

const OUTRO_RE = /\b(?:Conclusion|In summary|Bottom line|Overall|Net net)\b\s*:/i

/** Split "Label: body" when the prefix reads like a short label, not a sentence. */
function splitLabel(segment: string): RichItem {
  const idx = segment.indexOf(':')
  if (idx > 0 && idx <= 48) {
    const label = segment.slice(0, idx).trim()
    if (label.length > 0 && !/[.?!]/.test(label)) {
      return { label, body: segment.slice(idx + 1).trim() }
    }
  }
  return { label: null, body: segment }
}

function parseRich(raw: string): { intro: string | null; items: readonly RichItem[]; outro: string | null } {
  const text = raw.trim().replace(/^["']/, '').replace(/["']$/, '').trim()
  const parts = text.split(/\s*\(\d+\)\s*/)
  const intro = parts[0]?.trim() ? parts[0].trim() : null
  const segments = parts.slice(1).map(s => s.trim()).filter(Boolean)
  if (segments.length === 0) return { intro, items: [], outro: null }

  let outro: string | null = null
  const lastIdx = segments.length - 1
  const match = OUTRO_RE.exec(segments[lastIdx])
  if (match && match.index > 0) {
    outro = segments[lastIdx].slice(match.index).trim()
    segments[lastIdx] = segments[lastIdx].slice(0, match.index).trim().replace(/[.\s]+$/, '')
  }
  return { intro, items: segments.map(splitLabel), outro }
}

/** Free text → paragraphs (split on blank lines). */
function Paragraphs({ text }: { readonly text: string }) {
  const paras = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
  const list = paras.length > 0 ? paras : [text]
  return (
    <>
      {list.map(p => (
        <p key={p.slice(0, 60)}>{p}</p>
      ))}
    </>
  )
}

/**
 * Render a coach blob as intro paragraph(s) + a numbered list (with bolded
 * sub-labels) + an optional conclusion. Readable, spaced, never a wall of text.
 */
export function RailRichText({ text }: { readonly text: string }) {
  const { intro, items, outro } = parseRich(text)
  if (items.length === 0) {
    return (
      <div className="space-y-2.5 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-200">
        {intro ? <Paragraphs text={intro} /> : null}
      </div>
    )
  }
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-200">
      {intro ? <Paragraphs text={intro} /> : null}
      <ol className="space-y-2.5">
        {items.map((it, i) => (
          <li key={(it.label ?? it.body).slice(0, 60)} className="flex gap-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/12 text-[11px] font-semibold tabular-nums text-accent">
              {i + 1}
            </span>
            <span className="flex-1">
              {it.label ? <span className="font-semibold text-zinc-900 dark:text-zinc-100">{it.label}. </span> : null}
              {it.body}
            </span>
          </li>
        ))}
      </ol>
      {outro ? (
        <p className="border-t border-zinc-200 pt-3 text-zinc-700 dark:border-white/10 dark:text-zinc-200">{outro}</p>
      ) : null}
    </div>
  )
}
