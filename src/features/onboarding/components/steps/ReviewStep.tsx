'use client'

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Briefcase,
  GraduationCap,
  Wrench,
  Award,
  Sparkles,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { useProfileSummary } from '@/features/profile/hooks/use-profile-summary'
import { DiagnosticPanel } from '@/features/profile/components/DiagnosticPanel'
import { adminKeys } from '@/lib/api/query-keys'
import {
  getImportProgressFn,
  getGapReportFn,
  listCareerEntriesFn,
  updateCareerEntryFn,
} from '@/server/resume-imports'
import type { CareerEntry } from '@/server/resume-imports'
import { EnhanceRoleCard } from './EnhanceRoleCard'
import { GapAnalysisReport } from './GapAnalysisReport'

type SubPhase = 'review' | 'enhance' | 'saved'

interface ReviewStepProps {
  readonly importId?: string
  /** Overrides the default "navigate to /overview" finish action. */
  readonly onFinish?: () => void
}

// ────────────────────────────────────────────────────────────────────────────
// Presentational primitives — match TailwindPlus dark-theme idioms (inset-ring,
// divide-white/5, hairline section headers). Kept local so the file stays
// self-contained without leaking a half-baked design system.
// ────────────────────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  readonly icon: React.ComponentType<{ className?: string }>
  readonly title: string
  readonly count?: number
}) {
  return (
    <div className="flex items-center gap-2 px-5 pt-4 pb-2">
      <span className="flex size-6 items-center justify-center rounded-md bg-white/5 text-zinc-400 inset-ring inset-ring-white/10">
        <Icon className="size-3.5" />
      </span>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
        {title}
      </h4>
      {typeof count === 'number' && (
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-400 inset-ring inset-ring-white/10">
          {count}
        </span>
      )}
    </div>
  )
}

function Panel({ children }: { readonly children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white/2 inset-ring inset-ring-white/10">
      {children}
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function ReviewStep({ importId, onFinish }: ReviewStepProps) {
  const navigate                  = useNavigate()
  const queryClient               = useQueryClient()
  const [sub, setSub]             = useState<SubPhase>('review')
  const { data: profileSummary }  = useProfileSummary()

  const finish = onFinish ?? (() => void navigate({ to: '/overview', replace: true }))

  const { data: progress } = useQuery({
    queryKey: adminKeys.resumeImports.progress(importId ?? ''),
    queryFn:  () => getImportProgressFn({ data: importId as string }),
    enabled:  !!importId,
    // Poll until the gap report is ready, then stop — covers the Settings
    // path where ReviewStep mounts before gapReportReady flips true.
    refetchInterval: (query) => (query.state.data?.gapReportReady ? false : 4000),
  })

  const { data: entries = [] } = useQuery<CareerEntry[]>({
    queryKey:  adminKeys.resumeImports.entries(),
    queryFn:   () => listCareerEntriesFn({ data: {} }),
    enabled:   !!importId && sub === 'review',
    staleTime: Infinity,
  })

  const { data: gapReport = null } = useQuery({
    queryKey:  adminKeys.resumeImports.gapReport(importId ?? ''),
    queryFn:   () => getGapReportFn({ data: importId as string }),
    enabled:   !!importId && sub === 'review' && progress?.gapReportReady === true,
    staleTime: Infinity,
  })

  const { data: enhancedEntries = [] } = useQuery<CareerEntry[]>({
    queryKey: adminKeys.resumeImports.entries('enhance'),
    queryFn:  () => listCareerEntriesFn({ data: {} }),
    enabled:  !!importId && sub === 'enhance',
    refetchInterval: (query) => {
      const all = query.state.data ?? []
      const experienceEntries = all.filter((e: CareerEntry) => e.entryType === 'experience')
      const allTerminal =
        experienceEntries.length > 0 &&
        experienceEntries.every((e: CareerEntry) =>
          ['complete', 'skipped', 'failed'].includes(e.enrichmentStatus),
        )
      return allTerminal ? false : 3_000
    },
  })

  async function handleSaveEntry(id: string, highlights: string[]) {
    const entry = enhancedEntries.find((e) => e.id === id)
    if (!entry) return
    const rawData = { ...(entry.rawData as Record<string, unknown>), highlights }
    await updateCareerEntryFn({ data: { id, rawData } })
    await queryClient.invalidateQueries({ queryKey: adminKeys.resumeImports.entries() })
    await queryClient.invalidateQueries({ queryKey: adminKeys.resumeImports.entries('enhance') })
  }

  // ── No-import: user skipped Step 3 ─────────────────────────────────────────
  if (!importId) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-emerald-400/10 inset-ring inset-ring-emerald-400/30">
            <CheckCircle2 className="size-6 text-emerald-300" />
          </span>
          <h3 className="text-base font-semibold text-zinc-100">You're all set</h3>
          <p className="max-w-sm text-sm text-zinc-500">
            Your workspace is ready. Import your career history any time from your profile.
          </p>
          <Button variant="primary" onClick={finish} className="mt-3 flex items-center gap-1.5">
            Finish
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </Panel>
    )
  }

  const experienceEntries = entries.filter((e: CareerEntry) => e.entryType === 'experience')
  const educationEntries  = entries.filter((e: CareerEntry) => e.entryType === 'education')
  const skillEntries      = entries.filter((e: CareerEntry) => e.entryType === 'skill')
  const otherCount        = entries.filter((e: CareerEntry) =>
    !['experience', 'education', 'skill'].includes(e.entryType)
  ).length

  // ── Saved: terminal success state ──────────────────────────────────────────
  if (sub === 'saved') {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-emerald-400/10 inset-ring inset-ring-emerald-400/30">
            <CheckCircle2 className="size-6 text-emerald-300" />
          </span>
          <h3 className="text-base font-semibold text-zinc-100">Career history imported</h3>
          <p className="max-w-sm text-sm text-zinc-500">
            {experienceEntries.length} role{experienceEntries.length !== 1 ? 's' : ''} extracted.
            Enrichment continues in the background.
          </p>
          <Button variant="primary" onClick={finish} className="mt-3 flex items-center gap-1.5">
            Finish
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </Panel>
    )
  }

  // ── Enhance sub-view ───────────────────────────────────────────────────────
  if (sub === 'enhance') {
    const enhanceExperience = enhancedEntries.filter(
      (e: CareerEntry) => e.entryType === 'experience',
    )
    const allTerminal =
      enhanceExperience.length > 0 &&
      enhanceExperience.every((e: CareerEntry) =>
        ['complete', 'skipped', 'failed'].includes(e.enrichmentStatus),
      )

    return (
      <div className="space-y-5">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-400/10 text-indigo-300 inset-ring inset-ring-indigo-400/30">
                  <Sparkles className="size-4" />
                </span>
                <h3 className="text-base font-semibold text-zinc-100">Enhance your experience</h3>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                We researched each role online. Review the suggestions, edit your highlights,
                and save — or skip to keep them as extracted.
              </p>
            </div>
            {!allTerminal && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-400/10 px-2.5 py-1 text-[11px] font-medium text-indigo-300 inset-ring inset-ring-indigo-400/30">
                <Loader2 className="size-3 animate-spin" />
                Researching…
              </span>
            )}
          </div>
        </Panel>

        <div className="max-h-110 space-y-3 overflow-y-auto pr-1">
          {enhanceExperience.length === 0 ? (
            <Panel>
              <p className="px-6 py-10 text-center text-sm text-zinc-500">
                No experience entries found.
              </p>
            </Panel>
          ) : (
            enhanceExperience.map((entry: CareerEntry) => (
              <EnhanceRoleCard
                key={entry.id}
                entry={entry}
                onSave={handleSaveEntry}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-3">
          <Button
            variant="ghost"
            onClick={() => setSub('review')}
            className="text-xs"
          >
            ← Back to review
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setSub('saved')}
              className="text-xs"
            >
              Skip enhancement
            </Button>
            <Button
              variant="primary"
              onClick={() => setSub('saved')}
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

  // ── Review sub-view (default) ──────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {profileSummary ? (
        <DiagnosticPanel summary={profileSummary} />
      ) : (
        <Panel>
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            Generating your readiness diagnostic…
          </p>
        </Panel>
      )}

      <div className="px-1">
        <h3 className="text-base font-semibold text-zinc-100">Review extracted career history</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Tucaken extracted the following from your resume. Edit individual entries any time from
          your profile.
        </p>
      </div>

      <GapAnalysisReport report={gapReport} />

      <div className="max-h-115 space-y-4 overflow-y-auto pr-1">
        {experienceEntries.length > 0 && (
          <Panel>
            <SectionHeader icon={Briefcase} title="Experience" count={experienceEntries.length} />
            <ul role="list" className="divide-y divide-white/5">
              {experienceEntries.map((entry) => {
                const d = entry.rawData as { title?: string; company?: string; period?: string; highlights?: string[] }
                const enriched = entry.enrichmentStatus === 'complete' && entry.enrichedData
                return (
                  <li key={entry.id} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {d.title ?? '—'}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {d.company ?? ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {enriched && (
                          <span className="rounded-full bg-indigo-400/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300 inset-ring inset-ring-indigo-400/30">
                            AI enriched
                          </span>
                        )}
                        <span className="whitespace-nowrap text-[11px] text-zinc-500">
                          {d.period ?? ''}
                        </span>
                      </div>
                    </div>
                    {Array.isArray(d.highlights) && d.highlights.length > 0 && (
                      <ul className="mt-2.5 space-y-1 text-xs text-zinc-400">
                        {d.highlights.slice(0, 2).map((h, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-zinc-600" aria-hidden />
                            <span className="truncate">{h}</span>
                          </li>
                        ))}
                        {d.highlights.length > 2 && (
                          <li className="pl-3 text-[11px] text-zinc-600">
                            +{d.highlights.length - 2} more
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>
        )}

        {educationEntries.length > 0 && (
          <Panel>
            <SectionHeader icon={GraduationCap} title="Education" count={educationEntries.length} />
            <ul role="list" className="divide-y divide-white/5">
              {educationEntries.map((entry) => {
                const d = entry.rawData as { degree?: string; institution?: string; period?: string }
                return (
                  <li key={entry.id} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">{d.degree ?? '—'}</p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">{d.institution ?? ''}</p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-[11px] text-zinc-500">
                        {d.period ?? ''}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>
        )}

        {skillEntries.length > 0 && (
          <Panel>
            <SectionHeader icon={Wrench} title="Skills" />
            <div className="flex flex-wrap gap-1.5 px-5 pt-1 pb-5">
              {skillEntries.flatMap((entry) => {
                const d = entry.rawData as { skills?: string[] }
                return d.skills ?? []
              }).slice(0, 20).map((skill, i) => (
                <span
                  key={i}
                  className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-zinc-300 inset-ring inset-ring-white/10"
                >
                  {skill}
                </span>
              ))}
            </div>
          </Panel>
        )}

        {otherCount > 0 && (
          <div className="flex items-center gap-2 px-1 text-xs text-zinc-500">
            <Award className="size-3.5" />
            {otherCount} additional entr{otherCount === 1 ? 'y' : 'ies'} extracted (certifications,
            projects, achievements)
          </div>
        )}

        {entries.length === 0 && (
          <Panel>
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-zinc-400">No entries extracted yet.</p>
              <p className="mt-1 text-xs text-zinc-500">Enrichment may still be running.</p>
            </div>
          </Panel>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 pt-3">
        <Button variant="ghost" onClick={finish} className="text-xs">
          Skip for now
        </Button>
        <Button
          variant="primary"
          onClick={() => setSub('enhance')}
          className="flex items-center gap-1.5"
        >
          Looks good
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
