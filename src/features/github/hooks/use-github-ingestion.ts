import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { triggerGitHubIngestionFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'

interface IngestionVariables {
  readonly repoFullName:  string
  readonly defaultBranch?: string
  readonly forceReindex?: boolean
}

export function useGitHubIngestion() {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  return useMutation<{ status: string; repoFullName: string; jobName: string }, Error, IngestionVariables>({
    mutationFn: (data) => triggerGitHubIngestionFn({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.accessibleRepos() })
    },
    onError: (err) => {
      const is429 = err.message.includes('[429]')
      addToast('error', is429
        ? 'Monthly ingestion limit reached. Upgrade to Pro for unlimited syncs.'
        : `Failed to queue repo: ${err.message}`)
    },
  })
}
