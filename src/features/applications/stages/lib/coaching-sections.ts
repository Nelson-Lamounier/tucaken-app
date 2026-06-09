/**
 * Coaching-notes adapter → `CoachingSection[]`.
 *
 * The Coach Agent emits `coachingNotes` as an ordered array of composable
 * sections (`{ key, title, body, checklist? }`) the UI distributes to build a
 * per-stage narrative. This adapter normalises every shape to that array:
 *   - already a sections array → validated through;
 *   - the legacy 7-field object → each field mapped to a section;
 *   - a legacy markdown blob → split on bold headers (CDATA stripped);
 *   - undefined/empty → `[]`.
 */

import type { CoachingNotes, CoachingSection } from '@/lib/types/applications.types'

// Re-exported so consumers can import the section type from here.
export type { CoachingSection }

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

/** kebab-case slug for a section title (fallback id). */
function slugify(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return slug.length > 0 ? slug : 'section'
}

/** Pull `- [ ]` checklist items out of a markdown body; rest is the note. */
function extractChecklist(body: string): { items: string[]; note: string } {
  const items: string[] = []
  const noteLines: string[] = []
  for (const raw of body.split('\n')) {
    const match = /^[-*]\s*\[[ xX]?\]\s*(.+)$/.exec(raw.trim())
    if (match) {
      const label = match[1].trim()
      if (label.length > 0) items.push(label)
    } else {
      noteLines.push(raw)
    }
  }
  return { items, note: noteLines.join('\n').trim() }
}

/** Build a section, attaching a checklist when the body carries `- [ ]` items. */
function sectionFromBody(key: string, title: string, body: string): CoachingSection {
  const { items, note } = extractChecklist(body)
  return items.length > 0 ? { key, title, body: note, checklist: items } : { key, title, body }
}

// ── Array (the contract) ────────────────────────────────────────────────────

function fromArray(notes: readonly unknown[]): CoachingSection[] {
  const out: CoachingSection[] = []
  notes.forEach((entry, i) => {
    if (entry === null || typeof entry !== 'object') return
    const o = entry as Record<string, unknown>
    const title = typeof o['title'] === 'string' ? o['title'] : ''
    const body = typeof o['body'] === 'string' ? stripCdata(o['body']) : ''
    const key = typeof o['key'] === 'string' && o['key'].length > 0 ? o['key'] : `section-${String(i)}`
    const checklist = Array.isArray(o['checklist'])
      ? o['checklist'].filter((x): x is string => typeof x === 'string')
      : undefined
    out.push(checklist && checklist.length > 0 ? { key, title, body, checklist } : { key, title, body })
  })
  return out
}

// ── Legacy 7-field object ─────────────────────────────────────────────────────

function fromLegacyObject(notes: CoachingNotes): CoachingSection[] {
  const out: CoachingSection[] = []
  const push = (key: string, title: string, body: string | undefined): void => {
    if (body && body.trim().length > 0) out.push({ key, title, body })
  }
  push('stage-positioning', 'Stage positioning', notes.positioning)
  if (notes.interviewFocus && notes.interviewFocus.length > 0) {
    const body = notes.interviewFocus.map(f => `- **${f.label}** — ${f.detail}`).join('\n')
    out.push({ key: 'interview-focus', title: 'What to expect', body })
  }
  push('tactical-prep', 'Tactical preparation', notes.tacticalPrep)
  push('communication', 'Communication strategy', notes.communication)
  push('mindset', 'Mindset for this round', notes.mindset)
  push('debrief', 'Post-interview debrief', notes.debrief)

  const fc = notes.finalCheckpoint
  if (typeof fc === 'string') {
    out.push(sectionFromBody('final-checkpoint', 'Final checkpoint', fc))
  } else if (fc && fc.items.length > 0) {
    out.push({ key: 'final-checkpoint', title: 'Final checkpoint', body: fc.note ?? '', checklist: fc.items })
  }
  return out
}

// ── Legacy markdown blob ──────────────────────────────────────────────────────

const HEADER_RE = /^\*\*\s*(.+?):?\s*\*\*$/

/** Split a markdown blob into sections on standalone bold-header lines. */
function fromMarkdown(text: string): CoachingSection[] {
  const groups: { title: string; lines: string[] }[] = []
  const lead: string[] = []
  let current: { title: string; lines: string[] } | null = null
  for (const line of text.split('\n')) {
    const header = HEADER_RE.exec(line.trim())
    if (header) {
      current = { title: header[1].trim(), lines: [] }
      groups.push(current)
    } else if (current) {
      current.lines.push(line)
    } else {
      lead.push(line)
    }
  }

  const out: CoachingSection[] = []
  const leadText = lead.join('\n').trim()
  if (leadText.length > 0) out.push({ key: 'coaching-notes', title: 'Coaching notes', body: leadText })
  for (const group of groups) {
    out.push(sectionFromBody(slugify(group.title), group.title, group.lines.join('\n').trim()))
  }
  return out
}

/**
 * Normalise any `coachingNotes` shape to an ordered `CoachingSection[]`.
 */
export function parseCoachingSections(
  rawNotes: string | CoachingNotes | readonly CoachingSection[] | undefined,
): readonly CoachingSection[] {
  if (Array.isArray(rawNotes)) return fromArray(rawNotes)
  // `Array.isArray` doesn't narrow `readonly T[]` out of the union, so cast the
  // remaining object branch (the legacy 7-field shape) explicitly.
  if (rawNotes && typeof rawNotes === 'object') return fromLegacyObject(rawNotes as CoachingNotes)
  const text = stripCdata(rawNotes ?? '')
  return text.length > 0 ? fromMarkdown(text) : []
}
