import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteDecisionFn,
  mergeProjectsFn,
  patchDecisionFn,
  patchProjectFn,
  regenerateProjectFn,
  splitProjectFn,
} from '../../../server/projects'
import type { ProjectDecision, ProjectDetail } from '../lib/types'
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
