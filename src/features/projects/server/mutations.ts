import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  archiveProjectFn,
  confirmProjectFn,
  deleteDecisionFn,
  mergeProjectsFn,
  patchDecisionFn,
  patchProjectFn,
  regenerateProjectFn,
  runClusteringFn,
  splitProjectFn,
} from '../../../server/projects'
import type { ProjectDecision, ProjectDetail, ProjectListResponse } from '../lib/types'
import { projectsQueries } from './queries'

type ProjectPatch = Parameters<typeof patchProjectFn>[0]['data']['patch']
type DecisionPatch = Parameters<typeof patchDecisionFn>[0]['data']['patch']

/**
 * Optimistic project patch. Snapshots the cached detail before mutation,
 * applies the patch locally, rolls back on failure, and reconciles with the
 * server on settle. List cache is invalidated so the index reflects the
 * new tagline / status / etc. on next view.
 */
export function usePatchProject(projectId: string) {
  const queryClient = useQueryClient()
  const detailKey = projectsQueries.detail(projectId).queryKey

  return useMutation({
    mutationFn: (patch: ProjectPatch) => patchProjectFn({ data: { id: projectId, patch } }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previous = queryClient.getQueryData<ProjectDetail>(detailKey)
      if (previous) {
        queryClient.setQueryData<ProjectDetail>(detailKey, { ...previous, ...patch })
      }
      return { previous }
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey })
      void queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
    },
  })
}

export function usePatchDecision(projectId: string, decisionId: string) {
  const queryClient = useQueryClient()
  const detailKey = projectsQueries.detail(projectId).queryKey

  return useMutation({
    mutationFn: (patch: DecisionPatch) =>
      patchDecisionFn({ data: { projectId, decisionId, patch } }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previous = queryClient.getQueryData<ProjectDetail>(detailKey)
      if (previous) {
        queryClient.setQueryData<ProjectDetail>(detailKey, {
          ...previous,
          decisions: previous.decisions.map((d) =>
            d.id === decisionId ? { ...d, ...patch } as ProjectDecision : d,
          ),
        })
      }
      return { previous }
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey })
    },
  })
}

export function useDeleteDecision(projectId: string) {
  const queryClient = useQueryClient()
  const detailKey = projectsQueries.detail(projectId).queryKey

  return useMutation({
    mutationFn: (decisionId: string) =>
      deleteDecisionFn({ data: { projectId, decisionId } }),
    onMutate: async (decisionId) => {
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previous = queryClient.getQueryData<ProjectDetail>(detailKey)
      if (previous) {
        queryClient.setQueryData<ProjectDetail>(detailKey, {
          ...previous,
          decisions: previous.decisions.filter((d) => d.id !== decisionId),
        })
      }
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey })
    },
  })
}

export function useRegenerateProject(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => regenerateProjectFn({ data: projectId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: projectsQueries.detail(projectId).queryKey,
      })
    },
  })
}

/**
 * Merge source projects into `targetId`. Sources are archived and their
 * components reassigned to the target. Invalidates the target detail and the
 * list so the absorbed projects disappear and the target reflects new
 * components.
 */
export function useMergeProjects(targetId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sourceIds: string[]) => mergeProjectsFn({ data: { targetId, sourceIds } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsQueries.detail(targetId).queryKey })
      void queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
    },
  })
}

/**
 * Integrate a synced repository into an existing project. Each synced repo has
 * a 1:1 "default" project; folding it in is a merge with the repo's default as
 * the source (it gets archived, its component reassigned to the target). Target
 * is dynamic (chosen in the dialog), so — unlike useMergeProjects — it's a
 * parameter of the call, not the hook.
 *
 * After the merge, it auto-dispatches a case-study regenerate for the target so
 * the study reflects the new repo in one action (the server runs it as an
 * incremental refine — preserve prior + add the new repo). The regenerate is
 * best-effort: a dispatch failure must not fail the merge the user just made
 * (they can still regenerate manually). Invalidates the target detail + list so
 * the absorbed repo default disappears and the "regenerating" state shows.
 */
export function useIntegrateRepo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ targetId, sourceIds }: { targetId: string; sourceIds: string[] }) => {
      const merge = await mergeProjectsFn({ data: { targetId, sourceIds } })
      let regenerateDispatched = false
      try {
        await regenerateProjectFn({ data: targetId })
        regenerateDispatched = true
      } catch {
        // non-fatal — the merge succeeded; the case study can be regenerated manually
      }
      return { merge, regenerateDispatched }
    },
    onSuccess: (_res, { targetId }) => {
      void queryClient.invalidateQueries({ queryKey: projectsQueries.detail(targetId).queryKey })
      void queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
    },
  })
}

/**
 * Confirm an AI-suggested grouping. Flips is_user_confirmed and (server-side)
 * dispatches the case-study Job. Invalidates the proposals list (the project
 * leaves the unconfirmed set) and the main list.
 */
export function useConfirmProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (projectId: string) => confirmProjectFn({ data: projectId }),
    onSuccess: (_res, projectId) => {
      void queryClient.invalidateQueries({ queryKey: projectsQueries.proposals().queryKey })
      void queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
      void queryClient.invalidateQueries({ queryKey: projectsQueries.detail(projectId).queryKey })
    },
  })
}

/**
 * Kick off the clustering Job. Proposals appear asynchronously once the Job
 * completes — the caller should poll / refetch proposals after a delay.
 */
export function useRunClustering() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => runClusteringFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsQueries.proposals().queryKey })
    },
  })
}

/**
 * Reject a proposal (soft delete → archived). Optimistically removes it from
 * the cached proposals list, rolls back on failure.
 */
export function useArchiveProject() {
  const queryClient = useQueryClient()
  const proposalsKey = projectsQueries.proposals().queryKey

  return useMutation({
    mutationFn: (projectId: string) => archiveProjectFn({ data: projectId }),
    onMutate: async (projectId) => {
      await queryClient.cancelQueries({ queryKey: proposalsKey })
      const previous = queryClient.getQueryData<ProjectListResponse>(proposalsKey)
      queryClient.setQueryData<ProjectListResponse>(proposalsKey, (old) =>
        old ? { ...old, items: old.items.filter((p) => p.id !== projectId) } : old,
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(proposalsKey, context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: proposalsKey })
      void queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
    },
  })
}

/**
 * Carve components out of `projectId` into a new project. Invalidates the
 * source detail (components removed) and the list (new project appears).
 */
export function useSplitProject(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { componentIds: string[]; name: string; slug: string }) =>
      splitProjectFn({ data: { projectId, ...input } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsQueries.detail(projectId).queryKey })
      void queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
    },
  })
}
