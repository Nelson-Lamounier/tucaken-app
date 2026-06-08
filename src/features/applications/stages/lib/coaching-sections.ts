/**
 * Coaching-notes adapter.
 *
 * The Coach Agent now emits `coachingNotes` as a structured `CoachingNotes`
 * object (positioning, interviewFocus[], tacticalPrep, …) — `fromStructured`
 * maps it straight to `CoachingSections`, no parsing. The durable fix has landed
 * (see ADR-0004 / @bedrock/shared `CoachingNotes`).
 *
 * The legacy path remains for rows generated before the contract change: those
 * are one markdown blob delimited by bold ALL-CAPS headers (`**STAGE
 * POSITIONING…**`, …), which we split best-effort, falling back to a single
 * panel when no known header is found (see `structured`).
 */

import type { CoachingNotes, InterviewFocusItem, FinalCheckpoint } from '@/lib/types/applications.types'

// Re-exported so existing consumers can keep importing them from here.
export type { InterviewFocusItem, FinalCheckpoint }

export interface CoachingSections {
  /** Opening positioning summary (markdown), minus the interview-focus paragraph. */
  readonly positioning: string | null
  /** Parsed "The interview will focus on…" items — feeds the What-to-expect panel. */
  readonly interviewFocus: readonly InterviewFocusItem[] | null
  readonly tacticalPrep: string | null
  readonly communication: string | null
  readonly mindset: string | null
  readonly debrief: string | null
  /** Structured pre-interview checklist — items + optional note. */
  readonly finalCheckpoint: FinalCheckpoint | null
  /** True when at least one known section header was recognised. */
  readonly structured: boolean
  /** Cleaned full markdown (CDATA stripped) — the single-panel fallback source. */
  readonly raw: string
}

/** Split a legacy markdown checklist into structured items + closing note. */
function parseChecklist(markdown: string): FinalCheckpoint {
  const items: string[] = []
  const noteLines: string[] = []
  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    const match = /^[-*]\s*\[[ xX]?\]\s*(.+)$/.exec(line)
    if (match) {
      const label = match[1].trim()
      if (label.length > 0) items.push(label)
    } else if (line.length > 0) {
      noteLines.push(line)
    }
  }
  const note = noteLines.join('\n').trim()
  return note.length > 0 ? { items, note } : { items }
}

/** Normalise the contract value (structured object OR legacy markdown string) → FinalCheckpoint | null. */
function toCheckpoint(value: string | FinalCheckpoint | undefined): FinalCheckpoint | null {
  if (!value) return null
  if (typeof value === 'string') {
    const parsed = parseChecklist(value)
    return parsed.items.length > 0 || parsed.note ? parsed : null
  }
  return value.items.length > 0 || value.note ? value : null
}

/**
 * Strip an XML CDATA wrapper the Coach Agent sometimes leaks around its output
 * (`<![CDATA[ … ]]>`). The markers come from the upstream LLM pipeline's XML
 * template, not from this app — we clean them at render so the notes read right.
 */
export function stripCdata(raw: string): string {
  return raw
    .replace(/^\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*$/, '')
    .trim()
}

type SectionKey = 'positioning' | 'tacticalPrep' | 'communication' | 'mindset' | 'debrief' | 'finalCheckpoint'

/** Header matchers — a bold ALL-CAPS title line per section. */
const SECTION_DEFS: readonly { readonly key: SectionKey; readonly re: RegExp }[] = [
  { key: 'positioning',     re: /\*\*\s*STAGE POSITIONING[^*\n]*\*\*/i },
  { key: 'tacticalPrep',    re: /\*\*\s*TACTICAL PREPARATION[^*\n]*\*\*/i },
  { key: 'communication',   re: /\*\*\s*COMMUNICATION STRATEGY[^*\n]*\*\*/i },
  { key: 'mindset',         re: /\*\*\s*MINDSET FOR THIS ROUND[^*\n]*\*\*/i },
  { key: 'debrief',         re: /\*\*\s*POST-?INTERVIEW DEBRIEF[^*\n]*\*\*/i },
  { key: 'finalCheckpoint', re: /\*\*\s*FINAL CHECKPOINT[^*\n]*\*\*/i },
]

interface FoundHeader {
  readonly key: SectionKey
  readonly start: number
  readonly end: number
}

/** Locate each known header in the text, sorted by position. */
function locateHeaders(text: string): FoundHeader[] {
  const found: FoundHeader[] = []
  for (const def of SECTION_DEFS) {
    const m = def.re.exec(text)
    if (m) found.push({ key: def.key, start: m.index, end: m.index + m[0].length })
  }
  return found.sort((a, b) => a.start - b.start)
}

const FOCUS_LEAD = /^\s*The interview will focus on:?\s*/i

/** Split the positioning body into the summary and the interview-focus paragraph. */
function splitPositioning(body: string): { summary: string; focus: string | null } {
  const idx = body.search(/(^|\n)\s*The interview will focus on/i)
  if (idx < 0) return { summary: body.trim(), focus: null }
  return { summary: body.slice(0, idx).trim(), focus: body.slice(idx).trim() }
}

/** Parse "(1) **Coding problems** (30–40 min) — …" into label/detail items. */
function parseFocusItems(focusText: string): InterviewFocusItem[] {
  const stripped = focusText.replace(FOCUS_LEAD, '')
  const parts = stripped.split(/\s*\(\d+\)\s*/).map(s => s.trim()).filter(Boolean)
  return parts.map(part => {
    const bold = /^\*\*(.+?)\*\*\s*(.*)$/s.exec(part)
    if (bold) {
      const detail = bold[2].replace(/^\s*[—–-]\s*/, '').trim()
      return { label: bold[1].trim(), detail }
    }
    const dash = part.split(/\s+[—–-]\s+/)
    return { label: dash[0].trim(), detail: dash.slice(1).join(' — ').trim() }
  })
}

const EMPTY: CoachingSections = {
  positioning: null,
  interviewFocus: null,
  tacticalPrep: null,
  communication: null,
  mindset: null,
  debrief: null,
  finalCheckpoint: null,
  structured: false,
  raw: '',
}

/**
 * Parse a coaching-notes markdown blob into its named sections. Returns
 * `structured: false` (with `raw` set) when no known header is present, so the
 * caller can fall back to rendering the whole blob in one panel.
 */
/** Trimmed string, or null when empty/absent. */
function orNull(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value : null
}

/**
 * Adapter for the structured coach contract (`CoachingNotes`). New rows arrive
 * pre-split, so we map fields straight through — no markdown parsing needed.
 */
function fromStructured(notes: CoachingNotes): CoachingSections {
  return {
    positioning: orNull(notes.positioning),
    interviewFocus: notes.interviewFocus && notes.interviewFocus.length > 0 ? notes.interviewFocus : null,
    tacticalPrep: orNull(notes.tacticalPrep),
    communication: orNull(notes.communication),
    mindset: orNull(notes.mindset),
    debrief: orNull(notes.debrief),
    finalCheckpoint: toCheckpoint(notes.finalCheckpoint),
    structured: true,
    raw: '',
  }
}

export function parseCoachingSections(rawNotes: string | CoachingNotes | undefined): CoachingSections {
  // New contract: already-structured object — map directly.
  if (rawNotes && typeof rawNotes === 'object') return fromStructured(rawNotes)

  // Legacy: a markdown blob — strip CDATA and split on known headers.
  const text = stripCdata(rawNotes ?? '')
  if (!text) return EMPTY

  const headers = locateHeaders(text)
  if (headers.length === 0) {
    return { ...EMPTY, raw: text }
  }

  // Body of each header = text between its end and the next header's start.
  const bodies = new Map<SectionKey, string>()
  for (let i = 0; i < headers.length; i++) {
    const next = headers[i + 1]
    const body = text.slice(headers[i].end, next ? next.start : text.length).trim()
    bodies.set(headers[i].key, body)
  }

  // Leading text before the first header (used as positioning when no STAGE header).
  const lead = text.slice(0, headers[0].start).trim()

  const positioningRaw = bodies.get('positioning') ?? (lead.length > 0 ? lead : '')
  const { summary, focus } = splitPositioning(positioningRaw)

  return {
    positioning: summary.length > 0 ? summary : null,
    interviewFocus: focus ? parseFocusItems(focus) : null,
    tacticalPrep: bodies.get('tacticalPrep') ?? null,
    communication: bodies.get('communication') ?? null,
    mindset: bodies.get('mindset') ?? null,
    debrief: bodies.get('debrief') ?? null,
    finalCheckpoint: toCheckpoint(bodies.get('finalCheckpoint')),
    structured: true,
    raw: text,
  }
}
