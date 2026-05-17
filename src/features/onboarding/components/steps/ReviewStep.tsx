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
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
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
}

export function ReviewStep({ importId }: ReviewStepProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sub, setSub] = useState<SubPhase>('review')

  const finish = () => void navigate({ to: '/overview', replace: true })

  // Progress is read once to learn whether the gap report is ready.
  const { data: progress } = useQuery({
    queryKey: adminKeys.resumeImports.progress(importId ?? ''),
    queryFn:  () => getImportProgressFn({ data: importId as string }),
    enabled:  !!importId,
    staleTime: Infinity,
  })

  const { data: entries = [] } = useQuery<CareerEntry[]>({
    queryKey: adminKeys.resumeImports.entries(),
    queryFn:  () => listCareerEntriesFn({ data: {} }),
    enabled:  !!importId && sub === 'review',
    staleTime: Infinity,
  })

  const { data: gapReport = null } = useQuery({
    queryKey: adminKeys.resumeImports.gapReport(importId ?? ''),
    queryFn:  () => getGapReportFn({ data: importId as string }),
    enabled:  !!importId && sub === 'review' && progress?.gapReportReady === true,
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

  // No resume was imported (user skipped Step 3) — nothing to review.
  if (!importId) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <p className="text-base font-semibold text-zinc-100">You're all set</p>
        <p className="max-w-sm text-sm text-zinc-500">
          Your workspace is ready. You can import your career history any time from your profile.
        </p>
        <Button variant="primary" onClick={finish} className="mt-2 flex items-center gap-1.5">
          Finish
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  const experienceEntries = entries.filter((e: CareerEntry) => e.entryType === 'experience')
  const educationEntries  = entries.filter((e: CareerEntry) => e.entryType === 'education')
  const skillEntries      = entries.filter((e: CareerEntry) => e.entryType === 'skill')
  const otherCount        = entries.filter((e: CareerEntry) =>
    !['experience', 'education', 'skill'].includes(e.entryType)
  ).length

  if (sub === 'saved') {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <p className="text-sm font-medium text-zinc-200">Career history imported</p>
        <p className="text-xs text-zinc-500">
          {experienceEntries.length} role{experienceEntries.length !== 1 ? 's' : ''} extracted.
          Enrichment continues in the background.
        </p>
        <Button variant="primary" onClick={finish} className="mt-3 flex items-center gap-1.5">
          Finish
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

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
          {enhanceExperience.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">
              No experience entries found.
            </div>
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

        <div className="flex items-center justify-between pt-2 border-t border-white/10">
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Review extracted career history</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Tucaken extracted the following from your resume. You can edit individual entries later from your profile.
        </p>
      </div>

      <GapAnalysisReport report={gapReport} />

      <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">

        {experienceEntries.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Briefcase className="h-3.5 w-3.5" />
              Experience ({experienceEntries.length})
            </h4>
            <div className="space-y-2">
              {experienceEntries.map((entry) => {
                const d = entry.rawData as { title?: string; company?: string; period?: string; highlights?: string[] }
                return (
                  <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">{d.title ?? '—'}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{d.period ?? ''}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">{d.company ?? ''}</div>
                    {Array.isArray(d.highlights) && d.highlights.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-zinc-400 list-disc list-inside">
                        {d.highlights.slice(0, 2).map((h, i) => (
                          <li key={i} className="truncate">{h}</li>
                        ))}
                        {d.highlights.length > 2 && (
                          <li className="text-zinc-600">+{d.highlights.length - 2} more</li>
                        )}
                      </ul>
                    )}
                    {entry.enrichmentStatus === 'complete' && entry.enrichedData && (
                      <span className="mt-2 inline-block rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
                        AI enriched
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {educationEntries.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <GraduationCap className="h-3.5 w-3.5" />
              Education ({educationEntries.length})
            </h4>
            <div className="space-y-2">
              {educationEntries.map((entry) => {
                const d = entry.rawData as { degree?: string; institution?: string; period?: string }
                return (
                  <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">{d.degree ?? '—'}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{d.period ?? ''}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">{d.institution ?? ''}</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {skillEntries.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Wrench className="h-3.5 w-3.5" />
              Skills
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {skillEntries.flatMap((entry) => {
                const d = entry.rawData as { skills?: string[] }
                return d.skills ?? []
              }).slice(0, 20).map((skill, i) => (
                <span
                  key={i}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-zinc-300"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {otherCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-600">
            <Award className="h-3.5 w-3.5" />
            {otherCount} additional entr{otherCount === 1 ? 'y' : 'ies'} extracted (certifications, projects, achievements)
          </div>
        )}

        {entries.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">
            No entries extracted yet. Enrichment may still be running.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <Button
          variant="ghost"
          onClick={finish}
          className="text-xs"
        >
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
