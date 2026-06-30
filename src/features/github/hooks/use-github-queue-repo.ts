import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { queueConnectedRepoFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'
import { planLimitMessage } from '../lib/plan-limit-error'

interface QueueVariables {
  readonly repoFullName:  string
  readonly defaultBranch?: string
  /** Project intent captured at add-time: build a new project, link to existing, or kb-only. */
  readonly projectIntent?: 'build' | 'link' | 'none'
  readonly targetProjectId?: string
}

// Queues a repo (deferSync) — connects it as 'pending' without dispatching
// the sync job. Same shape as useGitHubIngestion so GitHubRepoPicker can
// swap by mode.
export function useGitHubQueueRepo() {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const [needsUpgrade, setNeedsUpgrade] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)

  const mutation = useMutation<
    { status: string; repoFullName: string; jobName: string | null },
    Error,
    QueueVariables
  >({
    mutationFn: (data) => queueConnectedRepoFn({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.accessibleRepos() })
    },
    onError: (err) => {
      const limit = planLimitMessage(err)
      if (limit) {
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
