# Gap Analysis — Guided Role Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Tavily-enriched role data as an editable guided-enhancement phase inside `ImportCareerStep`, reachable from both the onboarding wizard and `/settings/github`.

**Architecture:** Extend `ImportCareerStep`'s state machine with an `enhance` phase that polls career entries for enrichment completion and renders one `EnhanceRoleCard` per experience entry. Each card pre-fills editable textareas with web-researched responsibilities; saves hit a new `updateCareerEntryFn` server function wrapping the existing `PUT /career-entries/:id` admin-api route. `OnboardingShell` swaps `ResumeStep` for `ImportCareerStep` so both surfaces share one implementation.

**Tech Stack:** React, TanStack Query, TanStack Start server functions, Zod, Tailwind CSS, Lucide icons, TypeScript

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/server/resume-imports.ts` | Modify | Add `updateCareerEntryFn` |
| `src/features/onboarding/components/steps/EnhanceRoleCard.tsx` | Create | Per-role editable card with suggestion chips |
| `src/features/onboarding/components/steps/ImportCareerStep.tsx` | Modify | Add `enhance` phase + wire `EnhanceRoleCard` |
| `src/features/onboarding/components/onboarding/OnboardingShell.tsx` | Modify | Swap `ResumeStep` → `ImportCareerStep` |

---

## Task 1: Add `updateCareerEntryFn` server function

**Files:**
- Modify: `src/server/resume-imports.ts`

- [ ] **Step 1.1: Add the server function**

Open `src/server/resume-imports.ts`. After the `listCareerEntriesFn` block (around line 166), add:

```ts
/**
 * Update raw_data for a career entry (user editing extracted highlights).
 */
export const updateCareerEntryFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id:      z.string().uuid(),
      rawData: z.record(z.string(), z.unknown()),
    }),
  )
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ entry: CareerEntry }>(
      `/resume-imports/career-entries/${data.id}`,
      {
        method:       'PUT',
        body:         JSON.stringify({ rawData: data.rawData }),
        pathTemplate: '/resume-imports/career-entries/:id',
      },
    )
  })
```

- [ ] **Step 1.2: Typecheck**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
yarn typecheck 2>&1 | grep -E "error|resume-imports"
```

Expected: no errors in `src/server/resume-imports.ts`.

- [ ] **Step 1.3: Commit**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
git add src/server/resume-imports.ts
git commit -m "feat(resume-import): add updateCareerEntryFn server function"
```

---

## Task 2: Create `EnhanceRoleCard` component

**Files:**
- Create: `src/features/onboarding/components/steps/EnhanceRoleCard.tsx`

- [ ] **Step 2.1: Create the file**

Create `src/features/onboarding/components/steps/EnhanceRoleCard.tsx` with this full content:

```tsx
import { useState, useEffect } from 'react'
import { Loader2, X, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
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

  const [fields, setFields]       = useState<string[]>(raw.highlights ?? [])
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [initialized, setInitialized] = useState(false)

  // When enrichment resolves, merge suggestions into editable fields once.
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
  }, [entry.enrichmentStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading     = !isTerminal(entry.enrichmentStatus)
  const isUnavailable = entry.enrichmentStatus === 'skipped' || entry.enrichmentStatus === 'failed'

  // Chips = web-researched items not yet present in editable fields
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
    } finally {
      setSaving(false)
    }
  }

  // ── Loading (enrichment still in progress) ────────────────────────────────
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

  // ── Enriched / skipped / failed ───────────────────────────────────────────
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4 space-y-3">
      {/* Header */}
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

      {/* Editable highlight fields */}
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

      {/* Suggestion chips */}
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

      {/* Save */}
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
```

- [ ] **Step 2.2: Typecheck**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
yarn typecheck 2>&1 | grep -E "error|EnhanceRoleCard"
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
git add src/features/onboarding/components/steps/EnhanceRoleCard.tsx
git commit -m "feat(resume-import): add EnhanceRoleCard component"
```

---

## Task 3: Add `enhance` phase to `ImportCareerStep`

**Files:**
- Modify: `src/features/onboarding/components/steps/ImportCareerStep.tsx`

- [ ] **Step 3.1: Add imports at the top of the file**

After the existing imports block, add:

```ts
import { EnhanceRoleCard } from './EnhanceRoleCard'
import { updateCareerEntryFn } from '../../../../server/resume-imports'
import { useQueryClient } from '@tanstack/react-query'
```

`useQueryClient` is needed to invalidate the entries query after a save.

- [ ] **Step 3.2: Extend the `Phase` type**

Find:
```ts
type Phase =
  | 'idle'
  | 'requesting-url'
  | 'uploading'
  | 'processing'
  | 'review'
  | 'saved'
  | 'error'
```

Replace with:
```ts
type Phase =
  | 'idle'
  | 'requesting-url'
  | 'uploading'
  | 'processing'
  | 'review'
  | 'enhance'
  | 'saved'
  | 'error'
```

- [ ] **Step 3.3: Add `useQueryClient` inside the component**

At the top of the `ImportCareerStep` function body, after the existing `useState` declarations, add:

```ts
const queryClient = useQueryClient()
```

- [ ] **Step 3.4: Add the enhance-phase polling query**

After the existing `entries` query block (the one with `enabled: phase === 'review'`), add:

```ts
// ── Enhanced entries — polled in enhance phase until all experience entries
// reach a terminal enrichment status ──────────────────────────────────────
const { data: enhancedEntries = [] } = useQuery<CareerEntry[]>({
  queryKey: adminKeys.resumeImports.entries('enhance'),
  queryFn:  () => listCareerEntriesFn({ data: {} }),
  enabled:  phase === 'enhance',
  refetchInterval: (query) => {
    const all = query.state.data ?? []
    const experienceEntries = all.filter((e: CareerEntry) => e.entryType === 'experience')
    const allTerminal = experienceEntries.every((e: CareerEntry) =>
      ['complete', 'skipped', 'failed'].includes(e.enrichmentStatus),
    )
    return allTerminal ? false : 3_000
  },
})
```

- [ ] **Step 3.5: Add `handleSaveEntry` function**

After the `handleRetry` function, add:

```ts
async function handleSaveEntry(id: string, highlights: string[]) {
  const entry = enhancedEntries.find((e) => e.id === id)
  if (!entry) return
  const rawData = { ...(entry.rawData as Record<string, unknown>), highlights }
  await updateCareerEntryFn({ data: { id, rawData } })
  // Refresh so the updated highlights are reflected if user goes back to review
  await queryClient.invalidateQueries({ queryKey: adminKeys.resumeImports.entries() })
}
```

- [ ] **Step 3.6: Change "Looks good" button to enter enhance phase**

In the `// ── review` section, find the "Looks good" Button's `onClick`:

```ts
onClick={() => { setPhase('saved'); setTimeout(onNext, 800) }}
```

Replace with:

```ts
onClick={() => setPhase('enhance')}
```

- [ ] **Step 3.7: Add the enhance phase render block**

Add this block immediately before the `// ── review` comment:

```tsx
if (phase === 'enhance') {
  const experienceEntries = enhancedEntries.filter(
    (e: CareerEntry) => e.entryType === 'experience',
  )
  const allTerminal = experienceEntries.every((e: CareerEntry) =>
    ['complete', 'skipped', 'failed'].includes(e.enrichmentStatus),
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Enhance your experience</h3>
        <p className="mt-1 text-sm text-zinc-500">
          We researched each role online. Review the suggestions, edit your highlights,
          and save — or skip to keep them as extracted.
        </p>
        {!allTerminal && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-indigo-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Researching remaining roles…
          </p>
        )}
      </div>

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {experienceEntries.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">
            No experience entries found.
          </div>
        ) : (
          experienceEntries.map((entry: CareerEntry) => (
            <EnhanceRoleCard
              key={entry.id}
              entry={entry}
              onSave={handleSaveEntry}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <Button
          variant="ghost"
          onClick={() => setPhase('review')}
          className="text-xs"
        >
          ← Back to review
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => { setPhase('saved'); setTimeout(onNext, 800) }}
            className="text-xs"
          >
            Skip enhancement
          </Button>
          <Button
            variant="primary"
            onClick={() => { setPhase('saved'); setTimeout(onNext, 800) }}
            className="flex items-center gap-1.5"
          >
            Save &amp; continue
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3.8: Typecheck**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
yarn typecheck 2>&1 | grep -E "error|ImportCareerStep"
```

Expected: no errors.

- [ ] **Step 3.9: Commit**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
git add src/features/onboarding/components/steps/ImportCareerStep.tsx
git commit -m "feat(resume-import): add enhance phase with guided role editing"
```

---

## Task 4: Update `OnboardingShell` to use `ImportCareerStep`

**Files:**
- Modify: `src/features/onboarding/components/onboarding/OnboardingShell.tsx`

- [ ] **Step 4.1: Swap the import**

In `OnboardingShell.tsx`, find:

```ts
import { ResumeStep } from './ResumeStep'
```

Replace with:

```ts
import { ImportCareerStep } from '../steps/ImportCareerStep'
```

- [ ] **Step 4.2: Remove the resume upload wrapper**

Find and remove the entire `handleResumeUpload` function and the `resumeStatus` / `setResumeStatus` state:

```ts
// REMOVE these lines:
const [resumeStatus, setResumeStatus] = useState<string | undefined>(undefined)

async function handleResumeUpload(file: File): Promise<ResumeSummary> {
  if (onUploadResume) {
    const result = await onUploadResume(file, setResumeStatus)
    s.setResume(file.name, result)
    return result
  }
  const mock: ResumeSummary = { roles: 4, education: 2, skills: 18 }
  s.setResume(file.name, mock)
  return mock
}
```

- [ ] **Step 4.3: Replace the `ResumeStep` JSX**

Find:
```tsx
<ResumeStep
  initialFileName={s.data.resume?.fileName}
  initialSummary={s.data.resume?.summary}
  statusMessage={resumeStatus}
  onUpload={handleResumeUpload}
  onNext={s.next}
  onSkip={s.next}
  onBack={s.back}
/>
```

Replace with:
```tsx
<ImportCareerStep
  onNext={s.next}
  onSkip={s.next}
/>
```

- [ ] **Step 4.4: Remove unused imports**

Remove any imports that are now unused: `ResumeStep`, `ResumeSummary` (if only used by the wrapper).

- [ ] **Step 4.5: Typecheck**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
yarn typecheck 2>&1 | grep -E "error|OnboardingShell"
```

Expected: no errors.

- [ ] **Step 4.6: Full typecheck pass**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
yarn typecheck 2>&1 | grep "error" | head -20
```

Expected: 0 errors.

- [ ] **Step 4.7: Commit**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
git add src/features/onboarding/components/onboarding/OnboardingShell.tsx
git commit -m "feat(onboarding): replace ResumeStep with ImportCareerStep for full enhance flow"
```

---

## Task 5: Manual smoke test

- [ ] **Step 5.1: Start dev server**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
yarn dev
```

- [ ] **Step 5.2: Onboarding flow**

1. Navigate to `/onboarding`
2. Reach the resume step — confirm `ImportCareerStep` renders (drag-and-drop zone visible)
3. Upload `Nelson_Lamounier_Resume.pdf`
4. Wait for `processing` phase to complete → confirm transition to `review`
5. Click "Looks good" → confirm transition to `enhance` phase
6. Confirm experience entries render (`EnhanceRoleCard` per role)
7. Confirm roles without completed enrichment show spinner + "Researching this role…"
8. Wait for enrichment to complete → confirm suggestion chips appear
9. Click a chip → confirm it appends as an editable textarea field and chip disappears
10. Edit a textarea → click "Save changes" → confirm "Saved" state appears
11. Click "Save & continue" → confirm transition to next onboarding step

- [ ] **Step 5.3: Settings/github flow**

1. Navigate to `/settings/github`
2. Confirm Step 1 ("Import Career") still works end-to-end including the enhance phase
3. No change expected — `ImportCareerStep` is used directly here

- [ ] **Step 5.4: Skip path**

1. Upload a resume and reach the `enhance` phase
2. Click "Skip enhancement" → confirm it moves to the next step without saving
3. Click "← Back to review" from enhance → confirm return to `review` phase

- [ ] **Step 5.5: Error path**

1. With network throttling, confirm save errors show without crashing the card
2. Confirm the card stays editable after a failed save

- [ ] **Step 5.6: Final commit if any fixups were needed**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
git add -p
git commit -m "fix(resume-import): smoke test fixups"
```
