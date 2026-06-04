import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Building2,
  Briefcase,
  Clock,
  GraduationCap,
} from 'lucide-react'
import { useApplicationDetail, useApplicationStatus } from '@/hooks/use-admin-applications'
import { adminKeys } from '@/lib/api/query-keys'
import type { ApplicationStatus, InterviewStage, ApplicationDetail } from '@/lib/types/applications.types'
import { ApplicationReviewDetail } from './ApplicationReviewDetail'
import { StageProgressBar } from '../stages/components/StageProgressBar'
import { StagePrepGate } from '../stages/components/StagePrepGate'
import { StageWorkspacePlaceholder } from '../stages/components/StageWorkspacePlaceholder'
import { StageWorkspaceSkeleton } from '../stages/components/StageWorkspaceSkeleton'
import { WorkspaceShell } from '../stages/components/workspace-shell'
import { TechnicalWorkspace } from '../stages/workspaces/TechnicalWorkspace'
import { PhoneScreenWorkspace } from '../stages/workspaces/PhoneScreenWorkspace'
import { SystemDesignWorkspace } from '../stages/workspaces/SystemDesignWorkspace'
import { BehaviouralWorkspace } from '../stages/workspaces/BehaviouralWorkspace'
import { BarRaiserWorkspace } from '../stages/workspaces/BarRaiserWorkspace'
import { FinalWorkspace } from '../stages/workspaces/FinalWorkspace'
import { STAGE_ORDER, stageIndex } from '../stages/types/stage'
import { Button } from '@/components/ui/Button'
import DropDownOptions from '@/components/ui/DropDownOptions'
import { triggerCoachFn } from '@/server/pipelines'
import { ConfirmModal } from '../stages/components/ConfirmModal'
import { useToastStore } from '@/lib/stores/toast-store'

import {
  STATUS_OPTIONS,
  STATUS_COLOURS,
  STATUS_LABELS,
  STAGE_LABELS,
  FIT_RATING_COLOURS,
  FIT_RATING_LABELS,
} from './ApplicationTypes'

/** Returns the bare workspace node for a stage — no gate, no callbacks. */
function stageWorkspaceNode(stage: InterviewStage, detail: ApplicationDetail) {
  if (stage === 'applied') return <ApplicationReviewDetail detail={detail} />
  if (stage === 'phone-screen') return <PhoneScreenWorkspace detail={detail} />
  if (stage === 'technical') return <TechnicalWorkspace detail={detail} />
  if (stage === 'system-design') return <SystemDesignWorkspace detail={detail} />
  if (stage === 'behavioural') return <BehaviouralWorkspace detail={detail} />
  if (stage === 'bar-raiser') return <BarRaiserWorkspace detail={detail} />
  if (stage === 'final') return <FinalWorkspace detail={detail} />
  return <StageWorkspacePlaceholder stage={stage} />
}

interface ApplicationDetailContainerProps {
  readonly slug: string
  /** Active Stage from the `?stage` search param. Falls back to the
   *  application's Current Stage once the detail loads. */
  readonly activeStage?: InterviewStage
  /** Selected summary-row id from the `?focus` search param. */
  readonly focus?: string
}

export function ApplicationDetailContainer({ slug, activeStage, focus }: ApplicationDetailContainerProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const statusMutation = useApplicationStatus()
  const { addToast } = useToastStore()

  const { data: detail, isLoading, error } = useApplicationDetail(slug)

  /** Confirm-generate modal state */
  const [confirmGenStage, setConfirmGenStage] = useState<InterviewStage | null>(null)
  const [confirmGenForce, setConfirmGenForce] = useState(true)

  const handleStatusChange = useCallback(
    (newStatus: ApplicationStatus) => {
      statusMutation.mutate({ slug, status: newStatus })
    },
    [slug, statusMutation],
  )

  const handleStageSelect = useCallback(
    (stage: InterviewStage) => {
      void navigate({ to: '/applications/$slug', params: { slug }, search: { stage } })
    },
    [slug, navigate],
  )

  const handleFocusChange = useCallback(
    (id: string | null) => {
      void navigate({
        to: '/applications/$slug',
        params: { slug },
        search: { stage: activeStage, focus: id ?? undefined },
      })
    },
    [slug, activeStage, navigate],
  )

  const handleAdvance = useCallback(
    (current: InterviewStage, status: ApplicationStatus) => {
      const next = STAGE_ORDER[stageIndex(current) + 1]
      if (!next) return
      statusMutation.mutate({ slug, status, interviewStage: next })
      void navigate({ to: '/applications/$slug', params: { slug }, search: { stage: next } })
    },
    [slug, navigate, statusMutation],
  )

  /** Open the confirm modal before triggering the coach for a given stage. */
  const handleGeneratePrep = useCallback(
    (stage: InterviewStage, force = true) => {
      setConfirmGenStage(stage)
      setConfirmGenForce(force)
    },
    [],
  )

  /** Confirmed: actually trigger the coach, then invalidate the detail cache. */
  const handleConfirmGenerate = useCallback(() => {
    if (!confirmGenStage) return
    const stage = confirmGenStage
    const force = confirmGenForce
    setConfirmGenStage(null)
    void triggerCoachFn({ data: { slug, interviewStage: stage, force } })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: adminKeys.applications.detail(slug) })
      })
      .catch((err: unknown) => {
        addToast('error', err instanceof Error ? err.message : 'Failed to dispatch coach')
      })
  }, [confirmGenStage, confirmGenForce, slug, queryClient, addToast])

  /** Schedule: trigger a non-force dispatch so the stage row is seeded, then refetch. */
  const handleSchedule = useCallback(
    (stage: InterviewStage) => {
      void triggerCoachFn({ data: { slug, interviewStage: stage, force: false } })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: adminKeys.applications.detail(slug) })
        })
        .catch((err: unknown) => {
          addToast('error', err instanceof Error ? err.message : 'Failed to dispatch coach')
        })
    },
    [slug, queryClient, addToast],
  )



  // Loading state — layout-matched skeleton, not a spinner
  if (isLoading) {
    return <StageWorkspaceSkeleton />
  }

  // Error state
  if (error) {
    return (
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate({ to: '/applications/list' })}
          className="mb-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Applications
        </button>
        <div className="flex items-center gap-3 rounded-xl border border-red-600/20 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 px-4 py-3 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error.message}</span>
        </div>
      </div>
    )
  }

  if (!detail) return null

  // Active Stage = explicit ?stage param, else the application's Current Stage.
  const resolvedStage: InterviewStage = activeStage ?? detail.interviewStage

  const dateStr = new Date(detail.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* Back nav */}
      <button
        type="button"
        onClick={() => navigate({ to: '/applications/list' })}
        className="mb-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Applications
      </button>

      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {detail.targetCompany}
              </h1>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <Briefcase className="h-4 w-4 text-zinc-500" />
              <span className="text-base text-zinc-600 dark:text-zinc-400">{detail.targetRole}</span>
            </div>
          </div>

          {/* Status and actions */}
          <div className="flex items-center gap-3">

            <DropDownOptions
              label={STATUS_LABELS[detail.status]}
              disabled={statusMutation.isPending}
              options={STATUS_OPTIONS}
              selectedValue={detail.status}
              onSelect={(val) => handleStatusChange(val as ApplicationStatus)}
            />
          </div>
        </div>

        {/* Metadata row */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${STATUS_COLOURS[detail.status]}`}
          >
            {detail.status === 'analysing' && (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            )}
            {STATUS_LABELS[detail.status]}
          </span>

          {detail.research?.fitRating && (
            <span
              className={`inline-flex items-center rounded-lg border px-3 py-1 text-xs font-semibold ${FIT_RATING_COLOURS[detail.research.fitRating]}`}
            >
              {FIT_RATING_LABELS[detail.research.fitRating]}
            </span>
          )}

          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <GraduationCap className="h-3.5 w-3.5" />
            {STAGE_LABELS[detail.interviewStage]}
          </span>

          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Clock className="h-3.5 w-3.5" />
            {dateStr}
          </span>
        </div>
      </div>

      {/* Stage navigation */}
      <div className="mt-2">
        <StageProgressBar
          current={detail.interviewStage}
          active={resolvedStage}
          onSelect={handleStageSelect}
          stages={detail.stages}
        />
      </div>

      {/* Active stage workspace — master–detail shell (left summary + right rail) */}
      <div className="mt-8">
        <WorkspaceShell
          detail={detail}
          activeStage={resolvedStage}
          focus={focus}
          onFocusChange={handleFocusChange}
        >
          {resolvedStage === 'applied'
            ? stageWorkspaceNode('applied', detail)
            : (
              <StagePrepGate
                stage={resolvedStage}
                state={detail.stages?.[resolvedStage]}
                stageLabel={STAGE_LABELS[resolvedStage]}
                onSchedule={() => handleSchedule(resolvedStage)}
                onAdvance={() => handleAdvance(resolvedStage, detail.status)}
                onGenerate={() => handleGeneratePrep(resolvedStage, true)}
              >
                {stageWorkspaceNode(resolvedStage, detail)}
              </StagePrepGate>
            )
          }

          {stageIndex(resolvedStage) < STAGE_ORDER.length - 1 && (
            <div className="flex justify-end border-t border-zinc-200 pt-6 dark:border-white/10">
              <Button
                variant="primary"
                disabled={statusMutation.isPending}
                onClick={() => handleAdvance(resolvedStage, detail.status)}
              >
                Mark complete and advance
              </Button>
            </div>
          )}
        </WorkspaceShell>
      </div>
      {/* Confirm modal for AI coach dispatch */}
      <ConfirmModal
        open={confirmGenStage !== null}
        onClose={() => setConfirmGenStage(null)}
        onConfirm={handleConfirmGenerate}
        title="Generate interview prep?"
        body={`This will dispatch the AI coach to generate prep for the ${confirmGenStage ? STAGE_LABELS[confirmGenStage] : ''} stage. It takes a minute or two.`}
        confirmLabel="Generate"
      />
    </div>
  )
}
