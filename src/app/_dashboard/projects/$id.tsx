import { createFileRoute } from '@tanstack/react-router'
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
      <ProjectDetail projectId={id} />
    </DashboardPage>
  )
}
