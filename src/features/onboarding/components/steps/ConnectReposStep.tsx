import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GitHubConnectionCard } from '@/features/onboarding/components/onboarding/GitHubConnectionCard'
import { GitHubRepoPicker } from '@/features/github/components/GitHubRepoPicker'
import { GitHubConnectedRepos } from '@/features/github/components/GitHubConnectedRepos'
import { StepHeader } from '@/features/onboarding/components/onboarding/StepHeader'
import { COPY } from '@/features/onboarding/components/onboarding/content'
import type { GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'

const MAX_REPOS = 3

interface ConnectReposStepProps {
  readonly installation: GitHubInstallation | null | undefined
  readonly isLoadingInstallation: boolean
  readonly accessibleRepos: GitHubAccessibleRepo[] | undefined
  readonly isLoadingRepos: boolean
  readonly connectedRepos: ConnectedRepo[] | undefined
  readonly onNext: () => void
  /** When true, enforces the 3-repo cap and shows "Next: Start Indexing". */
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
  const connectedCount = connectedRepos?.length ?? 0
  const hasConnected = connectedCount > 0
  const nextLabel = hasConnected ? (enforceLimit ? 'Next: Start Indexing' : 'Next') : 'Add a repo to continue'
  // Body reveals only after the StepHeader typewriter finishes.
  const [introDone, setIntroDone] = useState(false)

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
            You can connect up to {MAX_REPOS} repositories during onboarding.
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
                accessibleRepos={accessibleRepos}
                isLoading={isLoadingRepos}
                connectedRepos={connectedRepos}
                maxRepos={enforceLimit ? MAX_REPOS : undefined}
              />
            )}
            {installation && <GitHubConnectedRepos connectedRepos={connectedRepos} />}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end pt-2 border-t border-white/10">
        <Button
          variant="primary"
          onClick={onNext}
          disabled={!hasConnected}
          className="flex items-center gap-1.5"
        >
          {nextLabel}
          {hasConnected && <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
