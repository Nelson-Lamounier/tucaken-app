import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { reanalyseApplicationFn } from '@/server/pipelines'
import type { TriggerResponse } from '@/lib/types/applications.types'

/**
 * Mutation hook for re-running an application's analysis pipeline from its
 * stored job description (no JD re-entry, same application card).
 *
 * On success, invalidates the application detail query (card flips to
 * 'analysing') and the applications list. The returned TriggerResponse
 * carries the fresh pipelineRunId for progress tracking.
 */
export function useApplicationReanalyse() {
  const queryClient = useQueryClient()

  return useMutation<TriggerResponse, Error, { applicationId: string }>({
    mutationFn: (data) => reanalyseApplicationFn({ data }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['application', variables.applicationId] })
      void queryClient.invalidateQueries({ queryKey: adminKeys.applications.all })
    },
  })
}
