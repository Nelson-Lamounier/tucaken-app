'use client'

import { Link } from '@tanstack/react-router'
import { GitBranch } from 'lucide-react'
import { GitHubRepoChip } from '@/features/github/components/GitHubRepoChip'
import { GitHubSyncStatusBadge } from '@/features/github/components/GitHubSyncStatusBadge'
import type { ConnectedRepo } from '@/lib/types/github.types'

interface KbRepoListProps {
  readonly repos: ConnectedRepo[]
  readonly isLoading: boolean
}

export function KbRepoList({ repos, isLoading }: KbRepoListProps) {
  let content: React.ReactNode

  if (isLoading) {
    content = (
      <div className="rounded-xl border border-white/10 py-8 text-center text-xs text-zinc-600">
        Loading repositories…
      </div>
    )
  } else if (repos.length === 0) {
    content = (
      <div className="rounded-xl border border-dashed border-white/10 py-10 text-center">
        <GitBranch className="mx-auto mb-2 size-7 text-zinc-700" />
        <p className="text-sm text-zinc-500">No repositories connected</p>
        <Link
          to="/settings/github"
          search={{ tab: 'repositories' }}
          className="mt-1.5 inline-block text-xs text-teal-400 hover:text-teal-300"
        >
          Connect your first repo →
        </Link>
      </div>
    )
  } else {
    content = (
      <ul className="divide-y divide-white/6 rounded-xl border border-white/10">
        {repos.map((repo) => {
          const lastSynced = repo.lastSyncedAt
            ? new Date(repo.lastSyncedAt).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : null

          return (
            <li key={repo.repoFullName} className="flex items-center gap-3 px-4 py-3">
              <GitHubRepoChip fullName={repo.repoFullName} />
              <GitHubSyncStatusBadge status={repo.syncStatus} />
              {lastSynced && repo.syncStatus === 'complete' && (
                <span className="text-[10px] text-zinc-600">{lastSynced}</span>
              )}
              <span className="ml-auto text-[10px] text-zinc-700">— docs</span>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Connected Repositories</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Indexed into your knowledge base</p>
        </div>
        <Link
          to="/settings/github"
          search={{ tab: 'repositories' }}
          className="text-xs text-teal-400 transition-colors hover:text-teal-300"
        >
          Manage →
        </Link>
      </div>
      {content}
    </section>
  )
}
