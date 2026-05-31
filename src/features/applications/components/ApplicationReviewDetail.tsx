import { PaperClipIcon } from '@heroicons/react/20/solid'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { adminKeys } from '@/lib/api/query-keys'
import { useToastStore } from '@/lib/stores/toast-store'
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'
import DropDownOptions from '@/components/ui/DropDownOptions'
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
import { mapApplicationToBuilderState } from '../utils/resume-adapters'

interface ApplicationReviewDetailProps {
  readonly detail: ApplicationDetail
}

export function ApplicationReviewDetail({ detail }: ApplicationReviewDetailProps) {
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
    } catch (err) {
      console.error('[ResumeBuilder] adapter failed:', err)
      exitEphemeralMode()
      prevStateRef.current = null
      return
    }
    setBuilderKey((k) => k + 1)
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
      () => buildCoverLetterDomForPdf(
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

  return (
    <div>
      <div className="px-4 sm:px-0 flex items-start justify-between">
        <div>
          <h3 className="text-base/7 font-semibold text-zinc-900 dark:text-white">Application Information</h3>
          <p className="mt-1 max-w-2xl text-sm/6 text-zinc-600 dark:text-zinc-400">Application details for {detail.targetCompany}.</p>
        </div>
        <div className="flex shrink-0">
          <DropDownOptions
            onEdit={detail.analysis?.tailoredResume ? handleOpenBuilder : undefined}
            onPublish={detail.analysis?.tailoredResume ? () => publishMutation.mutate() : undefined}
            onDelete={() => deleteMutation.mutate()}
          />
        </div>
      </div>
      <div className="mt-6">
        <dl className="grid grid-cols-1 sm:grid-cols-2">
          <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-1 sm:px-0">
            <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Target Company</dt>
            <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400 sm:mt-2">{detail.targetCompany}</dd>
          </div>
          <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-1 sm:px-0">
            <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Target Role</dt>
            <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400 sm:mt-2">{detail.targetRole}</dd>
          </div>
          <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-1 sm:px-0">
            <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Status</dt>
            <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400 sm:mt-2 capitalize">{detail.status.replace('-', ' ')}</dd>
          </div>
          <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-1 sm:px-0">
            <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Interview Stage</dt>
            <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400 sm:mt-2 capitalize">{detail.interviewStage.replace('-', ' ')}</dd>
          </div>
          <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-2 sm:px-0">
            <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Fit Summary</dt>
            <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400 sm:mt-2">
              {detail.research?.fitSummary ?? 'Analysis in progress...'}
            </dd>
          </div>
          {detail.research?.experienceSignals && (
            <>
              <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-1 sm:px-0">
                <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Years Expected</dt>
                <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400 sm:mt-2">{detail.research.experienceSignals.yearsExpected}</dd>
              </div>
              <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-1 sm:px-0">
                <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Domain Focus</dt>
                <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400 sm:mt-2">{detail.research.experienceSignals.domain}</dd>
              </div>
              <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-1 sm:px-0">
                <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Leadership Level</dt>
                <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400 sm:mt-2">{detail.research.experienceSignals.leadership}</dd>
              </div>

              {/* Resume Suggestions */}
              {detail.analysis?.resumeSuggestions?.summary && (
                <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-1 sm:px-0">
                  <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Resume Suggestions</dt>
                  <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400 sm:mt-2">
                    {detail.analysis.resumeSuggestions.summary}
                  </dd>
                </div>
              )}
              <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-1 sm:px-0">
                <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Scale Expected</dt>
                <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400 sm:mt-2">{detail.research.experienceSignals.scale}</dd>
              </div>
            </>
          )}

          {/* Verified Matches */}
          {detail.research?.verifiedMatches && detail.research.verifiedMatches.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-2 sm:px-0">
              <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Verified Matches</dt>
              <dd className="mt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {detail.research.verifiedMatches.map((match) => (
                    <div
                      key={match.skill}
                      className="flex items-start gap-3 rounded-lg border border-emerald-600/20 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/5 p-3"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                          {match.skill}
                        </span>
                        <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                          {match.sourceCitation}
                        </p>
                        <div className="mt-1 flex gap-2">
                          <span className="rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-400 px-1.5 py-0.5 text-xs">
                            {match.depthBadge}
                          </span>
                          <span className="rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-400 px-1.5 py-0.5 text-xs">
                            {match.recency}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </dd>
            </div>
          )}

          {/* Partial Matches */}
          {detail.research?.partialMatches && detail.research.partialMatches.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-2 sm:px-0">
              <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Partial Matches</dt>
              <dd className="mt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {detail.research.partialMatches.map((match) => (
                    <div
                      key={match.skill}
                      className="flex items-start gap-3 rounded-lg border border-amber-600/20 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/5 p-3"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                          {match.skill}
                        </span>
                        <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                          {match.gapDescription}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          <span className="text-zinc-600 dark:text-zinc-400">Framing:</span>{' '}
                          {match.framingSuggestion}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </dd>
            </div>
          )}

          {/* Skills Gaps */}
          {detail.research?.gaps && detail.research.gaps.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-2 sm:px-0">
              <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Skills Gaps</dt>
              <dd className="mt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {detail.research.gaps.map((gap) => (
                    <div
                      key={gap.skill}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        gap.isDisqualifying
                          ? 'border-red-600/20 bg-red-50 dark:border-red-500/20 dark:bg-red-500/5'
                          : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700/50 dark:bg-zinc-800/20'
                      }`}
                    >
                      <XCircle
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          gap.isDisqualifying ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${
                              gap.isDisqualifying ? 'text-red-700 dark:text-red-300' : 'text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            {gap.skill}
                          </span>
                          {gap.isDisqualifying && (
                            <span className="rounded bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 px-1.5 py-0.5 text-xs font-medium">
                              Disqualifying
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{gap.severity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </dd>
            </div>
          )}

          {/* Technology Inventory */}
          {detail.research?.technologyInventory && (
            <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-2 sm:px-0">
              <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white mb-4">Technology Inventory</dt>
              <dd className="mt-1">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {([
                    ['Languages', detail.research.technologyInventory.languages],
                    ['Frameworks', detail.research.technologyInventory.frameworks],
                    ['Infrastructure', detail.research.technologyInventory.infrastructure],
                    ['Tools', detail.research.technologyInventory.tools],
                    ['Methodologies', detail.research.technologyInventory.methodologies],
                  ] as const).map(([category, items]) =>
                    items.length > 0 ? (
                      <div key={category}>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          {category}
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((item) => (
                            <span
                              key={item}
                              className="rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 px-2 py-0.5 text-xs"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              </dd>
            </div>
          )}


          <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-6 sm:col-span-2 sm:px-0">
            <dt className="text-sm/6 font-medium text-zinc-900 dark:text-white">Attachments</dt>
            <dd className="mt-2 text-sm text-zinc-900 dark:text-white">
              <ul role="list" className="divide-y divide-zinc-200 dark:divide-white/5 rounded-md border border-zinc-200 dark:border-white/10">
                <li className="flex items-center justify-between py-4 pr-5 pl-4 text-sm/6">
                  <div className="flex w-0 flex-1 items-center">
                    <PaperClipIcon aria-hidden="true" className="size-5 shrink-0 text-zinc-500" />
                    <div className="ml-4 flex min-w-0 flex-1 gap-2">
                      <span className="truncate font-medium text-zinc-900 dark:text-white">tailored_resume.pdf</span>
                      <span className="shrink-0 text-zinc-500">2.4mb</span>
                    </div>
                  </div>
                  <div className="ml-4 shrink-0 flex gap-4">
                    <button type="button" onClick={handleDownloadResume} disabled={isDownloading} className="font-medium text-blue-500 hover:text-blue-400 transition-colors disabled:opacity-50">
                      {isDownloading ? 'Generating…' : 'Download'}
                    </button>
                  </div>
                </li>
                {detail.analysis?.coverLetter && (
                  <li className="flex items-center justify-between py-4 pr-5 pl-4 text-sm/6">
                    <div className="flex w-0 flex-1 items-center">
                      <PaperClipIcon aria-hidden="true" className="size-5 shrink-0 text-zinc-500" />
                      <div className="ml-4 flex min-w-0 flex-1 gap-2">
                        <span className="truncate font-medium text-zinc-900 dark:text-white">cover_letter.pdf</span>
                        <span className="shrink-0 text-zinc-500">1.2mb</span>
                      </div>
                    </div>
                    <div className="ml-4 shrink-0 flex gap-4">
                      <button type="button" onClick={handleDownloadCoverLetter} disabled={isDownloading} className="font-medium text-blue-500 hover:text-blue-400 transition-colors disabled:opacity-50">
                        {isDownloading ? 'Generating…' : 'Download'}
                      </button>
                    </div>
                  </li>
                )}
              </ul>
            </dd>
          </div>
        </dl>
      </div>

      {detail.analysis?.tailoredResume && (
        <DashboardDrawer
          isOpen={isBuilderOpen}
          onClose={handleCloseBuilder}
          title="Edit Tailored Resume"
          description={`${detail.targetCompany} — ${detail.targetRole}`}
          unstyledContent
          fullBleed
        >
          {isBuilderOpen && (
            <ResumeBuilderApp key={builderKey} onClose={handleCloseBuilder} />
          )}
        </DashboardDrawer>
      )}
    </div>
  )
}

