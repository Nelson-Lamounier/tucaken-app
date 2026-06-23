import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { triggerGitHubIngestionFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'

interface IngestionVariables {
  readonly repoFullName:  string
  readonly defaultBranch?: string
  readonly forceReindex?: boolean
  /** Enrichment tier for allowlisted test users; omitted otherwise. */
  readonly enrichment?: 'premium' | 'free'
}

export function useGitHubIngestion() {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const [needsUpgrade, setNeedsUpgrade] = useState(false)

  const mutation = useMutation<
    { status: string; repoFullName: string; jobName: string },
    Error,
    IngestionVariables
  >({
    mutationFn: (data) => triggerGitHubIngestionFn({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.accessibleRepos() })
    },
    onError: (err) => {
      if (err.message.includes('[429]')) {
        // Show the persistent upgrade banner instead of an auto-dismissing toast.
        setNeedsUpgrade(true)
      } else {
        addToast('error', `Failed to queue repo: ${err.message}`)
      }
    },
  })

  return {
    ...mutation,
    needsUpgrade,
    dismissUpgrade: () => setNeedsUpgrade(false),
  }
}
