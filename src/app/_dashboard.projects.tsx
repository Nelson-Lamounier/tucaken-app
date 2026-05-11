import { createFileRoute } from '@tanstack/react-router'
import { FolderOpen, Github, Globe } from 'lucide-react'
import { DashboardPage } from '@/components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/projects')({
  component: ProjectsPage,
})

function ProjectsPage() {
  return (
    <DashboardPage
      title="Projects"
      description="Browse and manage your portfolio projects."
    >
      <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
        <div className="grid size-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.02]">
          <FolderOpen className="size-8 text-zinc-500" strokeWidth={1.5} />
        </div>

        <div className="max-w-sm space-y-2">
          <h2 className="text-base font-semibold text-zinc-200">Projects coming soon</h2>
          <p className="text-sm leading-relaxed text-zinc-500">
            Projects will surface your GitHub repos as structured portfolio entries — linked to
            the skills and technologies Tucaken extracts from your commits and PRs.
          </p>
        </div>

        <div className="mt-2 flex items-center gap-3 text-xs text-zinc-600">
          <span className="flex items-center gap-1.5">
            <Github className="size-3.5" strokeWidth={1.75} /> Connect repos in{' '}
            <a href="/settings/github" className="text-teal-400 underline-offset-2 hover:underline">
              Database settings
            </a>
          </span>
          <span className="text-zinc-700">·</span>
          <span className="flex items-center gap-1.5">
            <Globe className="size-3.5" strokeWidth={1.75} /> Published to your portfolio site
          </span>
        </div>
      </div>
    </DashboardPage>
  )
}
