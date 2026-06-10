import { Link } from '@tanstack/react-router'
import { FolderOpen } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { SummaryGroup } from './workspace-shell'
import type { ProjectReference } from '../types/workspace'

/**
 * "Your project reference sheet" — the user's documented case-studies ranked
 * against this stage's topics (admin-api computes `research.topicProjectRefs`;
 * `researchToProjectRefs` flattens them). Each card deep-links to /projects/$id.
 * Falls back to a browse prompt when nothing matches yet.
 */
export function ProjectReferenceSheet({ refs }: { readonly refs: readonly ProjectReference[] }) {
  return (
    <SummaryGroup
      id="project-reference"
      title="Your project reference sheet"
      subtitle="The projects you're most likely to reference."
      count={refs.length > 0 ? refs.length : undefined}
    >
      {refs.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <FolderOpen className="size-6 text-zinc-400" aria-hidden />
          <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            No case-study matches this role&apos;s topics yet. Add or enrich your projects, then
            browse them directly.
          </p>
          <Link to="/projects" className="text-sm font-medium text-accent hover:underline">
            Browse all projects
          </Link>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {refs.map((ref) => (
            <Link
              key={ref.id}
              to="/projects/$id"
              params={{ id: ref.id }}
              className="flex flex-col gap-1.5 rounded-md border border-zinc-200 bg-white p-3 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-white/2 dark:hover:bg-white/5"
            >
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{ref.title}</span>
              {ref.pitch ? (
                <span className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{ref.pitch}</span>
              ) : null}
              {ref.highlights && ref.highlights.length > 0 ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {ref.highlights.map((h) => (
                    <span
                      key={h}
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                    >
                      {h}
                    </span>
                  ))}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </SummaryGroup>
  )
}
