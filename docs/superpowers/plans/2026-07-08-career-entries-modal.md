# Career Entries Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reusable modal to view, edit (structured per-type forms), and delete the career entries extracted from uploaded resume PDFs, opened from the settings "Uploaded files" rows (scoped to one import) and the dashboard Career Data panel (all entries).

**Architecture:** New feature slice `src/features/career-data/` holding the modal, the per-type field map, and the edit form; one new thin server fn (`deleteCareerEntryFn`) wrapping the existing admin-api DELETE; the generic `ConfirmModal` promoted from the applications feature to `src/components/ui/`. Data flows through the existing `listCareerEntriesFn`/`updateCareerEntryFn` and the `adminKeys.resumeImports` query keys. Spec: `docs/superpowers/specs/2026-07-08-career-entries-modal-design.md`.

**Tech Stack:** React 19, TanStack Start server fns, TanStack Query, TanStack Form (`useForm`, `form.Field` with `mode="array"` — the exact idiom already used in `src/features/resumes/components/ResumeForm.tsx:317-375`), Headless UI `Dialog`, Zod, Vitest + Testing Library (happy-dom).

## Global Constraints

- Yarn 4 only (`yarn test`, `yarn lint`, `yarn typecheck`) — never npm/npx. PATH prefix required: `export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"`.
- Work happens on a FRESH worktree/branch off `origin/main` (Task 1 Step 1) — NOT on `worktree-ui-design`.
- No nested ternaries (Sonar S3358); guard clauses over nested conditionals; complexity ≤ 10 per function.
- `rounded-md` for new surfaces; every new surface renders correctly in light AND dark mode.
- UK English in comments and user-facing copy; no non-ASCII diacritics; product name "Tucaken", never "the agent".
- No `console.*` in app code. Catch errors as `unknown`. `Number.*` over bare globals. Stable React keys (never array index for dynamic lists with ids — form-array rows without ids may use index, matching `ResumeForm.tsx`).
- Server fns validate input with Zod; `deleteCareerEntryFn` validates the id as UUID.
- Edits merge into `rawData` — fields the form does not manage MUST be preserved unchanged.
- Modal: focus-trapped Headless UI Dialog, internal scroll, full-screen sheet below `sm`, no horizontal overflow at ~320px.
- Footer caveat copy (verbatim): "Edits update the career data used for resumes and coaching; the knowledge-base embeddings created at import are unchanged. Deleting an entry also removes its embeddings."
- Commits follow the git-commit skill (tests + lint first, Conventional Commits, no AI co-author trailer) and impact-commits for bodies.

---

### Task 1: Branch setup + promote ConfirmModal to `src/components/ui/`

**Files:**

- Create: `src/components/ui/ConfirmModal.tsx` (verbatim move)
- Delete: `src/features/applications/stages/components/ConfirmModal.tsx`
- Modify: `src/features/applications/components/ApplicationDetailContainer.tsx:29` (import path)
- Cherry-pick: the spec+plan docs commits onto the new branch

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `ConfirmModal({ open, onClose, onConfirm, title, body, confirmLabel, destructive?, busy? })` importable from `@/components/ui/ConfirmModal` — used verbatim by Task 4.

- [ ] **Step 1: Create the branch**

From the main checkout's repo (any worktree), create a new worktree/branch off the freshest main. If the controller session manages worktrees natively, it creates `career-entries-modal` via its worktree tool; otherwise:

```bash
git fetch origin main
git worktree add .claude/worktrees/career-entries-modal -b feat/career-entries-modal origin/main
cd .claude/worktrees/career-entries-modal
```

Then bring over the docs and install deps:

```bash
git cherry-pick e2688fe   # docs(career-data): add career entries modal spec
# after this plan is committed on worktree-ui-design, cherry-pick that commit too (controller supplies the SHA)
export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
yarn install
```

- [ ] **Step 2: Move ConfirmModal verbatim**

```bash
mkdir -p src/components/ui
git mv src/features/applications/stages/components/ConfirmModal.tsx src/components/ui/ConfirmModal.tsx
```

Do not restyle or edit the file body (mechanical move; its `rounded-2xl` classes stay — restyling is out of scope per the spec). Update the doc comment's first line to drop the offer-specific wording:

```tsx
/** Generic confirmation dialog (destructive actions get a red confirm button).
 *  Focus-trapped via headlessui. */
```

- [ ] **Step 3: Update the single import site**

In `src/features/applications/components/ApplicationDetailContainer.tsx` line 29:

```tsx
import { ConfirmModal } from '@/components/ui/ConfirmModal'
```

- [ ] **Step 4: Verify**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: typecheck clean; lint 0 errors (pre-existing warnings acceptable); full suite passes (same counts as `origin/main` baseline).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ui): promote ConfirmModal to shared ui" -m "- Moved the already-generic ConfirmModal from the applications
feature to src/components/ui and repointed its single import,
readying it for reuse by the career-data feature (reuse-first
rule: 2+ features now consume it)."
```

---

### Task 2: `deleteCareerEntryFn` server fn + `entry-fields` helpers

**Files:**

- Modify: `src/server/resume-imports.ts` (append one fn after `updateCareerEntryFn`, ~line 258)
- Create: `src/features/career-data/lib/entry-fields.ts`
- Test: `src/__tests__/features/career-data/entry-fields.test.ts`

**Interfaces:**

- Consumes: existing `apiFetch`, `requireAuth`, `z` already imported in `src/server/resume-imports.ts`; `CareerEntry`, `CareerEntryType` types from `@/server/resume-imports`.
- Produces:
  - `deleteCareerEntryFn({ data: { id: string } }): Promise<{ deleted: boolean }>` from `@/server/resume-imports`.
  - From `@/features/career-data/lib/entry-fields`:
    - `interface EntryFieldDef { readonly key: string; readonly label: string; readonly kind: 'text' | 'list' }`
    - `entryFields(entry: CareerEntry): EntryFieldDef[]` — per-type map with generic fallback.
    - `getText(rawData: Record<string, unknown>, key: string): string`
    - `getList(rawData: Record<string, unknown>, key: string): string[]`
    - `buildDefaults(entry: CareerEntry): Record<string, string | string[]>`
    - `mergeFormValues(rawData: Record<string, unknown>, fields: readonly EntryFieldDef[], values: Record<string, string | string[]>): Record<string, unknown>`
    - `entryTitle(entry: CareerEntry): string` — display name for headers/accessible labels.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/features/career-data/entry-fields.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test src/__tests__/features/career-data/entry-fields.test.ts`
Expected: FAIL — module `@/features/career-data/lib/entry-fields` not found.

- [ ] **Step 3: Implement `entry-fields.ts`**

Create `src/features/career-data/lib/entry-fields.ts`:

```ts
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
```

- [ ] **Step 4: Append `deleteCareerEntryFn` to `src/server/resume-imports.ts`**

Insert directly after `updateCareerEntryFn` (after current line 258), matching the sibling fns' style:

```ts
export const deleteCareerEntryFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ deleted: boolean }>(
      `/resume-imports/career-entries/${data.id}`,
      {
        method:       'DELETE',
        pathTemplate: '/resume-imports/career-entries/:id',
      },
    )
  })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn test src/__tests__/features/career-data/entry-fields.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Full gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/server/resume-imports.ts src/features/career-data/lib/entry-fields.ts src/__tests__/features/career-data/entry-fields.test.ts
git commit -m "feat(career-data): entry field map + delete server fn" -m "- Added the per-type field map with a generic rawData-derived
fallback (string fields -> inputs, string arrays -> list editors)
so every extracted entry type is editable, with merge semantics
that trim, drop empty rows, and preserve unmanaged keys.
- Added deleteCareerEntryFn wrapping the existing admin-api
DELETE /resume-imports/career-entries/:eid (UUID-validated)."
```

---

### Task 3: `CareerEntriesModal` — dialog shell + grouped view mode

**Files:**

- Create: `src/features/career-data/components/CareerEntriesModal.tsx`
- Test: `src/__tests__/features/career-data/career-entries-modal.test.tsx`

**Interfaces:**

- Consumes: `entryFields`, `getText`, `getList`, `entryTitle` from Task 2; existing `listCareerEntriesFn`, `CareerEntry` from `@/server/resume-imports`; `adminKeys` from `@/lib/api/query-keys`.
- Produces: `CareerEntriesModal({ open, onClose, entryIds?, title? })` from `@/features/career-data/components/CareerEntriesModal` — the component Tasks 4-5 extend/mount. Also exports (for Task 4's use in the same file) the internal `EntryRow` layout contract: each entry renders inside `<li data-entry-id={entry.id}>`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/features/career-data/career-entries-modal.test.tsx`:

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CareerEntry } from '@/server/resume-imports'

const listMock   = vi.fn()
const updateMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('@/server/resume-imports', () => ({
  listCareerEntriesFn:  (...args: unknown[]) => listMock(...args),
  updateCareerEntryFn:  (...args: unknown[]) => updateMock(...args),
  deleteCareerEntryFn:  (...args: unknown[]) => deleteMock(...args),
}))

import { CareerEntriesModal } from '@/features/career-data/components/CareerEntriesModal'

const ENTRIES: CareerEntry[] = [
  {
    id: 'exp-1', entryType: 'experience',
    rawData: { title: 'Senior DevOps Engineer', company: 'Acme', period: '2023-2026', highlights: ['Led EKS migration'] },
    enrichedData: { note: 'x' }, enrichmentStatus: 'complete', displayOrder: 0, createdAt: '2026-05-29T00:00:00.000Z',
  },
  {
    id: 'edu-1', entryType: 'education',
    rawData: { degree: 'BSc Computer Science', institution: 'UFMG', period: '2015-2019' },
    enrichedData: null, enrichmentStatus: 'skipped', displayOrder: 1, createdAt: '2026-05-29T00:00:00.000Z',
  },
  {
    id: 'skill-1', entryType: 'skill',
    rawData: { skills: ['React', 'TypeScript'] },
    enrichedData: null, enrichmentStatus: 'skipped', displayOrder: 2, createdAt: '2026-05-29T00:00:00.000Z',
  },
] as CareerEntry[]

function renderModal(props: Partial<Parameters<typeof CareerEntriesModal>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CareerEntriesModal open onClose={() => {}} {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listMock.mockResolvedValue(ENTRIES)
})

describe('CareerEntriesModal — view mode', () => {
  it('groups entries by type and renders their extracted fields', async () => {
    renderModal({ title: 'Nelson_Lamounier_Resume.pdf' })
    expect(await screen.findByText('Senior DevOps Engineer')).toBeTruthy()
    expect(screen.getByText('Experience')).toBeTruthy()
    expect(screen.getByText('Education')).toBeTruthy()
    expect(screen.getByText('BSc Computer Science')).toBeTruthy()
    expect(screen.getByText('React')).toBeTruthy()
    expect(screen.getByText('Led EKS migration')).toBeTruthy()
    expect(screen.getByText('AI enriched')).toBeTruthy()
    expect(screen.getByText('Nelson_Lamounier_Resume.pdf')).toBeTruthy()
  })

  it('scopes to entryIds when provided', async () => {
    renderModal({ entryIds: ['edu-1'] })
    expect(await screen.findByText('BSc Computer Science')).toBeTruthy()
    expect(screen.queryByText('Senior DevOps Engineer')).toBeNull()
  })

  it('renders the empty state when no entries exist', async () => {
    listMock.mockResolvedValue([])
    renderModal()
    expect(await screen.findByText('No entries extracted yet')).toBeTruthy()
  })

  it('shows the embeddings caveat in the footer', async () => {
    renderModal()
    expect(await screen.findByText(/knowledge-base embeddings created at import are unchanged/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test src/__tests__/features/career-data/career-entries-modal.test.tsx`
Expected: FAIL — `CareerEntriesModal` module not found.

- [ ] **Step 3: Implement the modal (view mode only in this task)**

Create `src/features/career-data/components/CareerEntriesModal.tsx`:

```tsx
'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, GraduationCap, Wrench, Award, Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { adminKeys } from '@/lib/api/query-keys'
import { listCareerEntriesFn } from '@/server/resume-imports'
import type { CareerEntry, CareerEntryType } from '@/server/resume-imports'
import { entryFields, getList, getText, entryTitle } from '../lib/entry-fields'

const GROUP_ORDER: readonly CareerEntryType[] = [
  'experience', 'education', 'skill', 'certification', 'project', 'achievement',
]

const GROUP_META: Record<CareerEntryType, { label: string; icon: LucideIcon }> = {
  experience:    { label: 'Experience', icon: Briefcase },
  education:     { label: 'Education', icon: GraduationCap },
  skill:         { label: 'Skills', icon: Wrench },
  certification: { label: 'Certifications', icon: Award },
  project:       { label: 'Projects', icon: Award },
  achievement:   { label: 'Achievements', icon: Award },
}

const CAVEAT =
  'Edits update the career data used for resumes and coaching; the knowledge-base embeddings created at import are unchanged. Deleting an entry also removes its embeddings.'

interface CareerEntriesModalProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Scope to one import's entries; undefined shows all entries. */
  readonly entryIds?: readonly string[]
  /** Header context, e.g. the import's original filename. */
  readonly title?: string
}

/** One entry in view mode: headline, secondary line, list values, enrichment badge. */
function EntryView({ entry }: { readonly entry: CareerEntry }) {
  const fields = entryFields(entry)
  const textFields = fields.filter(f => f.kind === 'text')
  const listFields = fields.filter(f => f.kind === 'list')
  const headline = entryTitle(entry)
  const secondary = textFields
    .map(f => getText(entry.rawData, f.key))
    .filter(v => v.length > 0 && v !== headline)
    .join(' · ')
  const enriched = entry.enrichmentStatus === 'complete' && entry.enrichedData !== null

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{headline}</p>
        {enriched && (
          <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/25">
            AI enriched
          </span>
        )}
      </div>
      {secondary.length > 0 && <p className="mt-0.5 truncate text-xs text-zinc-500">{secondary}</p>}
      {listFields.map(f => {
        const items = getList(entry.rawData, f.key)
        if (items.length === 0) return null
        if (entry.entryType === 'skill') {
          return (
            <div key={f.key} className="mt-2 flex flex-wrap gap-1.5">
              {items.map(item => (
                <span key={item} className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                  {item}
                </span>
              ))}
            </div>
          )
        }
        return (
          <ul key={f.key} className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {items.map(item => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-600" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )
      })}
    </div>
  )
}

export function CareerEntriesModal({ open, onClose, entryIds, title }: CareerEntriesModalProps) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: adminKeys.resumeImports.entries(),
    queryFn:  () => listCareerEntriesFn({ data: {} }),
    enabled:  open,
  })

  const idSet = entryIds ? new Set(entryIds) : null
  const scoped = idSet ? entries.filter(e => idSet.has(e.id)) : entries
  const groups = GROUP_ORDER
    .map(type => ({ type, ...GROUP_META[type], items: scoped.filter(e => e.entryType === type) }))
    .filter(group => group.items.length > 0)

  return (
    <Dialog open={open} onClose={onClose} className="relative z-30">
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div className="fixed inset-0 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
        <DialogPanel className="flex w-full flex-col overflow-hidden bg-white dark:bg-zinc-900 sm:max-h-[85vh] sm:max-w-2xl sm:rounded-md sm:border sm:border-zinc-200 sm:shadow-xl dark:sm:border-white/10">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-white/10">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Career data
              </DialogTitle>
              {title && <p className="mt-0.5 truncate text-xs text-zinc-500">{title}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {isLoading && <p className="py-8 text-center text-sm text-zinc-500">Loading career data…</p>}

            {!isLoading && scoped.length === 0 && (
              <p className="py-8 text-center text-sm text-zinc-500">No entries extracted yet</p>
            )}

            {groups.map(group => (
              <section key={group.type}>
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  <group.icon className="size-3.5" aria-hidden /> {group.label}
                  <span className="tabular-nums text-zinc-300 dark:text-zinc-600">· {group.items.length}</span>
                </h3>
                <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-white/10 dark:border-white/10">
                  {group.items.map(entry => (
                    <li key={entry.id} data-entry-id={entry.id} className="flex items-start gap-3 px-4 py-3">
                      <EntryView entry={entry} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="flex items-start gap-2 border-t border-zinc-200 px-5 py-3 text-[11px] leading-relaxed text-zinc-500 dark:border-white/10">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {CAVEAT}
          </p>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/__tests__/features/career-data/career-entries-modal.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Full gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/features/career-data/components/CareerEntriesModal.tsx src/__tests__/features/career-data/career-entries-modal.test.tsx
git commit -m "feat(career-data): career entries modal view mode" -m "- Added the CareerEntriesModal dialog: entries grouped by type
(experience, education, skills, other), import-scoped via
entryIds, AI-enriched badges, empty state, and the embeddings
caveat footer — the first UI that shows WHAT a resume upload
actually extracted rather than just counts."
```

---

### Task 4: Edit + delete flows

**Files:**

- Create: `src/features/career-data/components/EntryEditForm.tsx`
- Modify: `src/features/career-data/components/CareerEntriesModal.tsx` (per-entry Edit/Delete actions, edit-mode swap, delete confirmation + mutations)
- Test: `src/__tests__/features/career-data/career-entries-modal.test.tsx` (extend)

**Interfaces:**

- Consumes: `buildDefaults`, `entryFields`, `mergeFormValues`, `entryTitle` (Task 2); `updateCareerEntryFn`, `deleteCareerEntryFn` (existing + Task 2); `ConfirmModal` from `@/components/ui/ConfirmModal` (Task 1).
- Produces: `EntryEditForm({ entry, onSave, onCancel, busy })` where `onSave(rawData: Record<string, unknown>): void`.

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe` file (new `describe` block; `userEvent` via `fireEvent` from Testing Library keeps deps unchanged):

```tsx
import { fireEvent, waitFor } from '@testing-library/react'

describe('CareerEntriesModal — edit and delete', () => {
  it('saves an edited experience with merged rawData and exits edit mode', async () => {
    updateMock.mockResolvedValue({ entry: ENTRIES[0] })
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Senior DevOps Engineer' }))

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'Staff Engineer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { data: { id: string; rawData: Record<string, unknown> } }
    expect(payload.data.id).toBe('exp-1')
    expect(payload.data.rawData['title']).toBe('Staff Engineer')
    expect(payload.data.rawData['highlights']).toEqual(['Led EKS migration']) // unmanaged-by-this-edit list preserved
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull())
  })

  it('cancel leaves the entry unchanged and calls no mutation', async () => {
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Senior DevOps Engineer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(updateMock).not.toHaveBeenCalled()
    expect(screen.getByText('Senior DevOps Engineer')).toBeTruthy()
  })

  it('deletes an entry only after confirmation', async () => {
    deleteMock.mockResolvedValue({ deleted: true })
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete BSc Computer Science' }))
    expect(deleteMock).not.toHaveBeenCalled() // confirm gate
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1))
    const payload = deleteMock.mock.calls[0][0] as { data: { id: string } }
    expect(payload.data.id).toBe('edu-1')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test src/__tests__/features/career-data/career-entries-modal.test.tsx`
Expected: FAIL — no `Edit …`/`Delete …` buttons exist yet.

- [ ] **Step 3: Implement `EntryEditForm`**

Create `src/features/career-data/components/EntryEditForm.tsx` (the `form.Field mode="array"` idiom copied from `src/features/resumes/components/ResumeForm.tsx:317-375`):

```tsx
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
```

Note for the implementer: if `@/components/ui/Button` has different variant names, check its props (`rg -n "variant" src/components/ui/Button.tsx`) and use the closest primary/ghost equivalents — the repo's Button is the source of truth.

- [ ] **Step 4: Wire edit/delete into `CareerEntriesModal`**

Modify `CareerEntriesModal.tsx`:

Add imports:

```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { updateCareerEntryFn, deleteCareerEntryFn } from '@/server/resume-imports'
import { EntryEditForm } from './EntryEditForm'
```

Inside the component add state + mutations (after the query):

```tsx
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<CareerEntry | null>(null)

  const invalidateEntries = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.resumeImports.all })

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; rawData: Record<string, unknown> }) =>
      updateCareerEntryFn({ data: input }),
    onSuccess: async () => {
      setEditingId(null)
      await invalidateEntries()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCareerEntryFn({ data: { id } }),
    onSuccess: async () => {
      setDeleting(null)
      await invalidateEntries()
    },
  })
```

Replace the entry `<li>` body so each row is either the edit form or the view + actions (guard clauses, no nested ternaries):

```tsx
                  {group.items.map(entry => {
                    const isEditing = editingId === entry.id
                    return (
                      <li key={entry.id} data-entry-id={entry.id} className="flex items-start gap-3 px-4 py-3">
                        {isEditing ? (
                          <EntryEditForm
                            entry={entry}
                            busy={updateMutation.isPending}
                            onCancel={() => setEditingId(null)}
                            onSave={(rawData) => updateMutation.mutate({ id: entry.id, rawData })}
                          />
                        ) : (
                          <>
                            <EntryView entry={entry} />
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Edit ${entryTitle(entry)}`}
                                onClick={() => setEditingId(entry.id)}
                                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/5 dark:hover:text-zinc-200"
                              >
                                <Pencil className="size-3.5" aria-hidden />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${entryTitle(entry)}`}
                                onClick={() => setDeleting(entry)}
                                className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    )
                  })}
```

Mount the confirmation dialog before the closing `</Dialog>`:

```tsx
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deleteMutation.mutate(deleting.id) }}
        title="Delete this entry?"
        body={`"${deleting ? entryTitle(deleting) : ''}" and its knowledge-base embeddings will be removed. This cannot be undone.`}
        confirmLabel="Delete entry"
        destructive
        busy={deleteMutation.isPending}
      />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn test src/__tests__/features/career-data/career-entries-modal.test.tsx`
Expected: PASS (7 tests). If the nested-Dialog confirm button is not found, render order is the issue — `ConfirmModal` must be INSIDE the outer `Dialog` (Headless UI nests dialogs correctly when mounted within the open one).

- [ ] **Step 6: Full gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/features/career-data/components/EntryEditForm.tsx src/features/career-data/components/CareerEntriesModal.tsx src/__tests__/features/career-data/career-entries-modal.test.tsx
git commit -m "feat(career-data): edit and delete career entries" -m "- Added structured in-place editing per entry type (TanStack Form
array fields for highlights/skills, text inputs for scalars) that
merges into rawData preserving unmanaged keys, plus confirm-gated
deletion via the promoted ConfirmModal — fulfilling the onboarding
promise that entries are editable after import."
```

---

### Task 5: Triggers — settings uploaded-files rows + Career Data panel

**Files:**

- Modify: `src/app/_dashboard.settings.github.tsx` (rows at lines ~144-177: add a "View data" action per row + one modal mount; trivial touch, no route migration — documented in the spec)
- Modify: `src/features/user-home/components/CareerDataBreakdown.tsx` (header gains a "View data" button + modal mount; the "View imports →" link stays)
- Test: `src/__tests__/features/career-data/career-data-triggers.test.tsx` (create)

**Interfaces:**

- Consumes: `CareerEntriesModal` (Tasks 3-4); `ResumeImportRecord.careerEntriesCreated: string[]` and `.originalFilename` (existing type).
- Produces: user-visible entry points; no new exports.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/features/career-data/career-data-triggers.test.tsx`:

```tsx
/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}))

const listMock = vi.fn()
vi.mock('@/server/resume-imports', () => ({
  listCareerEntriesFn: (...args: unknown[]) => listMock(...args),
  updateCareerEntryFn: vi.fn(),
  deleteCareerEntryFn: vi.fn(),
}))

import { CareerDataBreakdown } from '@/features/user-home/components/CareerDataBreakdown'
import type { CareerEntry } from '@/server/resume-imports'

const ENTRY = {
  id: 'exp-1', entryType: 'experience',
  rawData: { title: 'Senior DevOps Engineer', company: 'Acme', period: '2023', highlights: [] },
  enrichedData: null, enrichmentStatus: 'skipped', displayOrder: 0, createdAt: '2026-05-29T00:00:00.000Z',
} as CareerEntry

beforeEach(() => {
  vi.clearAllMocks()
  listMock.mockResolvedValue([ENTRY])
})

describe('CareerDataBreakdown trigger', () => {
  it('opens the career entries modal from the panel header', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CareerDataBreakdown entries={[ENTRY]} latestImport={undefined} isLoading={false} />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View data' }))
    expect(await screen.findByText('Career data')).toBeTruthy()
    expect(await screen.findByText('Senior DevOps Engineer')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test src/__tests__/features/career-data/career-data-triggers.test.tsx`
Expected: FAIL — no "View data" button in `CareerDataBreakdown`.

- [ ] **Step 3: Add the Career Data panel trigger**

In `src/features/user-home/components/CareerDataBreakdown.tsx`:

- Add imports: `import { useState } from 'react'` and `import { CareerEntriesModal } from '@/features/career-data/components/CareerEntriesModal'`.
- `PanelShell` currently renders the header link; the state must live in the exported component, so move the header actions into `CareerDataBreakdown` by giving `PanelShell` an `actions` slot:

```tsx
function PanelShell({ actions, children }: { readonly actions?: React.ReactNode; readonly children: React.ReactNode }) {
  return (
    <Card as="section" className="flex h-full max-h-64 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-white/5">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Career Data</h3>
        <div className="flex items-center gap-3">{actions}</div>
      </div>
      {children}
    </Card>
  )
}
```

- In `CareerDataBreakdown`, add state and the shared actions node, pass `actions` to every `PanelShell` usage (loading, empty, and data states all get the same actions; the modal mounts once, outside the conditional returns is NOT possible with early returns — so mount it inside the final return AND keep the button only meaningful there; for the loading/empty states pass only the existing link):

```tsx
export function CareerDataBreakdown({ entries, latestImport, isLoading }: CareerDataBreakdownProps) {
  const [modalOpen, setModalOpen] = useState(false)
  // …existing counts/rows/max/status logic unchanged…

  const viewImportsLink = (
    <Link
      to="/settings/github"
      search={{ tab: 'resumes' }}
      className="text-xs text-accent transition-opacity hover:opacity-80"
    >
      View imports →
    </Link>
  )
```

Loading and empty branches: `return <PanelShell actions={viewImportsLink}>…existing content…</PanelShell>` (unchanged content). Final (data) return:

```tsx
  return (
    <PanelShell
      actions={
        <>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-xs text-accent transition-opacity hover:opacity-80"
          >
            View data
          </button>
          {viewImportsLink}
        </>
      }
    >
      {/* …existing dl rows + latestImport footer, unchanged… */}
      <CareerEntriesModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </PanelShell>
  )
```

- [ ] **Step 4: Add the settings uploaded-files trigger**

In `src/app/_dashboard.settings.github.tsx`:

- Add imports at the top of the file:

```tsx
import { CareerEntriesModal } from '@/features/career-data/components/CareerEntriesModal'
```

- In the settings component (the one containing the `tab === 'resumes'` block), add state next to the existing `addingResume`/`resumeImportId` state:

```tsx
  const [viewingImport, setViewingImport] = useState<{ entryIds: string[]; title: string } | null>(null)
```

- In each uploaded-file `<li>` (lines ~151-174), insert a "View data" button between the text block and the status badge:

```tsx
                            <button
                              type="button"
                              disabled={imp.careerEntriesCreated.length === 0}
                              onClick={() => setViewingImport({
                                entryIds: imp.careerEntriesCreated,
                                title: imp.originalFilename,
                              })}
                              className="shrink-0 text-xs text-teal-400 transition-colors hover:text-teal-300 disabled:cursor-not-allowed disabled:text-zinc-600"
                            >
                              View data
                            </button>
```

(The dark-only palette matches this route's existing styling — see the neighbouring "Upload your first resume →" button.)

- Mount the modal once, directly after the uploaded-files `</div>` block (inside the `tab === 'resumes'` fragment):

```tsx
                <CareerEntriesModal
                  open={viewingImport !== null}
                  onClose={() => setViewingImport(null)}
                  entryIds={viewingImport?.entryIds}
                  title={viewingImport?.title}
                />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn test src/__tests__/features/career-data/career-data-triggers.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 6: Full gate**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all green (settings route has no dedicated test; typecheck covers the wiring).

- [ ] **Step 7: Commit**

```bash
git add src/app/_dashboard.settings.github.tsx src/features/user-home/components/CareerDataBreakdown.tsx src/__tests__/features/career-data/career-data-triggers.test.tsx
git commit -m "feat(career-data): modal triggers on settings and panel" -m "- Wired the career entries modal into both surfaces: each
uploaded-file row on the Database page opens it scoped to that
import's extracted entries (disabled until entries exist), and
the dashboard Career Data panel opens it unscoped alongside the
existing View-imports navigation."
```

---

### Task 6: End-to-end verification (live data)

**Files:**

- No code changes expected; fix-forward only.

**Interfaces:**

- Consumes: running dev stack — `yarn dev` on port 5001 in THIS worktree (stop any dev server bound to 5001 from another worktree first) + the admin-api port-forward (`kubectl port-forward svc/admin-api 3002:3002 -n admin-api`, PATH needs `/opt/homebrew/bin`).

- [ ] **Step 1: Stack up**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5001/` and `curl -s http://localhost:3002/healthz`
Expected: `200` and `{"status":"ok",...}`. Start whichever is down.

- [ ] **Step 2: Manual verification against the real uploaded resume**

- `/settings/github?tab=resumes`: the "Nelson_Lamounier_Resume.pdf · 3 entries extracted" row shows "View data"; clicking opens the modal scoped to that import; entries match the extraction; a processing/failed import's button is disabled.
- Dashboard Career Data panel: "View data" opens the unscoped modal; counts in the panel match the modal's group counts.
- Edit an experience entry (change title, add a highlight, remove one) → save → modal and panel counts refresh; reopen to confirm persistence (round-trip through the real admin-api + RDS).
- Delete a low-value entry ONLY if the user agrees — deletion mutates real data and removes embeddings; otherwise verify the confirm dialog opens and Cancel is a no-op.
- Responsive: modal is a full-screen sheet on a narrow window (~375px and ~320px), internal scroll works, no horizontal scrollbar; chips/highlights wrap.
- Both themes; Escape closes; focus lands inside the dialog on open.

- [ ] **Step 3: Full gate + report**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: green. Report results (with any visual observations) before PR.

---

## Self-Review Notes

- Spec coverage: modal + scoping (Task 3), structured per-type forms with generic fallback + merge semantics (Tasks 2, 4), delete behind ConfirmModal + new server fn (Tasks 1, 2, 4), both triggers incl. disabled state and no-route-migration note (Task 5), caveat footer verbatim (Task 3), responsiveness/accessibility (Task 3 shell + Task 6 checks), testing section (Tasks 2-5 tests + Task 6 manual).
- Type consistency: `EntryFieldDef`/`entryFields`/`buildDefaults`/`mergeFormValues`/`entryTitle` signatures identical across Tasks 2-4; `CareerEntriesModalProps` identical across Tasks 3-5; mocks in both test files list all three server fns so the module mock never misses an export.
- The `form.Field mode="array"` idiom is copied from the repo's own `ResumeForm.tsx` (verified usage), not from memory.
- Known judgement calls: `ConfirmModal` moved verbatim (no restyle); settings route touch kept trivial to avoid the flat-route migration; generic fallback keeps non-string rawData keys read-only but preserved.
