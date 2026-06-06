'use client'

import { PaperClipIcon } from '@heroicons/react/20/solid'
import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { PenLine, Send, Trash2 } from 'lucide-react'
import type {
  ApplicationDetail,
  VerifiedMatch,
  PartialMatch,
  SkillGap,
  ExperienceSignal,
} from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { EvidenceIndicator } from '../components/EvidenceIndicator'
import { SummaryGroup, SummaryRow, useDetailRail, useSummaryGroupTitle } from '../components/workspace-shell'
import { adminKeys } from '@/lib/api/query-keys'
import { useToastStore } from '@/lib/stores/toast-store'
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'
import { createResumeFn, setActiveResumeFn } from '@/server/resumes'
import { deleteApplicationFn } from '@/server/applications'
import { buildResumeDomForPdf, buildCoverLetterDomForPdf } from '@/lib/resumes/resume-dom-builder'
import { usePdfDownload } from '@/hooks/use-pdf-download'
import type { ResumeData } from '@/lib/resumes/resume-data'
import { ResumeBuilderApp } from '@/features/resume-theme/app/main'
import {
  getState,
  setState,
  enterEphemeralMode,
  exitEphemeralMode,
  type AppState,
} from '@/features/resume-theme/app/state'
import { mapApplicationToBuilderState } from '../../utils/resume-adapters'

interface AppliedWorkspaceProps {
  readonly detail: ApplicationDetail
}

interface SignalRowProps {
  readonly label: string
  readonly value: string
}

function SignalRow({ label, value }: SignalRowProps) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase text-zinc-400 dark:text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{value}</dd>
    </div>
  )
}

const PANEL = 'rounded-md border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/2'

/** Fit-summary panel (left, ~70%). */
function FitSummaryPanel({ summary }: { readonly summary: string }) {
  return (
    <section className={PANEL}>
      <div className="border-l-2 border-[color-mix(in_oklab,var(--accent)_55%,transparent)] py-1 pl-4">
        <p className="mb-2 text-[10px] font-semibold uppercase text-zinc-400 dark:text-zinc-500">
          Fit summary
        </p>
        <p className="text-sm leading-7 tracking-[0.01em] text-zinc-700 dark:text-zinc-200">{summary}</p>
      </div>
    </section>
  )
}

/** Experience-signals panel (right, ~30%). */
function ExperienceSignalsPanel({ signals }: { readonly signals: ExperienceSignal }) {
  return (
    <section className={PANEL}>
      <dl className="space-y-4">
        <SignalRow label="Years expected" value={signals.yearsExpected} />
        <SignalRow label="Domain focus" value={signals.domain} />
        <SignalRow label="Scale expected" value={signals.scale} />
        <SignalRow label="Leadership level" value={signals.leadership} />
      </dl>
    </section>
  )
}

/**
 * Fit & experience — two separate panels side by side: the fit summary (~70%)
 * and the experience signals (~30%). Stacks on mobile.
 */
function FitExperienceSection({ detail }: { readonly detail: ApplicationDetail }) {
  const signals = detail.research?.experienceSignals
  return (
    <div className="grid gap-4 sm:grid-cols-[7fr_3fr]">
      <FitSummaryPanel summary={detail.research?.fitSummary ?? 'Analysis in progress…'} />
      {signals && <ExperienceSignalsPanel signals={signals} />}
    </div>
  )
}

/** Resume-suggestion summary — inline, only when the agent produced one. */
function ResumeSuggestionsGroup({ summary }: { readonly summary: string }) {
  return (
    <SummaryGroup id="resume-suggestions" title="Resume suggestions">
      <Card className="p-4">
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>
      </Card>
    </SummaryGroup>
  )
}

/** Detail body for one verified match. */
function VerifiedMatchDetail({ match }: { readonly match: VerifiedMatch }) {
  return (
    <Card className="space-y-2 p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{match.skill}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{match.sourceCitation}</p>
      <div className="flex flex-wrap gap-2">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
          {match.depthBadge}
        </span>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
          {match.recency}
        </span>
      </div>
    </Card>
  )
}

/** One verified-match card — a clickable CTA that opens its detail in the drawer. */
function VerifiedMatchCard({ match }: { readonly match: VerifiedMatch }) {
  const { selected, select } = useDetailRail()
  const section = useSummaryGroupTitle()
  const id = `verified-${match.skill}`
  const isActive = selected?.id === id

  return (
    <button
      type="button"
      onClick={() => select({ id, label: match.skill, node: <VerifiedMatchDetail match={match} />, section })}
      aria-current={isActive ? 'true' : undefined}
      className={[
        'flex h-full flex-col gap-2 rounded-md border p-3 text-left transition-colors',
        isActive
          ? 'border-accent/40 bg-accent/8'
          : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-white/2 dark:hover:bg-white/5',
      ].join(' ')}
    >
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{match.skill}</span>
      <p className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{match.sourceCitation}</p>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
          {match.depthBadge}
        </span>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
          {match.recency}
        </span>
      </div>
    </button>
  )
}

/** Verified matches — a grid of clickable cards; each opens its detail in the drawer. */
function VerifiedMatchesGroup({ matches }: { readonly matches: readonly VerifiedMatch[] }) {
  return (
    <SummaryGroup
      id="verified-matches"
      title="Verified matches"
      subtitle="Skills backed by evidence in your work."
      count={matches.length}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map(match => (
          <VerifiedMatchCard key={match.skill} match={match} />
        ))}
      </div>
    </SummaryGroup>
  )
}

/** Detail body for one partial match. */
function PartialMatchDetail({ match }: { readonly match: PartialMatch }) {
  return (
    <Card className="space-y-2 p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{match.skill}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{match.gapDescription}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">Foundation:</span>{' '}
        {match.transferableFoundation}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">Framing:</span>{' '}
        {match.framingSuggestion}
      </p>
    </Card>
  )
}

/** Partial matches — one row per match; moderate-evidence indicator. */
function PartialMatchesGroup({ matches }: { readonly matches: readonly PartialMatch[] }) {
  return (
    <SummaryGroup
      id="partial-matches"
      title="Partial matches"
      subtitle="Adjacent skills worth framing carefully."
      count={matches.length}
    >
      {matches.map(match => (
        <SummaryRow
          key={match.skill}
          id={`partial-${match.skill}`}
          label={match.skill}
          preview={match.gapDescription}
          indicator={<EvidenceIndicator strength="moderate" />}
          detail={<PartialMatchDetail match={match} />}
        />
      ))}
    </SummaryGroup>
  )
}

/** Detail body for one skills gap. */
function SkillGapDetail({ gap }: { readonly gap: SkillGap }) {
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{gap.skill}</p>
        {gap.isDisqualifying && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/20 dark:text-red-400">
            Disqualifying
          </span>
        )}
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{gap.severity}</p>
      <span className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-xs capitalize text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
        {gap.gapType} skill
      </span>
    </Card>
  )
}

/** Skills gaps — one row per gap; gap (none) indicator. */
function SkillsGapsGroup({ gaps }: { readonly gaps: readonly SkillGap[] }) {
  return (
    <SummaryGroup
      id="skills-gaps"
      title="Skills gaps"
      subtitle="Where the role asks for more than the evidence shows."
      count={gaps.length}
    >
      {gaps.map(gap => (
        <SummaryRow
          key={gap.skill}
          id={`gap-${gap.skill}`}
          label={gap.skill}
          preview={gap.severity}
          indicator={<EvidenceIndicator strength="none" />}
          detail={<SkillGapDetail gap={gap} />}
        />
      ))}
    </SummaryGroup>
  )
}

/** Technology inventory — inline grid of tag categories. */
function TechnologyInventoryGroup({ detail }: { readonly detail: ApplicationDetail }) {
  const inv = detail.research?.technologyInventory
  if (!inv) return null
  const categories: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['Languages', inv.languages],
    ['Frameworks', inv.frameworks],
    ['Infrastructure', inv.infrastructure],
    ['Tools', inv.tools],
    ['Methodologies', inv.methodologies],
  ]
  return (
    <SummaryGroup id="technology-inventory" title="Technology inventory">
      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {categories.map(([category, items]) =>
            items.length > 0 ? (
              <div key={category}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {category}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(item => (
                    <span
                      key={item}
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </Card>
    </SummaryGroup>
  )
}

interface AttachmentRowProps {
  readonly name: string
  readonly size: string
  readonly downloading: boolean
  readonly onDownload: () => void
}

function AttachmentRow({ name, size, downloading, onDownload }: AttachmentRowProps) {
  return (
    <li className="flex items-center justify-between py-3 pr-4 pl-3 text-sm/6">
      <div className="flex w-0 flex-1 items-center">
        <PaperClipIcon aria-hidden="true" className="size-5 shrink-0 text-zinc-500" />
        <div className="ml-3 flex min-w-0 flex-1 gap-2">
          <span className="truncate font-medium text-zinc-900 dark:text-white">{name}</span>
          <span className="shrink-0 text-zinc-500">{size}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        className="ml-4 shrink-0 font-medium text-blue-500 transition-colors hover:text-blue-400 disabled:opacity-50"
      >
        {downloading ? 'Generating…' : 'Download'}
      </button>
    </li>
  )
}

/** Action button shared by the Actions group — matches the workspace draft-CTA style. */
function ActionButton({
  icon,
  label,
  onClick,
  tone = 'default',
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly onClick: () => void
  readonly tone?: 'default' | 'danger'
}) {
  const toneClasses =
    tone === 'danger'
      ? 'border-red-600/20 text-red-700 hover:bg-red-50 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/10'
      : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${toneClasses}`}
    >
      {icon}
      {label}
    </button>
  )
}

/**
 * Applied workspace (Stage 1). The post-analysis review surface: fit summary,
 * evidence matches/gaps, technology inventory, generated attachments, and the
 * resume-builder / publish / delete actions. Renders a fragment of
 * SummaryGroups into the WorkspaceShell's left column so the Applied stage
 * shares the master–detail layout of every other interview stage; the resume
 * builder drawer sits at the fragment root.
 */
export function AppliedWorkspace({ detail }: AppliedWorkspaceProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [builderKey, setBuilderKey] = useState(0)
  const prevStateRef = useRef<AppState | null>(null)

  const handleOpenBuilder = useCallback(() => {
    if (!detail.analysis?.tailoredResume) return
    prevStateRef.current = getState()
    enterEphemeralMode()
    try {
      setState(() =>
        mapApplicationToBuilderState(
          detail.analysis!.tailoredResume as unknown as ResumeData,
          detail.analysis?.coverLetter ?? null,
          detail.targetCompany,
          detail.targetRole,
        ),
      )
    } catch {
      // Adapter failed — restore prior builder state and bail out of edit mode.
      exitEphemeralMode()
      prevStateRef.current = null
      return
    }
    setBuilderKey(k => k + 1)
    setIsBuilderOpen(true)
  }, [detail])

  const handleCloseBuilder = useCallback(() => {
    setIsBuilderOpen(false)
    if (prevStateRef.current) {
      setState(() => prevStateRef.current!)
      prevStateRef.current = null
    }
    exitEphemeralMode()
  }, [])

  useEffect(() => {
    return () => {
      if (prevStateRef.current) {
        setState(() => prevStateRef.current!)
        prevStateRef.current = null
        exitEphemeralMode()
      }
    }
  }, [])

  const { downloading: isDownloading, generatePdf } = usePdfDownload()

  const handleDownloadResume = useCallback(() => {
    if (!detail.analysis?.tailoredResume) return
    const resume = detail.analysis.tailoredResume as unknown as ResumeData
    const company = detail.targetCompany.replace(/\s+/g, '_')
    const role = detail.targetRole.replace(/\s+/g, '_')
    void generatePdf(
      () => buildResumeDomForPdf(resume),
      `Nelson_Lamounier_Resume_${company}_${role}.pdf`,
    )
  }, [detail, generatePdf])

  const handleDownloadCoverLetter = useCallback(() => {
    if (!detail.analysis?.coverLetter) return
    const company = detail.targetCompany.replace(/\s+/g, '_')
    void generatePdf(
      () =>
        buildCoverLetterDomForPdf(
          detail.analysis!.coverLetter!,
          detail.analysis?.tailoredResume?.profile,
          detail.targetCompany,
          detail.targetRole,
        ),
      `Nelson_Lamounier_Cover_Letter_${company}.pdf`,
    )
  }, [detail, generatePdf])

  const publishMutation = useMutation({
    mutationFn: async () => {
      const created = await createResumeFn({
        data: {
          label: `${detail.targetCompany} — ${detail.targetRole}`,
          data: detail.analysis!.tailoredResume as unknown as Record<string, unknown>,
        },
      })
      await setActiveResumeFn({ data: created.resumeId })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.resumes.all })
      addToast('success', 'Resume published to the public site.')
    },
    onError: (err: Error) => addToast('error', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteApplicationFn({ data: detail.slug }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.applications.all })
      addToast('success', 'Application deleted.')
      void navigate({ to: '/applications/list' })
    },
    onError: (err: Error) => addToast('error', err.message),
  })

  const hasTailoredResume = Boolean(detail.analysis?.tailoredResume)
  const verifiedMatches = detail.research?.verifiedMatches ?? []
  const partialMatches = detail.research?.partialMatches ?? []
  const gaps = detail.research?.gaps ?? []
  const resumeSummary = detail.analysis?.resumeSuggestions?.summary

  return (
    <>
      <FitExperienceSection detail={detail} />

      {resumeSummary ? <ResumeSuggestionsGroup summary={resumeSummary} /> : null}

      {verifiedMatches.length > 0 && <VerifiedMatchesGroup matches={verifiedMatches} />}

      {partialMatches.length > 0 && <PartialMatchesGroup matches={partialMatches} />}

      {gaps.length > 0 && <SkillsGapsGroup gaps={gaps} />}

      <TechnologyInventoryGroup detail={detail} />

      {hasTailoredResume && (
        <SummaryGroup id="attachments" title="Attachments">
          <Card className="p-2">
            <ul role="list" className="divide-y divide-zinc-200 dark:divide-white/5">
              <AttachmentRow
                name="tailored_resume.pdf"
                size="2.4mb"
                downloading={isDownloading}
                onDownload={handleDownloadResume}
              />
              {detail.analysis?.coverLetter && (
                <AttachmentRow
                  name="cover_letter.pdf"
                  size="1.2mb"
                  downloading={isDownloading}
                  onDownload={handleDownloadCoverLetter}
                />
              )}
            </ul>
          </Card>
        </SummaryGroup>
      )}

      <SummaryGroup id="actions" title="Actions">
        <Card className="flex flex-wrap gap-2 p-4">
          {hasTailoredResume && (
            <>
              <ActionButton
                icon={<PenLine className="size-3.5" aria-hidden />}
                label="Edit tailored resume"
                onClick={handleOpenBuilder}
              />
              <ActionButton
                icon={<Send className="size-3.5" aria-hidden />}
                label="Publish to public site"
                onClick={() => publishMutation.mutate()}
              />
            </>
          )}
          <ActionButton
            icon={<Trash2 className="size-3.5" aria-hidden />}
            label="Delete application"
            onClick={() => deleteMutation.mutate()}
            tone="danger"
          />
        </Card>
      </SummaryGroup>

      {detail.analysis?.tailoredResume && (
        <DashboardDrawer
          isOpen={isBuilderOpen}
          onClose={handleCloseBuilder}
          title="Edit Tailored Resume"
          description={`${detail.targetCompany} — ${detail.targetRole}`}
          unstyledContent
          fullBleed
        >
          {isBuilderOpen && <ResumeBuilderApp key={builderKey} onClose={handleCloseBuilder} />}
        </DashboardDrawer>
      )}
    </>
  )
}
