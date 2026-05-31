import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { ProjectReference } from '../types/workspace'

/**
 * Compact card for one of the user's projects, deep-linking into the existing
 * Project case-study view (`/projects/$id`). See the Project Reference term in
 * src/features/applications/CONTEXT.md.
 */
export function ProjectReferenceCard({ project }: { readonly project: ProjectReference }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{project.title}</h4>
        <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{project.pitch}</p>
      </div>

      {project.highlights && project.highlights.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.highlights.map(h => (
            <span
              key={h}
              className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-white/5 dark:text-zinc-400"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      <Link
        to="/projects/$id"
        params={{ id: project.id }}
        className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        Open case study
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </Card>
  )
}
