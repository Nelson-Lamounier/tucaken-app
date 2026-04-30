import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GitHubAccountSection } from '@/features/github/components/GitHubAccountSection'
import { GitHubRepoPicker } from '@/features/github/components/GitHubRepoPicker'
import { GitHubConnectedRepos } from '@/features/github/components/GitHubConnectedRepos'
import type { GitHubInstallation, GitHubAccessibleRepo, ConnectedRepo } from '@/lib/types/github.types'

interface ConnectReposStepProps {
  readonly installation: GitHubInstallation | null | undefined
  readonly isLoadingInstallation: boolean
  readonly accessibleRepos: GitHubAccessibleRepo[] | undefined
  readonly isLoadingRepos: boolean
  readonly connectedRepos: ConnectedRepo[] | undefined
  readonly onNext: () => void
}

export function ConnectReposStep({
  installation,
  isLoadingInstallation,
  accessibleRepos,
  isLoadingRepos,
  connectedRepos,
  onNext,
}: ConnectReposStepProps) {
  const hasConnected = (connectedRepos?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Connect your repositories</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Select which GitHub repos to index. Tucaken kicks off ingestion and enriches each previous
          role against your actual commit history.
        </p>
      </div>

      <div className="space-y-4">
        <GitHubAccountSection installation={installation} isLoading={isLoadingInstallation} />
        {installation && (
          <GitHubRepoPicker
            accessibleRepos={accessibleRepos}
            isLoading={isLoadingRepos}
            connectedRepos={connectedRepos}
          />
        )}
        {installation && <GitHubConnectedRepos connectedRepos={connectedRepos} />}
      </div>

      <div className="flex justify-end pt-2 border-t border-white/10">
        <Button
          variant="primary"
          onClick={onNext}
          disabled={!hasConnected}
          className="flex items-center gap-1.5"
        >
          {hasConnected ? 'Next: Generate Resume' : 'Add a repo to continue'}
          {hasConnected && <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
