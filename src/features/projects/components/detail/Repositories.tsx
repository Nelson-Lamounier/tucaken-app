import { FolderGit2 } from 'lucide-react'
import type { ProjectComponent, ProjectRepositoryLink } from '../../lib/types'
import { formatRelativeTime } from '../../lib/format'
import { EmptyHint, Section } from './Section'

/**
 * Which repositories make up this project, grouped by component. Surfaces the
 * per-repo last-sync time so the user can see what the case study was built
 * from — and pairs with the Hero staleness banner ("a repo changed, regenerate").
 */
export function Repositories({
  repositories,
  components,
  caseStudyGeneratedAt,
}: {
  readonly repositories: ProjectRepositoryLink[]
  readonly components: ProjectComponent[]
  readonly caseStudyGeneratedAt: string | null
}) {
  const componentName = new Map(components.map((c) => [c.id, c.name]))

  return (
    <Section
      icon={FolderGit2}
      title="Repositories"
      subtitle={`${repositories.length} ${repositories.length === 1 ? 'repository' : 'repositories'} in this project`}
    >
      {repositories.length === 0 ? (
        <EmptyHint>No repositories linked to this project yet.</EmptyHint>
      ) : (
        <ul className="space-y-1.5">
          {repositories.map((repo) => {
            const changed = isChangedSince(repo.last_synced_at, caseStudyGeneratedAt)
            return (
              <li
                key={`${repo.component_id}:${repo.repository_id}`}
                className="flex items-center justify-between gap-3 rounded-md bg-white/2 px-3 py-2 inset-ring inset-ring-white/10"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FolderGit2 className="size-3.5 shrink-0 text-zinc-500" />
                  <span className="truncate font-mono text-xs text-zinc-200">
                    {repo.repository_name}
                    {repo.subpath ? <span className="text-zinc-500">/{repo.subpath}</span> : null}
                  </span>
                  <span className="shrink-0 rounded-full bg-white/5 px-1.5 text-[10px] text-zinc-500">
                    {componentName.get(repo.component_id) ?? 'component'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px]">
                  {changed && (
                    <span className="rounded-full bg-amber-400/10 px-1.5 text-amber-300">
                      changed since generation
                    </span>
                  )}
                  <span className="text-zinc-500" title={repo.last_synced_at ?? undefined}>
                    {repo.last_synced_at ? `synced ${formatRelativeTime(repo.last_synced_at)}` : 'never synced'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

/** A repo "changed" relative to the case study when it synced strictly later. */
function isChangedSince(lastSyncedAt: string | null, generatedAt: string | null): boolean {
  if (!lastSyncedAt || !generatedAt) return false
  return new Date(lastSyncedAt).getTime() > new Date(generatedAt).getTime()
}
