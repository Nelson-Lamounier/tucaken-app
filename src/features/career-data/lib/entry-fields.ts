import type { CareerEntry, CareerEntryType } from '@/server/resume-imports'

export interface EntryFieldDef {
  readonly key: string
  readonly label: string
  readonly kind: 'text' | 'list'
}

/** Curated field maps for the types whose extracted shape is known. Types
 *  mapped to an empty array fall back to a generic rawData-derived form. */
const ENTRY_FIELD_MAP: Record<CareerEntryType, readonly EntryFieldDef[]> = {
  experience: [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'company', label: 'Company', kind: 'text' },
    { key: 'period', label: 'Period', kind: 'text' },
    { key: 'highlights', label: 'Highlights', kind: 'list' },
  ],
  education: [
    { key: 'degree', label: 'Degree', kind: 'text' },
    { key: 'institution', label: 'Institution', kind: 'text' },
    { key: 'period', label: 'Period', kind: 'text' },
  ],
  skill: [{ key: 'skills', label: 'Skills', kind: 'list' }],
  certification: [],
  project: [],
  achievement: [],
}

function labelise(key: string): string {
  const spaced = key.replaceAll(/([A-Z])/g, ' $1').replaceAll(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/** Generic fallback: string fields become text inputs, string-array fields
 *  become list editors; anything else is read-only and passed through. */
function genericFields(rawData: Record<string, unknown>): EntryFieldDef[] {
  return Object.entries(rawData).flatMap(([key, value]): EntryFieldDef[] => {
    if (typeof value === 'string') return [{ key, label: labelise(key), kind: 'text' }]
    if (isStringArray(value)) return [{ key, label: labelise(key), kind: 'list' }]
    return []
  })
}

export function entryFields(entry: CareerEntry): EntryFieldDef[] {
  const mapped = ENTRY_FIELD_MAP[entry.entryType]
  if (mapped.length > 0) return [...mapped]
  return genericFields(entry.rawData)
}

export function getText(rawData: Record<string, unknown>, key: string): string {
  const value = rawData[key]
  return typeof value === 'string' ? value : ''
}

export function getList(rawData: Record<string, unknown>, key: string): string[] {
  const value = rawData[key]
  return isStringArray(value) ? value : []
}

/** Initial form values for an entry — text fields as strings, list fields as arrays. */
export function buildDefaults(entry: CareerEntry): Record<string, string | string[]> {
  const defaults: Record<string, string | string[]> = {}
  for (const field of entryFields(entry)) {
    defaults[field.key] = field.kind === 'list' ? getList(entry.rawData, field.key) : getText(entry.rawData, field.key)
  }
  return defaults
}

/** Merge edited values back into rawData: trim strings, drop empty list rows,
 *  preserve every key the form does not manage. */
export function mergeFormValues(
  rawData: Record<string, unknown>,
  fields: readonly EntryFieldDef[],
  values: Record<string, string | string[]>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...rawData }
  for (const field of fields) {
    const value = values[field.key]
    if (field.kind === 'list' && isStringArray(value)) {
      merged[field.key] = value.map(item => item.trim()).filter(item => item.length > 0)
    }
    if (field.kind === 'text' && typeof value === 'string') {
      merged[field.key] = value.trim()
    }
  }
  return merged
}

const TYPE_FALLBACK_TITLE: Record<CareerEntryType, string> = {
  experience: 'Experience',
  education: 'Education',
  skill: 'Skills',
  certification: 'Certification',
  project: 'Project',
  achievement: 'Achievement',
}

/** Display headline for an entry — first non-empty headline-ish field, else the type name. */
export function entryTitle(entry: CareerEntry): string {
  for (const key of ['title', 'degree', 'name']) {
    const value = getText(entry.rawData, key)
    if (value.length > 0) return value
  }
  return TYPE_FALLBACK_TITLE[entry.entryType]
}
