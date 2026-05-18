import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { GitHubConnectionCard } from '@/features/onboarding/components/onboarding/GitHubConnectionCard'
import { GitHubRepoPicker } from '@/features/github/components/GitHubRepoPicker'
import { StepHeader } from '@/features/onboarding/components/onboarding/StepHeader'
import { COPY } from '@/features/onboarding/components/onboarding/content'
import { adminKeys } from '@/lib/api/query-keys'
import { removeConnectedRepoFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'
import type { GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'

const MAX_REPOS = 3

interface ConnectReposStepProps {
  readonly installation: GitHubInstallation | null | undefined
  readonly isLoadingInstallation: boolean
  readonly accessibleRepos: GitHubAccessibleRepo[] | undefined
  readonly isLoadingRepos: boolean
  readonly connectedRepos: ConnectedRepo[] | undefined
  readonly onNext: () => void
  /** When true, enforces the 3-repo cap during onboarding. */
  readonly enforceLimit?: boolean
}

export function ConnectReposStep({
  installation,
  isLoadingInstallation,
  accessibleRepos,
  isLoadingRepos,
  connectedRepos,
  onNext,
  enforceLimit = false,
}: ConnectReposStepProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const [introDone, setIntroDone] = useState(false)
  const [removingRepos, setRemovingRepos] = useState<Set<string>>(new Set())

  // Queued = repos connected but not yet syncing (deferSync).
  const queued = (connectedRepos ?? []).filter((r) => r.syncStatus === 'pending')
  const hasQueued = queued.length > 0

  const dequeue = useMutation({
    mutationFn: (repoFullName: string) => removeConnectedRepoFn({ data: { repoFullName } }),
    onMutate: (repoFullName) => {
      setRemovingRepos((prev) => new Set(prev).add(repoFullName))
    },
    onError: (err: Error, repoFullName) => {
      addToast('error', `Failed to remove ${repoFullName}: ${err.message}`)
    },
    onSettled: (_data, _err, repoFullName) => {
      setRemovingRepos((prev) => {
        const next = new Set(prev)
        next.delete(repoFullName)
        return next
      })
      // Only connected-repos changes on remove; accessible repos come from
      // the GitHub installation and are unaffected.
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() })
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <StepHeader
          eyebrow={COPY.repos.eyebrow}
          title={COPY.repos.title}
          sub={COPY.repos.sub}
          typewriter
          onTypingComplete={() => setIntroDone(true)}
        />
        {enforceLimit && (
          <p className="mt-1 text-xs text-zinc-600">
            Queue up to {MAX_REPOS} repositories. Indexing starts after you click "Start indexing".
          </p>
        )}
      </div>

      <AnimatePresence>
        {introDone && (
          <motion.div
            key="repos-body"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: 'transform, opacity' }}
            className="space-y-4"
          >
            <GitHubConnectionCard
              connected={!!installation}
              installation={installation}
              isLoading={isLoadingInstallation}
            />
            {installation && (
              <GitHubRepoPicker
                mode="queue"
                accessibleRepos={accessibleRepos}
                isLoading={isLoadingRepos}
                connectedRepos={connectedRepos}
                maxRepos={enforceLimit ? MAX_REPOS : undefined}
              />
            )}
            {installation && hasQueued && (
              <div className="flex flex-wrap gap-2">
                {queued.map((r) => (
                  <span
                    key={r.repoFullName}
                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200"
                  >
                    {r.repoFullName}
                    <button
                      type="button"
                      aria-label={`Remove ${r.repoFullName} from queue`}
                      onClick={() => dequeue.mutate(r.repoFullName)}
                      disabled={removingRepos.has(r.repoFullName)}
                      className="rounded-full p-0.5 text-indigo-300/70 transition hover:bg-indigo-500/20 hover:text-indigo-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end pt-2 border-t border-white/10">
        <Button
          variant="primary"
          onClick={onNext}
          disabled={!hasQueued}
          className="flex items-center gap-1.5"
        >
          {hasQueued ? 'Start indexing' : 'Add a repo to continue'}
          {hasQueued && <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
