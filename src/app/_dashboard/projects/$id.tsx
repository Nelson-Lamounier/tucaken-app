import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { ProjectDetail } from '@/features/projects/components/detail/ProjectDetail'
import { projectsQueries } from '@/features/projects/server/queries'

export const Route = createFileRoute('/_dashboard/projects/$id')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(projectsQueries.detail(params.id))
  },
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { id } = Route.useParams()
  return (
    <DashboardPage title="Project" description="Case study generated from your GitHub work.">
      <Link
        to="/projects"
        className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="size-4" />
        Back to Projects
      </Link>
      <ProjectDetail projectId={id} />
    </DashboardPage>
  )
}
