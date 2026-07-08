import { describe, it, expect } from 'vitest'
import {
  entryFields,
  buildDefaults,
  mergeFormValues,
  entryTitle,
} from '@/features/career-data/lib/entry-fields'
import type { CareerEntry } from '@/server/resume-imports'

function makeEntry(entryType: CareerEntry['entryType'], rawData: Record<string, unknown>): CareerEntry {
  return {
    id: 'e1',
    entryType,
    rawData,
    enrichedData: null,
    enrichmentStatus: 'skipped',
    displayOrder: 0,
    createdAt: '2026-05-29T00:00:00.000Z',
  } as CareerEntry
}

describe('entryFields', () => {
  it('returns the experience field map in order', () => {
    const fields = entryFields(makeEntry('experience', {}))
    expect(fields.map(f => f.key)).toEqual(['title', 'company', 'period', 'highlights'])
    expect(fields.find(f => f.key === 'highlights')?.kind).toBe('list')
  })

  it('falls back to generic fields derived from rawData for unmapped types', () => {
    const fields = entryFields(makeEntry('certification', { name: 'CKA', issuer: 'CNCF', tags: ['k8s'], year: 2025 }))
    expect(fields).toEqual([
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'issuer', label: 'Issuer', kind: 'text' },
      { key: 'tags', label: 'Tags', kind: 'list' },
    ]) // non-string field `year` is excluded (passed through on save, not editable)
  })
})

describe('buildDefaults / mergeFormValues', () => {
  it('round-trips edited fields and preserves unmanaged keys', () => {
    const entry = makeEntry('experience', {
      title: 'Engineer', company: 'Acme', period: '2023', highlights: ['a', 'b'], sourcePage: 2,
    })
    const fields = entryFields(entry)
    const defaults = buildDefaults(entry)
    expect(defaults['title']).toBe('Engineer')
    expect(defaults['highlights']).toEqual(['a', 'b'])

    const merged = mergeFormValues(entry.rawData, fields, {
      ...defaults, title: '  Senior Engineer ', highlights: ['a', ' ', 'c '],
    })
    expect(merged['title']).toBe('Senior Engineer')        // trimmed
    expect(merged['highlights']).toEqual(['a', 'c'])       // empty rows dropped, items trimmed
    expect(merged['sourcePage']).toBe(2)                   // unmanaged key preserved
  })
})

describe('entryTitle', () => {
  it('uses the type-appropriate headline field with a fallback', () => {
    expect(entryTitle(makeEntry('experience', { title: 'DevOps Engineer' }))).toBe('DevOps Engineer')
    expect(entryTitle(makeEntry('education', { degree: 'BSc CS' }))).toBe('BSc CS')
    expect(entryTitle(makeEntry('skill', { skills: ['React'] }))).toBe('Skills')
    expect(entryTitle(makeEntry('project', {}))).toBe('Project')
  })
})
