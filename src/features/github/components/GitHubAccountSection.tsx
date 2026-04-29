import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Github, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { adminKeys } from '@/lib/api/query-keys'
import { disconnectGitHubFn } from '@/server/github'
import { useToastStore } from '@/lib/stores/toast-store'
import type { GitHubInstallation } from '@/lib/types/github.types'

interface GitHubAccountSectionProps {
  readonly installation: GitHubInstallation | null | undefined
  readonly isLoading: boolean
}

export function GitHubAccountSection({ installation, isLoading }: GitHubAccountSectionProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const appSlug = import.meta.env.VITE_GITHUB_APP_SLUG as string | undefined

  const disconnect = useMutation({
    mutationFn: () => disconnectGitHubFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.github.all })
      addToast('success', 'GitHub disconnected.')
    },
    onError: (err: Error) => {
      addToast('error', `Disconnect failed: ${err.message}`)
    },
  })

  const handleDisconnect = () => {
    if (!window.confirm('Disconnect GitHub? Existing connected repos will be removed from the knowledge base.')) return
    disconnect.mutate()
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading GitHub status…</span>
        </div>
      </div>
    )
  }

  if (!installation) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          GitHub Account
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
            <Github className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Connect your GitHub account</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Grant access so Bedrock can index your repositories
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
          <span className="text-xs text-zinc-500">No installation found</span>
          <Button
            variant="secondary"
            disabled={!appSlug}
            onClick={() => {
              window.location.href = `https://github.com/apps/${appSlug!}/installations/new`
            }}
            className="flex items-center gap-2"
          >
            <Github className="h-3.5 w-3.5" />
            Connect GitHub
          </Button>
        </div>
      </div>
    )
  }

  const initials = installation.accountLogin.slice(0, 2).toUpperCase()

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        GitHub Account
      </div>
      <div className="flex items-center gap-3">
        {installation.accountAvatarUrl ? (
          <img
            src={installation.accountAvatarUrl}
            alt={installation.accountLogin}
            className="h-9 w-9 rounded-full border border-white/10"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-600 text-xs font-bold text-white">
            {initials}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-zinc-100">{installation.accountLogin}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {installation.repositoryCount} repositories accessible via GitHub App
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs text-emerald-400">Connected</span>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
        <span className="text-xs text-zinc-500">
          {appSlug ? `Installed · github.com/apps/${appSlug}` : 'Installed'}
        </span>
        <Button
          variant="danger"
          onClick={handleDisconnect}
          disabled={disconnect.isPending}
        >
          {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
        </Button>
      </div>
    </div>
  )
}
