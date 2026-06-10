/**
 * Progress Modal Store
 *
 * In-memory store for the app-global analysis progress modal. The modal is
 * mounted once at the layout level and driven from here, so it can be opened
 * both from the Resume Builder submit flow and from a running Pipeline
 * Notification — regardless of which page the user is on.
 */

import { create } from 'zustand'

interface ProgressModalState {
  /** Whether the modal is visible. */
  open: boolean
  /** Application slug being tracked (`null` until first opened). */
  slug: string | null
  /** Pipeline run id, when known — lets the stepper track real stages. */
  pipelineRunId?: string
  /** Run start time (ms epoch) for the elapsed timer (`null` until opened). */
  startedAt: number | null
}

interface ProgressModalActions {
  openProgress: (args: { slug: string; pipelineRunId?: string; startedAt: number }) => void
  closeProgress: () => void
}

export const useProgressModalStore = create<ProgressModalState & ProgressModalActions>((set) => ({
  open: false,
  slug: null,
  pipelineRunId: undefined,
  startedAt: null,
  openProgress: ({ slug, pipelineRunId, startedAt }) =>
    set({ open: true, slug, pipelineRunId, startedAt }),
  closeProgress: () => set({ open: false }),
}))
