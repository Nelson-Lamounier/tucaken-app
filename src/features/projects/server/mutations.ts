import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteDecisionFn,
  patchDecisionFn,
  patchProjectFn,
  regenerateProjectFn,
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
