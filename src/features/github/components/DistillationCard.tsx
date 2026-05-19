import { useToggleRepoFeatured } from '@/features/github/hooks/use-toggle-repo-featured'
import { cleanRepoTitle } from '@/features/github/lib/distill'
import type { ConnectedRepo } from '@/lib/types/github.types'

export function DistillationCard({ repo }: { readonly repo: ConnectedRepo }) {
  const { mutate, isPending } = useToggleRepoFeatured(repo.repoFullName)
  const featured = repo.isFeatured === true
  const highlights = repo.highlights ?? []
  const tech = [...new Set(repo.techStack ?? [])]

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="flex items-start gap-2">
        <h4 className="text-sm font-semibold text-zinc-100">{cleanRepoTitle(repo.name)}</h4>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-zinc-400">
          <input
            type="checkbox"
            checked={featured}
            disabled={isPending}
            onChange={e => mutate(e.target.checked)}
            className="accent-teal-500"
          />
          Use in resume
        </label>
      </div>

      {repo.oneLiner && (
        <p className="text-sm leading-relaxed text-zinc-400">{repo.oneLiner}</p>
      )}

      {highlights.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-zinc-300">
          {highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}

      {tech.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tech.map(t => (
            <span
              key={t}
              className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
