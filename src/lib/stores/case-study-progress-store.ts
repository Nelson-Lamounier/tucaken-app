/**
 * Case-Study Progress Modal Store
 *
 * In-memory store for the app-global "regenerating case study" progress modal,
 * shown when a repository is folded into a project (IntegrateRepoDialog) and the
 * case-study regenerate pipeline (`pipeline_type='case_study'`) is dispatched.
 *
 * Mirrors `progress-modal-store` (the JD/analysis modal) but is keyed on the
 * project + its regenerate `pipelineRunId`, since the case-study pipeline has no
 * application and only resolves queued → complete/failed. Mounted once at the
 * layout level and opened both from the integrate flow and from a running
 * Pipeline Notification, regardless of the current page.
 */

import { create } from 'zustand'

interface CaseStudyProgressState {
  /** Whether the modal is visible. */
  open: boolean
  /** Project being regenerated (`null` until first opened). */
  projectId: string | null
  /** Project name for the modal copy. */
  projectName: string
  /** Regenerate pipeline run id — drives status polling. */
  pipelineRunId?: string
  /** Run start time (ms epoch) for the elapsed timer (`null` until opened). */
  startedAt: number | null
}

interface CaseStudyProgressActions {
  openProgress: (args: { projectId: string; projectName: string; pipelineRunId?: string; startedAt: number }) => void
  closeProgress: () => void
}

export const useCaseStudyProgressStore = create<CaseStudyProgressState & CaseStudyProgressActions>((set) => ({
  open: false,
  projectId: null,
  projectName: '',
  pipelineRunId: undefined,
  startedAt: null,
  openProgress: ({ projectId, projectName, pipelineRunId, startedAt }) =>
    set({ open: true, projectId, projectName, pipelineRunId, startedAt }),
  closeProgress: () => set({ open: false }),
}))
