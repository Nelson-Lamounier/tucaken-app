import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, AlertCircle, Building2, Briefcase } from 'lucide-react'
import { useApplicationDetail, useApplicationStatus } from '@/hooks/use-admin-applications'
import { adminKeys } from '@/lib/api/query-keys'
import type { ApplicationStatus, InterviewStage, ApplicationDetail } from '@/lib/types/applications.types'
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
import { AppliedWorkspace } from '../stages/workspaces/AppliedWorkspace'
import { StageGlancePanel } from './StageGlancePanel'
import { STAGE_ORDER, stageIndex } from '../stages/types/stage'
import { Button } from '@/components/ui/Button'
import { ApplicationActionsMenu } from './ApplicationActionsMenu'
import { triggerCoachFn } from '@/server/pipelines'
import { ConfirmModal } from '../stages/components/ConfirmModal'
import { useToastStore } from '@/lib/stores/toast-store'

import {
  STATUS_OPTIONS,
  STATUS_LABELS,
  STAGE_LABELS,
} from './ApplicationTypes'

/** Returns the bare workspace node for a stage — no gate, no callbacks. */
function stageWorkspaceNode(stage: InterviewStage, detail: ApplicationDetail) {
  if (stage === 'applied') return <AppliedWorkspace detail={detail} />
  if (stage === 'phone-screen') return <PhoneScreenWorkspace detail={detail} />
  if (stage === 'technical') return <TechnicalWorkspace detail={detail} />
  if (stage === 'system-design') return <SystemDesignWorkspace detail={detail} />
  if (stage === 'behavioural') return <BehaviouralWorkspace detail={detail} />
  if (stage === 'bar-raiser') return <BarRaiserWorkspace detail={detail} />
  if (stage === 'final') return <FinalWorkspace detail={detail} />
  return <StageWorkspacePlaceholder stage={stage} />
}

interface ApplicationErrorStateProps {
  readonly message: string
  readonly onBack: () => void
}

function ApplicationErrorState({ message, onBack }: ApplicationErrorStateProps) {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Applications
      </button>
      <div className="flex items-center gap-3 rounded-xl border border-red-600/20 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 px-4 py-3 text-sm">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  )
}

interface ApplicationHeaderProps {
  readonly detail: ApplicationDetail
  readonly statusPending: boolean
  readonly onStatusChange: (status: ApplicationStatus) => void
  readonly dateStr: string
}

/**
 * Identity header for the application — company, role + applied date, and the
 * status control. Mirrors the KB dashboard header (title + subtitle + action);
 * the at-a-glance stat tiles render beneath it via StageGlancePanel.
 */
function ApplicationHeader({ detail, statusPending, onStatusChange, dateStr }: ApplicationHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5">
          <Building2 className="size-5 text-zinc-600 dark:text-zinc-300" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold leading-7 tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
            {detail.targetCompany}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            <Briefcase className="size-3.5 shrink-0" />
            <span className="truncate">{detail.targetRole}</span>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">Applied {dateStr}</span>
          </p>
        </div>
      </div>

      <ApplicationActionsMenu
        detail={detail}
        statusLabel={STATUS_LABELS[detail.status]}
        statusOptions={STATUS_OPTIONS}
        statusValue={detail.status}
        statusPending={statusPending}
        onStatusChange={onStatusChange}
      />
    </div>
  )
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
    return <ApplicationErrorState message={error.message} onBack={() => navigate({ to: '/applications/list' })} />
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
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* Back nav */}
      <button
        type="button"
        onClick={() => navigate({ to: '/applications/list' })}
        className="mb-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Applications
      </button>

      {/* Stage navigation — top of the section */}
      <div className="mb-6">
        <StageProgressBar
          current={detail.interviewStage}
          active={resolvedStage}
          onSelect={handleStageSelect}
          stages={detail.stages}
        />
      </div>

      {/* Page header */}
      <ApplicationHeader
        detail={detail}
        statusPending={statusMutation.isPending}
        onStatusChange={handleStatusChange}
        dateStr={dateStr}
      />

      {/* At-a-glance dashboard panel — dynamic per active stage */}
      <StageGlancePanel detail={detail} stage={resolvedStage} />

      {/* Active stage workspace — master–detail shell (left summary + right rail) */}
      <div className="mt-8">
        <WorkspaceShell
          detail={detail}
          activeStage={resolvedStage}
          focus={focus}
          onFocusChange={handleFocusChange}
          initialCollapse
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
