import { Github } from 'lucide-react'
import type { GitHubRepo } from '@/lib/types/applications.types'

export function GitHubRepoChip({ repo }: { readonly repo: GitHubRepo }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-zinc-400">
      <Github className="h-3 w-3 shrink-0" />
      <span className="max-w-[100px] truncate">{repo.name}</span>
    </span>
  )
}
