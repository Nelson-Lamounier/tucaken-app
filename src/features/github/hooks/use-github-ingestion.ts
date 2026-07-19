import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { triggerGitHubIngestionFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'
import { planLimitMessage } from '../lib/plan-limit-error'

interface IngestionVariables {
  readonly repoFullName:  string
  readonly defaultBranch?: string
  readonly forceReindex?: boolean
  /** Project intent captured at add-time: build a new project, link to existing, or kb-only. */
  readonly projectIntent?: 'build' | 'link' | 'none'
  readonly targetProjectId?: string
}

export function useGitHubIngestion() {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const [needsUpgrade, setNeedsUpgrade] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)

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
      const limit = planLimitMessage(err)
      if (limit) {
        // Show the upgrade modal instead of an auto-dismissing error toast.
        setUpgradeMessage(limit)
        setNeedsUpgrade(true)
      } else {
        addToast('error', `Failed to queue repo: ${err.message}`)
      }
    },
  })

  return {
    ...mutation,
    needsUpgrade,
    upgradeMessage,
    dismissUpgrade: () => {
      setNeedsUpgrade(false)
      setUpgradeMessage(null)
    },
  }
}
