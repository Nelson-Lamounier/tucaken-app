'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ApplicationDetail, ApplicationStatus, InterviewStage } from '@/lib/types/applications.types'
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

const PUBLISH_ALLOW_LIST = new Set(['lamounier_88@hotmail.com'])

/** Presentation gate for the publish action; admin-api remains the real authority. */
export function canPublishResume(email: string | undefined): boolean {
  return typeof email === 'string' && PUBLISH_ALLOW_LIST.has(email)
}

interface ApplicationActionsMenuProps {
  readonly detail: ApplicationDetail
  /** The stage tab currently being viewed (?stage=) — resume actions show on 'applied'. */
  readonly viewedStage: InterviewStage
  /** Status-select props — the menu doubles as the status control. */
  readonly statusLabel: ReactNode
  readonly statusOptions: ReadonlyArray<{ label: string; value: string }>
  readonly statusValue: string
  readonly statusPending: boolean
  readonly onStatusChange: (status: ApplicationStatus) => void
  /** Presentation gate — true only for the permitted operator email. */
  readonly canPublish: boolean
}

/**
 * The application's header menu: the status selector plus the resume
 * attachments (download) and actions (edit / publish / delete), folded into one
 * dropdown. Owns the resume-builder drawer and the publish/delete mutations.
 */
export function ApplicationActionsMenu({
  detail,
  viewedStage,
  statusLabel,
  statusOptions,
  statusValue,
  statusPending,
  onStatusChange,
  canPublish,
}: ApplicationActionsMenuProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [builderKey, setBuilderKey] = useState(0)
  const prevStateRef = useRef<AppState | null>(null)

  // Resume attachments / edit / publish are relevant when viewing the Applied
  // stage tab (?stage=applied) — not gated on the application's furthest stage.
  const isApplied = viewedStage === 'applied'

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

  const { generatePdf } = usePdfDownload()

  const handleDownloadResume = useCallback(() => {
    if (!detail.analysis?.tailoredResume) return
    const resume = detail.analysis.tailoredResume as unknown as ResumeData
    const company = detail.targetCompany.replace(/\s+/g, '_')
    const role = detail.targetRole.replace(/\s+/g, '_')
    void generatePdf(() => buildResumeDomForPdf(resume), `Nelson_Lamounier_Resume_${company}_${role}.pdf`)
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

  return (
    <>
      <DropDownOptions
        label={statusLabel}
        disabled={statusPending}
        options={statusOptions}
        selectedValue={statusValue}
        onSelect={val => onStatusChange(val as ApplicationStatus)}
        onDownloadResume={isApplied && hasTailoredResume ? handleDownloadResume : undefined}
        onDownloadCoverLetter={isApplied && detail.analysis?.coverLetter ? handleDownloadCoverLetter : undefined}
        onEdit={isApplied && hasTailoredResume ? handleOpenBuilder : undefined}
        onPublish={isApplied && hasTailoredResume && canPublish ? () => publishMutation.mutate() : undefined}
        onDelete={() => deleteMutation.mutate()}
      />

      {isApplied && detail.analysis?.tailoredResume && (
        <DashboardDrawer
          isOpen={isBuilderOpen}
          onClose={handleCloseBuilder}
          title="Edit Tailored Resume"
          description={`${detail.targetCompany} — ${detail.targetRole}`}
          unstyledContent
          fullBleed
          modal={false}
        >
          {isBuilderOpen && <ResumeBuilderApp key={builderKey} onClose={handleCloseBuilder} />}
        </DashboardDrawer>
      )}
    </>
  )
}
